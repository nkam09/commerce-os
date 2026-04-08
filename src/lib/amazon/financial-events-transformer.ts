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
