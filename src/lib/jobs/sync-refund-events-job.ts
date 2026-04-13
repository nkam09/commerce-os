/**
 * Sync Refund Events Job
 *
 * Fetches refund events from the SP-API Financial Events endpoint for
 * near-real-time refund detection (like Sellerboard).
 *
 * This job ONLY handles refunds — no fees, sales, or other financial data.
 *
 * Data hierarchy (provisional → authoritative):
 *   1. sync-returns         — FBA physical returns (provisional)
 *   2. sync-refund-events   — Financial Events refunds (provisional, more complete)
 *   3. sync-settlement-refunds — Settlement reports (authoritative, overwrites)
 *
 * Provisional logic: only write refund data when the existing row has
 * refundCount = 0 (no settlement data yet). Once settlement data arrives
 * via sync-settlement-refunds, it overwrites with authoritative numbers.
 *
 * Cursor: ISO date string stored in SyncCursor(connectionId, "sync-refund-events").
 * On first run, defaults to 7 days ago.
 */

import { prisma } from "@/lib/db/prisma";
import { getSpClientForUser } from "@/lib/amazon/get-sp-client-for-user";
import { loadLookupMaps } from "@/lib/sync/sales-normalization-service";
import {
  getCursor,
  updateCursor,
  beginJobRun,
  completeJobRun,
  failJobRun,
} from "@/lib/sync/sync-orchestration-service";
import type { JobContext, JobResult } from "@/lib/jobs/job-types";
import type { SpFinancialEvents, SpShipmentItem } from "@/lib/amazon/sp-api-client";

