/**
 * Sync Settlement Refunds Job
 *
 * Downloads Amazon settlement reports (GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE)
 * and extracts exact refund amounts to write into daily_sales.
 *
 * Why settlement reports?
 *   - They contain the exact dollar amounts Amazon refunded to customers
 *   - This is the same data source Sellerboard uses for refund numbers
 *   - The return report (sync-returns) only has unit counts, not amounts
 *   - Financial events can lag 24-72 hours; settlement reports are definitive
 *
 * Settlement reports are Amazon-generated every ~2 weeks. They cannot be
 * requested on demand — we list existing reports via getReports and download
 * each one that's newer than our cursor.
 *
 * Flow:
 *   1. List settlement reports created since cursor date
 *   2. For each DONE report, download and parse it
 *   3. Extract refund rows (transaction-type="Refund", price-type="Principal")
 *   4. Extract fee adjustments (transaction-type="Refund", item-related-fee-type present)
 *   5. Resolve SKU → productId (settlements use SKU, not ASIN)
 *   6. Upsert into daily_sales: refundCount + refundAmount
 *   7. Apply fee adjustments to daily_fees (reduce fees by credited amounts)
 *   8. Upsert settlement fees into daily_fees (storage, disposal, subscription)
 *      — account-level fees (no SKU) are attributed to the first active product
 *
 * Cursor: ISO date string stored in SyncCursor(connectionId, "sync-settlement-refunds").
 * On first run, defaults to 90 days ago.
 *
 * IMPORTANT: Two-phase approach — all reports are downloaded and parsed first,
 * then all rows are written, preventing partial overwrites.
 */

import { prisma } from "@/lib/db/prisma";
import { getSpClientForUser } from "@/lib/amazon/get-sp-client-for-user";
import { parseSettlementReport } from "@/lib/amazon/settlement-report-parser";
import type {
  RawSettlementRefundRow,
  RawSettlementFeeAdjustment,
  RawSettlementFeeRow,
} from "@/lib/amazon/settlement-report-parser";
import { loadLookupMaps } from "@/lib/sync/sales-normalization-service";
import type { LookupMaps } from "@/lib/sync/sales-normalization-service";
import {
  getCursor,
  updateCursor,
  beginJobRun,
  completeJobRun,
  failJobRun,
} from "@/lib/sync/sync-orchestration-service";
import type { JobContext, JobResult } from "@/lib/jobs/job-types";

const JOB_NAME = "sync-settlement-refunds";

const REPORT_TYPE = "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE";

const INITIAL_LOOKBACK_DAYS = 90;

// ─── Normalization ───────────────────────────────────────────────────────────

type SettlementNormResult = {
  written: number;
  skippedUnknownSku: number;
  skippedUnknownMarketplace: number;
};

/**
 * Upserts settlement refund data into DailySale.
 * Writes BOTH refundCount AND refundAmount — these are the authoritative
 * values from settlement reports, replacing any estimates.
 *
 * Uses SKU → productId resolution (settlements use SKU, not ASIN).
 */
async function normalizeSettlementRefundRows(
  rows: RawSettlementRefundRow[],
  maps: LookupMaps
): Promise<SettlementNormResult> {
  let written = 0;
  let skippedUnknownSku = 0;
  let skippedUnknownMarketplace = 0;

  for (const row of rows) {
    // Settlements use SKU — resolve via skuToProductId
    const productId = maps.skuToProductId.get(row.sku);

    if (!productId) {
      skippedUnknownSku++;
      continue;
    }

    const marketplaceId = maps.codeToMarketplaceId.get(row.marketplaceCode);
    if (!marketplaceId) {
      skippedUnknownMarketplace++;
      continue;
    }

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
      },
      update: {
        refundCount: row.refundCount,
        refundAmount: row.refundAmount,
      },
    });

    written++;
  }

  return { written, skippedUnknownSku, skippedUnknownMarketplace };
}

