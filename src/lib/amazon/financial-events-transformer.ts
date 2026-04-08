/**
 * Financial Events Transformer
 *
 * Combines the flattener and bucket mapper to produce RawFeeRow output
 * from SP API financial events. Aggregates by (asin, sku, marketplaceCode, date).
 *
 * sku is carried through so normalization can fall back to SKU lookup
 * when ASIN is absent from the SP API response.
 *
 * This module is pure: no DB access. Normalization (ASIN/SKU → productId)
 * happens in FinancialNormalizationService.
 */

import type { SpFinancialEvents } from "@/lib/amazon/sp-api-client";
import { flattenFinancialEvents } from "@/lib/amazon/financial-event-flattener";
import { mapFeeToBucket, isRevenueLikeCharge } from "@/lib/amazon/financial-event-bucket-mapper";

// ─── Output Types ─────────────────────────────────────────────────────────────

export type RawFeeRow = {
  asin: string;
  sku: string | null;              // seller SKU — used as fallback identifier
  marketplaceCode: string;
  date: Date;
  referralFee: number;
  fbaFee: number;
  storageFee: number;
  returnProcessingFee: number;
  otherFees: number;
};

type AggKey = string; // `${asin}::${sku}::${marketplaceCode}::${dateStr}`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function blank(): Omit<RawFeeRow, "asin" | "sku" | "marketplaceCode" | "date"> {
  return {
    referralFee: 0,
    fbaFee: 0,
    storageFee: 0,
    returnProcessingFee: 0,
    otherFees: 0,
  };
}

// ─── Main transformer ─────────────────────────────────────────────────────────

/**
 * Transforms a batch of SP API financial events into aggregated fee rows.
 *
 * Events without an ASIN are assigned asin="UNKNOWN". If sku is present
 * on those events, normalization can still resolve them via skuToProductId.
 *
 * TODO: Validate fee sign convention (negative = deduction from seller) live.
 */
// ─── Refund Output Types ─────────────────────────────────────────────────────

export type RawRefundRow = {
  asin: string;
  sku: string | null;
  marketplaceCode: string;
  date: Date;
  refundCount: number;
  refundAmount: number;
};

// ─── Refund transformer ──────────────────────────────────────────────────────

/**
 * Extracts refund data from financial events.
 *
 * Processes only events where eventSource === "refund" and captures the
 * revenue-like charges (Principal, etc.) that are SKIPPED by the fee pipeline.
 * These represent the money returned to the customer.
 *
 * Aggregates by (asin, marketplaceCode, date), summing amounts and counting
 * unique items (each Principal charge = 1 refunded unit).
 */
export function transformFinancialEventsToRefundRows(
  events: SpFinancialEvents,
  fallbackMarketplaceCode: string
): RawRefundRow[] {
  const flat = flattenFinancialEvents(events);
  const agg = new Map<AggKey, RawRefundRow>();

  for (const event of flat) {
    // Only process refund events, and only the revenue-like charges
    // (Principal = the item price refunded to the customer)
    if (event.eventSource !== "refund") continue;
    if (!isRevenueLikeCharge(event.chargeType)) continue;

    // Only count "Principal" charges as refund units — skip Tax, ShippingCharge, etc.
    const isPrincipal = event.chargeType.toLowerCase() === "principal";

    const asin = event.asin ?? "UNKNOWN";
    const sku = event.sku ?? null;
    const marketplaceCode = event.marketplaceId ?? fallbackMarketplaceCode;
    const dateStr = dateToStr(event.postedDate);
    const key: AggKey = `${asin}::${marketplaceCode}::${dateStr}`;

    if (!agg.has(key)) {
      agg.set(key, {
        asin,
        sku,
        marketplaceCode,
        date: event.postedDate,
        refundCount: 0,
        refundAmount: 0,
      });
    }

    const row = agg.get(key)!;
    // Refund amounts from Amazon are negative (money returned to buyer).
    // Store as positive so they can be subtracted in profit calcs.
    row.refundAmount += Math.abs(event.amount);
    if (isPrincipal) {
      row.refundCount += 1;
    }
  }

  return Array.from(agg.values());
}

// ─── Fee transformer ─────────────────────────────────────────────────────────

export function transformFinancialEventsToFeeRows(
  events: SpFinancialEvents,
  fallbackMarketplaceCode: string
): RawFeeRow[] {
  const flat = flattenFinancialEvents(events);
  const agg = new Map<AggKey, RawFeeRow>();

  for (const event of flat) {
    // Skip revenue-like charge types — we track revenue from orders, not settlements
    if (isRevenueLikeCharge(event.chargeType)) continue;

    const asin = event.asin ?? "UNKNOWN";
    const sku = event.sku ?? null;
    const marketplaceCode = event.marketplaceId ?? fallbackMarketplaceCode;
    const dateStr = dateToStr(event.postedDate);
    // Include sku in key so rows with same asin but different skus stay separate
    const key: AggKey = `${asin}::${sku ?? ""}::${marketplaceCode}::${dateStr}`;

    if (!agg.has(key)) {
      agg.set(key, {
        asin,
        sku,
        marketplaceCode,
        date: event.postedDate,
        ...blank(),
      });
    }

    const row = agg.get(key)!;
    const bucket = mapFeeToBucket(event.feeType);

    // Fee amounts from Amazon are typically negative (deductions).
    // We store absolute values so they can be subtracted in profit calcs.
    row[bucket] += Math.abs(event.amount);
  }

  return Array.from(agg.values());
}