const JOB_NAME = "sync-refund-events";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert ISO timestamp to UTC-date-only Date (no time component). */
function toUtcDateOnly(isoString?: string): Date {
  if (!isoString) return new Date(0);
  const d = new Date(isoString);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Parsed refund row from a single refund event item.
 */
type RefundItem = {
  asin: string | null;
  sku: string | null;
  marketplaceCode: string | null;
  date: Date;
  refundCount: number;       // units refunded (QuantityShipped)
  refundAmount: number;      // absolute value of Principal charges
  refundCommission: number;  // absolute value of Commission fee adjustments
  refundedReferralFee: number; // absolute value of RefundCommission/ReferralFee fee adjustments
};

/**
 * Extract refund items from RefundEventList.
 *
 * Each refund event has ShipmentItemList (despite the name, these are
 * adjustment items on refund events). We extract:
 * - refundAmount from ItemChargeList where ChargeType = "Principal"
 * - refundCommission from ItemFeeList where FeeType = "Commission"
 * - refundedReferralFee from ItemFeeList where FeeType includes "RefundCommission" or "ReferralFee"
 */
function extractRefundItems(
  events: SpFinancialEvents,
  fallbackMarketplaceCode: string
): RefundItem[] {
  const results: RefundItem[] = [];

  for (const event of events.RefundEventList ?? []) {
    const date = toUtcDateOnly(event.PostedDate);
    const marketplaceCode =
      (event as Record<string, unknown>)["MarketplaceId"] as string | null ??
      fallbackMarketplaceCode;

    for (const item of event.ShipmentItemList ?? []) {
      const asin = item.ASIN ?? null;
      const sku = item.SellerSKU ?? null;
      const qty = (item as Record<string, unknown>).QuantityShipped as number | undefined ?? 1;

      let refundAmount = 0;
      let refundCommission = 0;
      let refundedReferralFee = 0;

      // Sum Principal charges (item price refunded to customer)
      for (const charge of item.ItemChargeList ?? []) {
        if (charge.ChargeType === "Principal") {
          // Refund amounts are negative from Amazon; store as positive
          refundAmount += Math.abs(charge.ChargeAmount.CurrencyAmount ?? 0);
        }
      }

      // Extract fee adjustments
      for (const fee of item.ItemFeeList ?? []) {
        const feeType = fee.FeeType ?? "";
        const amount = Math.abs(fee.FeeAmount.CurrencyAmount ?? 0);

        if (feeType === "Commission") {
          refundCommission += amount;
        } else if (feeType === "RefundCommission" || feeType === "ReferralFee") {
          refundedReferralFee += amount;
        }
      }

      results.push({
        asin,
        sku,
        marketplaceCode,
        date,
        refundCount: qty,
        refundAmount,
        refundCommission,
        refundedReferralFee,
      });
    }
  }

  return results;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

type AggKey = string; // `${asin}::${sku}::${marketplaceCode}::${dateStr}`

type AggRefundRow = {
  asin: string;
  sku: string | null;
  marketplaceCode: string;
  date: Date;
  refundCount: number;
  refundAmount: number;
  refundCommission: number;
  refundedReferralFee: number;
};

/** Aggregate items by (asin, marketplace, date). */
function aggregateRefundItems(items: RefundItem[]): AggRefundRow[] {
  const agg = new Map<AggKey, AggRefundRow>();

  for (const item of items) {
    const asin = item.asin ?? "UNKNOWN";
    const mkt = item.marketplaceCode ?? "";
    const dateStr = item.date.toISOString().slice(0, 10);
    const key: AggKey = `${asin}::${mkt}::${dateStr}`;

    if (!agg.has(key)) {
      agg.set(key, {
        asin,
        sku: item.sku,
        marketplaceCode: mkt,
        date: item.date,
        refundCount: 0,
        refundAmount: 0,
        refundCommission: 0,
        refundedReferralFee: 0,
      });
    }

    const row = agg.get(key)!;
    row.refundCount += item.refundCount;
    row.refundAmount += item.refundAmount;
    row.refundCommission += item.refundCommission;
    row.refundedReferralFee += item.refundedReferralFee;
  }

  return Array.from(agg.values());
}

// ─── Main Job ────────────────────────────────────────────────────────────────

export async function syncRefundEventsJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.spConnectionId, JOB_NAME);

  try {
    const client = getSpClientForUser();
    const maps = await loadLookupMaps(ctx.userId);

    // Default cursor: 7 days ago
    const rawCursor = await getCursor(ctx.spConnectionId, JOB_NAME);
    const cursor =
      rawCursor ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[sync-refund-events] cursor=${cursor}`);

    let totalFetched = 0;
    let totalWritten = 0;
    let totalSkippedSettlement = 0;
    let totalSkippedUnknown = 0;
    let nextToken: string | undefined;
    const newCursor = new Date().toISOString();

    // ── Phase 1: Fetch all pages of financial events ─────────────────────

    const allRefundItems: RefundItem[] = [];

    do {
      const page = await client.getFinancialEvents({
        postedAfter: cursor,
        nextToken,
      });

      const events = page.FinancialEvents;
      nextToken = page.NextToken;

      const refundEventCount = (events.RefundEventList ?? []).length;
      totalFetched += refundEventCount;

      // Extract refund items only — ignore everything else
      const items = extractRefundItems(events, ctx.marketplace.code);
      allRefundItems.push(...items);

      console.log(
        `[sync-refund-events] page: ${refundEventCount} refund events → ${items.length} line items`
      );
    } while (nextToken);

    console.log(
      `[sync-refund-events] total: ${totalFetched} refund events, ${allRefundItems.length} line items`
    );

    // ── Phase 2: Aggregate and write ─────────────────────────────────────

    const aggregated = aggregateRefundItems(allRefundItems);

    for (const row of aggregated) {
      // Resolve productId: try ASIN first, then SKU fallback
      let productId: string | undefined;

      if (row.asin && row.asin !== "UNKNOWN") {
        productId = maps.asinToProductId.get(row.asin);
      }
      if (!productId && row.sku) {
        productId = maps.skuToProductId.get(row.sku);
      }
      if (!productId) {
        totalSkippedUnknown++;
        continue;
      }

      const marketplaceId = maps.codeToMarketplaceId.get(row.marketplaceCode);
      if (!marketplaceId) {
        totalSkippedUnknown++;
        continue;
      }

      // ── Provisional check: only write if settlement hasn't arrived ────
      // Look up the existing row; if refundCount > 0, settlement data
      // (from sync-settlement-refunds) is already present — skip.
      const existing = await prisma.dailySale.findUnique({
        where: {
          productId_marketplaceId_date: {
            productId,
            marketplaceId,
            date: row.date,
          },
        },
        select: { refundCount: true },
      });

      if (existing && existing.refundCount > 0) {
        totalSkippedSettlement++;
        continue;
      }

      // Upsert provisional refund data
      await prisma.dailySale.upsert({
        where: {
          productId_marketplaceId_date: {
            productId,
            marketplaceId,
            date: row.date,
          },
        },
        create: {
          productId,
          marketplaceId,
          date: row.date,
          unitsSold: 0,
          orderCount: 0,
          grossSales: 0,
          refundCount: row.refundCount,
          refundAmount: row.refundAmount,
          refundCommission: row.refundCommission,
          refundedReferralFee: row.refundedReferralFee,
        },
        update: {
          refundCount: row.refundCount,
          refundAmount: row.refundAmount,
          refundCommission: row.refundCommission,
          refundedReferralFee: row.refundedReferralFee,
        },
      });

      totalWritten++;
    }

    console.log(
      `[sync-refund-events] results: ${totalWritten} written, ` +
        `${totalSkippedSettlement} skipped (settlement exists), ` +
        `${totalSkippedUnknown} skipped (unknown ASIN/marketplace)`
    );

    await updateCursor(ctx.spConnectionId, JOB_NAME, newCursor);
    await completeJobRun(runId, {
      fetchedCount: totalFetched,
      writtenCount: totalWritten,
    });

    return {
      fetchedCount: totalFetched,
      writtenCount: totalWritten,
      nextCursor: newCursor,
      notes: `${totalSkippedSettlement} skipped (settlement exists)`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(runId, msg);
    throw err;
  }
}