// ─── Fee Adjustment Normalization ────────────────────────────────────────────

type FeeAdjNormResult = {
  applied: number;
  skippedNoFeeRow: number;
  skippedUnknownSku: number;
  skippedUnknownMarketplace: number;
};

/**
 * Applies refund fee adjustments to existing DailyFee rows.
 *
 * When Amazon refunds an order, they credit back some of the fees they
 * originally charged (referral fee, FBA fee, etc.). These credits need
 * to reduce the fee totals in daily_fees.
 *
 * Settlement fee amounts are signed:
 *   positive = Amazon credits money back to seller (reduces fees)
 *   negative = Amazon charges back (increases fees, rare)
 *
 * DailyFee stores fees as positive values (deductions), so:
 *   - A positive credit of $4.50 → SUBTRACT from referralFee
 *   - A negative charge of -$0.90 → ADD to referralFee (abs value)
 *
 * Only updates existing fee rows — if no DailyFee exists for that
 * date, the adjustment is skipped (fees haven't been synced yet).
 */
async function applyFeeAdjustments(
  rows: RawSettlementFeeAdjustment[],
  maps: LookupMaps
): Promise<FeeAdjNormResult> {
  let applied = 0;
  let skippedNoFeeRow = 0;
  let skippedUnknownSku = 0;
  let skippedUnknownMarketplace = 0;

  for (const row of rows) {
    const productId = maps.skuToProductId.get(row.sku);
    if (!productId) {
      skippedUnknownSku++;
      continue;
    }

    const marketplaceId = maps.codeToMarketplaceId.get(row.marketplaceCode);
    if (!marketplaceId) {
      skippedUnknownMarketplace++;
      continue;
    }

    // Only adjust if a fee row exists for this date
    const existing = await prisma.dailyFee.findUnique({
      where: {
        productId_marketplaceId_date: {
          productId,
          marketplaceId,
          date: row.date,
        },
      },
      select: {
        referralFee: true,
        fbaFee: true,
        otherFees: true,
      },
    });

    if (!existing) {
      skippedNoFeeRow++;
      continue;
    }

    // Subtract credits from fee totals (positive adj = credit = reduce fee)
    // Ensure fees don't go below zero
    const newReferralFee = Math.max(0, Number(existing.referralFee) - row.referralFeeAdj);
    const newFbaFee = Math.max(0, Number(existing.fbaFee) - row.fbaFeeAdj);
    const newOtherFees = Math.max(0, Number(existing.otherFees) - row.otherFeeAdj);

    await prisma.dailyFee.update({
      where: {
        productId_marketplaceId_date: {
          productId,
          marketplaceId,
          date: row.date,
        },
      },
      data: {
        referralFee: newReferralFee,
        fbaFee: newFbaFee,
        otherFees: newOtherFees,
      },
    });

    applied++;
  }

  return { applied, skippedNoFeeRow, skippedUnknownSku, skippedUnknownMarketplace };
}

// ─── Settlement Fee Normalization ────────────────────────────────────────────

type SettlementFeeNormResult = {
  written: number;
  storageTotal: number;
  disposalTotal: number;
  subscriptionTotal: number;
  otherTotal: number;
  skippedUnknownMarketplace: number;
  skippedNoProduct: number;
};

/**
 * Finds the first active product for a user to attribute account-level fees to.
 * These are bulk charges (storage, subscription) that have no SKU attribution,
 * so we pick one product as the "owner". The tiles service sums daily_fees
 * across all products for period totals, so the attribution is transparent
 * at the dashboard level.
 */
