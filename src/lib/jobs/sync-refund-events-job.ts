/**
 * Sync Refund Events Job
 *
 * PRIMARY refund source. Fetches refund events from the SP-API Financial Events
 * endpoint and attributes them by PostedDate (America/Los_Angeles) â€” the same
 * convention Sellerboard uses.
 *
 * This job ONLY handles refunds â€” no fees, sales, or other financial data.
 *
 * Data hierarchy:
 *   1. sync-refund-events     â€” PRIMARY (Financial Events API, near-real-time)
 *   2. sync-settlement-refunds â€” AUTHORITATIVE (settlements, overwrites when they arrive)
 *
 * Write semantics: OVERWRITE. This job is the primary source, so every write
 * replaces any previously written refund values for (productId, marketplace, date).
 * Settlement refunds arrive later (~2 weeks) and overwrite again with authoritative
 * dollar amounts.
 *
 * Field mapping (refund events use ADJUSTMENT variants):
 *   event.ShipmentItemAdjustmentList[]
 *     .SellerSKU                                       â†’ sku
 *     .QuantityShipped                                 â†’ refundCount
 *     .ItemChargeAdjustmentList[].ChargeType=Principal â†’ refundAmount (abs)
 *     .ItemFeeAdjustmentList[].FeeType=Commission      â†’ refundedReferralFee (abs)  // referral fee refunded back
 *     .ItemFeeAdjustmentList[].FeeType=RefundCommission â†’ refundCommission (abs)      // commission Amazon charges for refund
 *
 * Cursor: ISO date string in SyncCursor(connectionId, "sync-refund-events").
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
import type { SpFinancialEvents } from "@/lib/amazon/sp-api-client";

const JOB_NAME = "sync-refund-events";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Convert an ISO timestamp to a UTC-date-only Date representing the
 * calendar date in America/Los_Angeles (same attribution as orders/Sellerboard).
 */
function toPacificDateOnly(isoString: string): Date {
  const pacificStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
  const [y, m, d] = pacificStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

type AdjustmentCharge = {
  ChargeType?: string;
  ChargeAmount?: { CurrencyCode?: string; CurrencyAmount?: number };
};

type AdjustmentFee = {
  FeeType?: string;
  FeeAmount?: { CurrencyCode?: string; CurrencyAmount?: number };
};

type ShipmentItemAdjustment = {
  SellerSKU?: string;
  ASIN?: string;
  QuantityShipped?: number;
  ItemChargeAdjustmentList?: AdjustmentCharge[];
  ItemFeeAdjustmentList?: AdjustmentFee[];
};

type RefundItem = {
  asin: string | null;
  sku: string | null;
  marketplaceCode: string | null;
  date: Date;
  refundCount: number;       // units refunded (QuantityShipped)
  refundAmount: number;      // abs(Principal charges)
  refundCommission: number;  // abs(RefundCommission fee) â€” commission Amazon charges for refund
  refundedReferralFee: number; // abs(Commission fee) â€” referral fee refunded back to seller
};

/**
 * Extract refund items from RefundEventList.
 *
 * Refund events use ADJUSTMENT variants of all list names. Field meanings:
 *   - Principal charges are negative (customer got money back) â†’ take abs
 *   - Commission fee = the referral fee refunded back to the seller â†’ refundedReferralFee (abs)
 *   - RefundCommission fee = what Amazon charges the seller for processing the refund â†’ refundCommission (abs)
 */
function extractRefundItems(
  events: SpFinancialEvents,
  fallbackMarketplaceCode: string
): RefundItem[] {
  const results: RefundItem[] = [];

  for (const event of events.RefundEventList ?? []) {
    if (!event.PostedDate) continue;
    const date = toPacificDateOnly(event.PostedDate);

    const eventAny = event as Record<string, unknown>;
    const marketplaceCode =
      (eventAny["MarketplaceId"] as string | undefined) ??
      fallbackMarketplaceCode;

    const items =
      (eventAny["ShipmentItemAdjustmentList"] as ShipmentItemAdjustment[] | undefined) ??
      [];

    for (const item of items) {
      const asin = item.ASIN ?? null;
      const sku = item.SellerSKU ?? null;
      const qty = item.QuantityShipped ?? 1;

      let refundAmount = 0;
      let refundCommission = 0;
      let refundedReferralFee = 0;

      for (const charge of item.ItemChargeAdjustmentList ?? []) {
        if (charge.ChargeType === "Principal") {
          refundAmount += Math.abs(charge.ChargeAmount?.CurrencyAmount ?? 0);
        }
      }

      for (const fee of item.ItemFeeAdjustmentList ?? []) {
        const feeType = fee.FeeType ?? "";
        const amount = fee.FeeAmount?.CurrencyAmount ?? 0;

        if (feeType === "Commission") {
          // Commission = the referral fee refunded back to the seller
          refundedReferralFee += Math.abs(amount);
        } else if (feeType === "RefundCommission") {
          // RefundCommission = the commission Amazon charges for processing the refund
          refundCommission += Math.abs(amount);
        }
      }

      // Skip free replacements ( refund) - Sellerboard excludes these
      if (refundAmount === 0) continue;


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

// â”€â”€â”€ Aggregation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AggKey = string;

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

// â”€â”€â”€ Main Job â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    let totalSkippedUnknown = 0;
    let nextToken: string | undefined;
    const newCursor = new Date().toISOString();

    // â”€â”€ Phase 1: Fetch all pages of financial events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      const items = extractRefundItems(events, ctx.marketplace.code);
      allRefundItems.push(...items);

      console.log(
        `[sync-refund-events] page: ${refundEventCount} refund events â†’ ${items.length} line items`
      );
    } while (nextToken);

    console.log(
      `[sync-refund-events] total: ${totalFetched} refund events, ${allRefundItems.length} line items`
    );

    // â”€â”€ Phase 2: Aggregate and OVERWRITE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      // OVERWRITE semantics: refund-events is the primary source. Always write.
      // Settlement refunds will overwrite this data later when settlements arrive.
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

      console.log(
        `[sync-refund-events] wrote date=${row.date.toISOString().slice(0, 10)} ` +
          `asin=${row.asin} count=${row.refundCount} amount=${row.refundAmount.toFixed(2)} ` +
          `source=financial-events`
      );

      totalWritten++;
    }

    console.log(
      `[sync-refund-events] results: ${totalWritten} written, ` +
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
      notes: `overwrite semantics â€” primary refund source`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(runId, msg);
    throw err;
  }
}