async function getFirstProductId(userId: string): Promise<string | null> {
  const product = await prisma.product.findFirst({
    where: { userId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return product?.id ?? null;
}

/**
 * Upserts settlement fee data into DailyFee.
 *
 * For rows WITH a SKU (disposal): resolves SKU → productId and adds fees
 * to the appropriate column of that product's DailyFee row.
 *
 * For rows WITHOUT a SKU (storage, subscription): attributes to the
 * fallback product (first active product). These are account-level charges
 * that can't be per-product attributed.
 *
 * Mapping:
 *   storageFee      → DailyFee.storageFee
 *   disposalFee     → DailyFee.otherFees
 *   subscriptionFee → DailyFee.otherFees
 *   otherFee        → DailyFee.otherFees
 *
 * Uses ADD semantics (existing value + new value) to avoid overwriting
 * fees written by sync-finances. For freshly-created rows, populates
 * only the settlement fee columns and zeros the rest.
 */
async function normalizeSettlementFeeRows(
  rows: RawSettlementFeeRow[],
  maps: LookupMaps,
  fallbackProductId: string | null
): Promise<SettlementFeeNormResult> {
  let written = 0;
  let storageTotal = 0;
  let disposalTotal = 0;
  let subscriptionTotal = 0;
  let otherTotal = 0;
  let skippedUnknownMarketplace = 0;
  let skippedNoProduct = 0;

  for (const row of rows) {
    let productId: string | undefined;

    if (row.sku) {
      productId = maps.skuToProductId.get(row.sku);
    }
    if (!productId) {
      productId = fallbackProductId ?? undefined;
    }
    if (!productId) {
      skippedNoProduct++;
      continue;
    }

    const marketplaceId = maps.codeToMarketplaceId.get(row.marketplaceCode);
    if (!marketplaceId) {
      skippedUnknownMarketplace++;
      continue;
    }

    const storageAdd = row.storageFee;
    // disposal + subscription + other all go into otherFees
    const otherAdd = row.disposalFee + row.subscriptionFee + row.otherFee;

    if (storageAdd === 0 && otherAdd === 0) continue;

    const existing = await prisma.dailyFee.findUnique({
      where: {
        productId_marketplaceId_date: {
          productId,
          marketplaceId,
          date: row.date,
        },
      },
      select: {
        referralFee: true,
        fbaFee: true,
        storageFee: true,
        returnProcessingFee: true,
        otherFees: true,
      },
    });

    if (existing) {
      await prisma.dailyFee.update({
        where: {
          productId_marketplaceId_date: {
            productId,
            marketplaceId,
            date: row.date,
          },
        },
        data: {
          storageFee: Number(existing.storageFee) + storageAdd,
          otherFees: Number(existing.otherFees) + otherAdd,
        },
      });
    } else {
      await prisma.dailyFee.create({
        data: {
          productId,
          marketplaceId,
          date: row.date,
          referralFee: 0,
          fbaFee: 0,
          storageFee: storageAdd,
          returnProcessingFee: 0,
          otherFees: otherAdd,
        },
      });
    }

    written++;
    storageTotal += row.storageFee;
    disposalTotal += row.disposalFee;
    subscriptionTotal += row.subscriptionFee;
    otherTotal += row.otherFee;
  }

  return {
    written,
    storageTotal,
    disposalTotal,
    subscriptionTotal,
    otherTotal,
    skippedUnknownMarketplace,
    skippedNoProduct,
  };
}

// ─── Main Job ────────────────────────────────────────────────────────────────

export async function syncSettlementRefundsJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.spConnectionId, JOB_NAME);

  console.log(`[sync-settlement-refunds] starting`);

  try {
    const client = getSpClientForUser();
    const maps = await loadLookupMaps(ctx.userId);
    const cursor = await getCursor(ctx.spConnectionId, JOB_NAME);

    // On first run (cursor is epoch), look back 90 days
    const cursorDate = new Date(cursor);
    const ninetyDaysAgo = new Date(Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const effectiveSince = cursorDate < ninetyDaysAgo ? ninetyDaysAgo.toISOString() : cursor;

    console.log(
      `[sync-settlement-refunds] cursor=${cursor} effectiveSince=${effectiveSince} marketplace=${ctx.marketplace.code}`
    );

    // ── Phase 1: List and download all settlement reports since cursor ──

    type ReportEntry = {
      reportId: string;
      reportDocumentId?: string;
      processingStatus: string;
      createdTime: string;
    };

    const allReports: ReportEntry[] = [];
    let nextToken: string | undefined;

    do {
      const page = await client.getReports({
        reportTypes: [REPORT_TYPE],
        createdSince: effectiveSince,
        marketplaceIds: [ctx.marketplace.code],
        nextToken,
        pageSize: 100,
      });

      allReports.push(...page.reports);
      nextToken = page.nextToken;
    } while (nextToken);

    // Filter to only DONE reports with a document ID
    const doneReports = allReports.filter(
      (r) => r.processingStatus === "DONE" && r.reportDocumentId
    );

    console.log(
      `[sync-settlement-refunds] found ${allReports.length} reports, ${doneReports.length} DONE with documents`
    );

    if (doneReports.length === 0) {
      await completeJobRun(runId, { fetchedCount: 0, writtenCount: 0 });
      return { fetchedCount: 0, writtenCount: 0, notes: "no settlement reports found" };
    }

    // Download and parse all reports, collecting refund rows, fee adjustments,
    // and settlement fee rows (storage, disposal, subscription)
    const allRefundRows: RawSettlementRefundRow[] = [];
    const allFeeAdjustments: RawSettlementFeeAdjustment[] = [];
    const allFeeRows: RawSettlementFeeRow[] = [];
    let totalLines = 0;
    let totalRefundLines = 0;
    let totalFeeAdjLines = 0;
    let totalFeeRowLines = 0;
    let latestCreatedTime = cursor;

    for (const report of doneReports) {
      console.log(
        `[sync-settlement-refunds] downloading report ${report.reportId} (created ${report.createdTime})`
      );

      const doc = await client.getReportDocument(report.reportDocumentId!);
      const text = await client.downloadReportDocument(
        doc.url,
        doc.compressionAlgorithm
      );

      const parsed = parseSettlementReport(text, ctx.marketplace.code);

      console.log(
        `[sync-settlement-refunds] report ${report.reportId}: ` +
          `settlement=${parsed.settlementId}, ${parsed.totalLines} lines, ` +
          `${parsed.refundLines} refund lines → ${parsed.refundRows.length} aggregated rows, ` +
          `${parsed.feeAdjLines} fee adj lines → ${parsed.feeAdjustments.length} fee adj rows, ` +
          `${parsed.feeRowLines} settlement fee lines → ${parsed.feeRows.length} fee rows` +
          (parsed.skippedNoSku > 0 ? ` (skipped ${parsed.skippedNoSku} without SKU)` : "")
      );

      allRefundRows.push(...parsed.refundRows);
      allFeeAdjustments.push(...parsed.feeAdjustments);
      allFeeRows.push(...parsed.feeRows);
      totalLines += parsed.totalLines;
      totalRefundLines += parsed.refundLines;
      totalFeeAdjLines += parsed.feeAdjLines;
      totalFeeRowLines += parsed.feeRowLines;

      // Track the latest report creation time for cursor advancement
      if (report.createdTime > latestCreatedTime) {
        latestCreatedTime = report.createdTime;
      }
    }

    // ── Phase 2: Normalize and upsert all refund rows ──────────────────

    console.log(
      `[sync-settlement-refunds] upserting ${allRefundRows.length} aggregated refund rows from ${doneReports.length} reports`
    );

    let totalWritten = 0;

    if (allRefundRows.length > 0) {
      const result = await normalizeSettlementRefundRows(allRefundRows, maps);
      totalWritten = result.written;

      if (result.skippedUnknownSku > 0) {
        console.log(
          `[sync-settlement-refunds] skipped ${result.skippedUnknownSku} rows with unknown SKUs`
        );
      }

      if (result.skippedUnknownMarketplace > 0) {
        console.log(
          `[sync-settlement-refunds] skipped ${result.skippedUnknownMarketplace} rows with unknown marketplace`
        );
      }
    }

    // ── Phase 3: Apply fee adjustments to daily_fees ─────────────────

    let totalFeeAdjApplied = 0;

    if (allFeeAdjustments.length > 0) {
      console.log(
        `[sync-settlement-refunds] applying ${allFeeAdjustments.length} fee adjustment rows`
      );

      const feeResult = await applyFeeAdjustments(allFeeAdjustments, maps);
      totalFeeAdjApplied = feeResult.applied;

      console.log(
        `[sync-settlement-refunds] applied ${feeResult.applied} fee adjustments` +
          (feeResult.skippedNoFeeRow > 0 ? `, skipped ${feeResult.skippedNoFeeRow} (no fee row)` : "") +
          (feeResult.skippedUnknownSku > 0 ? `, skipped ${feeResult.skippedUnknownSku} (unknown SKU)` : "")
      );
    }

    // ── Phase 4: Apply settlement fees (storage, disposal, subscription) ──

    let totalFeeRowsWritten = 0;
    let storageTotal = 0;
    let disposalTotal = 0;
    let subscriptionTotal = 0;
    let otherFeeTotal = 0;

    if (allFeeRows.length > 0) {
      console.log(
        `[sync-settlement-refunds] applying ${allFeeRows.length} settlement fee rows`
      );

      const fallbackProductId = await getFirstProductId(ctx.userId);

      if (!fallbackProductId) {
        console.log(
          `[sync-settlement-refunds] no fallback product found — account-level fees will be skipped`
        );
      }

      const feeRowResult = await normalizeSettlementFeeRows(
        allFeeRows,
        maps,
        fallbackProductId
      );

      totalFeeRowsWritten = feeRowResult.written;
      storageTotal = feeRowResult.storageTotal;
      disposalTotal = feeRowResult.disposalTotal;
      subscriptionTotal = feeRowResult.subscriptionTotal;
      otherFeeTotal = feeRowResult.otherTotal;

      console.log(
        `[sync-settlement-refunds] applied ${feeRowResult.written} settlement fee rows ` +
          `(storage: $${storageTotal.toFixed(2)}, ` +
          `disposal: $${disposalTotal.toFixed(2)}, ` +
          `subscription: $${subscriptionTotal.toFixed(2)}, ` +
          `other: $${otherFeeTotal.toFixed(2)})` +
          (feeRowResult.skippedNoProduct > 0
            ? `, skipped ${feeRowResult.skippedNoProduct} (no product)`
            : "") +
          (feeRowResult.skippedUnknownMarketplace > 0
            ? `, skipped ${feeRowResult.skippedUnknownMarketplace} (unknown marketplace)`
            : "")
      );
    }

    console.log(
      `[sync-settlement-refunds] done: ${doneReports.length} reports, ` +
        `${totalRefundLines} refund lines → ${totalWritten} rows written, ` +
        `${totalFeeAdjLines} fee adj lines → ${totalFeeAdjApplied} applied, ` +
        `${totalFeeRowLines} settlement fee lines → ${totalFeeRowsWritten} applied`
    );

    // Advance cursor to the latest report creation time
    await updateCursor(ctx.spConnectionId, JOB_NAME, latestCreatedTime);

    await completeJobRun(runId, {
      fetchedCount: totalLines,
      writtenCount: totalWritten,
    });

    return {
      fetchedCount: totalLines,
      writtenCount: totalWritten,
      nextCursor: latestCreatedTime,
      notes:
        `${doneReports.length} settlement reports, ` +
        `${totalRefundLines} refund lines, ` +
        `${totalFeeAdjApplied} fee adjustments, ` +
        `${totalFeeRowsWritten} settlement fees ` +
        `(storage: $${storageTotal.toFixed(2)}, ` +
        `disposal: $${disposalTotal.toFixed(2)}, ` +
        `subscription: $${subscriptionTotal.toFixed(2)})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(runId, msg);
    throw err;
  }
}
