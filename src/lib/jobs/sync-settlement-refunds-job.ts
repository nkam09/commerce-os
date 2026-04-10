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
 *   3. Extract refund rows (transaction-type="Refund", price-type="Principal"),
 *      including refundCommission + refundedReferralFee from fee-type lines
 *   4. Resolve SKU → productId (settlements use SKU, not ASIN)
 *   5. Upsert into daily_sales: refundCount + refundAmount + refundCommission
 *      + refundedReferralFee
 *   6. Upsert settlement fees into daily_fees (storage, disposal, subscription)
 *      — account-level fees (no SKU) are attributed to the first active product
 *   7. Upsert promo amounts (Principal type only) into daily_sales.promoAmount
 *   8. Upsert reversal reimbursements into daily_fees.reimbursement
 *
 * Cursor: JSON object stored in SyncCursor(connectionId, "sync-settlement-refunds").
 *   {
 *     "createdSince": "2026-04-06T16:00:00Z",
 *     "processedSettlementIds": ["25861519391", "26017238411", ...]
 *   }
 * Falls back to treating the cursor as a plain ISO timestamp string for
 * backwards compatibility with the pre-JSON format.
 *
 * On first run, createdSince defaults to 90 days ago.
 *
 * Why track processedSettlementIds:
 *   Phase 3 (settlement fees) and Phase 5 (reimbursements) use add-to-
 *   existing semantics, which are NOT idempotent. To make the cursor 24h
 *   rewind safe, we track every settlement-id we've already processed and
 *   skip it on the next run.
 *   The list is naturally bounded: we only keep IDs that still appear in
 *   the current listing window (≤ 90 days), so old entries self-prune.
 *
 * IMPORTANT: Two-phase approach — all reports are downloaded and parsed first,
 * then all rows are written, preventing partial overwrites.
 */

import { prisma } from "@/lib/db/prisma";
import { getSpClientForUser } from "@/lib/amazon/get-sp-client-for-user";
import { parseSettlementReport } from "@/lib/amazon/settlement-report-parser";
import type {
  RawSettlementRefundRow,
  RawSettlementFeeRow,
  RawSettlementPromoRow,
  RawSettlementReimbursementRow,
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

    written++;
  }

  return { written, skippedUnknownSku, skippedUnknownMarketplace };
}

// ─── Settlement Fee Normalization ────────────────────────────────────────────

type SettlementFeeNormResult = {
  written: number;
  storageTotal: number;
  awdStorageTotal: number;
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
 *   awdStorageFee   → DailyFee.awdStorageFee
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
  let awdStorageTotal = 0;
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
    const awdStorageAdd = row.awdStorageFee;
    // disposal + subscription + other all go into otherFees
    const otherAdd = row.disposalFee + row.subscriptionFee + row.otherFee;

    if (storageAdd === 0 && awdStorageAdd === 0 && otherAdd === 0) continue;

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
        awdStorageFee: true,
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
          awdStorageFee: Number(existing.awdStorageFee) + awdStorageAdd,
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
          awdStorageFee: awdStorageAdd,
          returnProcessingFee: 0,
          otherFees: otherAdd,
        },
      });
    }

    written++;
    storageTotal += row.storageFee;
    awdStorageTotal += row.awdStorageFee;
    disposalTotal += row.disposalFee;
    subscriptionTotal += row.subscriptionFee;
    otherTotal += row.otherFee;
  }

  return {
    written,
    storageTotal,
    awdStorageTotal,
    disposalTotal,
    subscriptionTotal,
    otherTotal,
    skippedUnknownMarketplace,
    skippedNoProduct,
  };
}

// ─── Promo Normalization ────────────────────────────────────────────────────

type PromoNormResult = {
  written: number;
  promoTotal: number;
  skippedUnknownSku: number;
  skippedUnknownMarketplace: number;
};

/**
 * Upserts settlement promo amounts (coupons/discounts) into DailySale.promoAmount.
 * Uses authoritative overwrite semantics — settlement report is the source of truth.
 */
async function normalizeSettlementPromoRows(
  rows: RawSettlementPromoRow[],
  maps: LookupMaps
): Promise<PromoNormResult> {
  let written = 0;
  let promoTotal = 0;
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

    await prisma.dailySale.upsert({
      where: {
        productId_marketplaceId_date: { productId, marketplaceId, date: row.date },
      },
      create: {
        productId,
        marketplaceId,
        date: row.date,
        unitsSold: 0,
        orderCount: 0,
        grossSales: 0,
        promoAmount: row.promoAmount,
      },
      update: {
        promoAmount: row.promoAmount,
      },
    });

    written++;
    promoTotal += row.promoAmount;
  }

  return { written, promoTotal, skippedUnknownSku, skippedUnknownMarketplace };
}

// ─── Reimbursement Normalization ────────────────────────────────────────────

type ReimbursementNormResult = {
  written: number;
  reimbursementTotal: number;
  skippedUnknownMarketplace: number;
  skippedNoProduct: number;
};

/**
 * Upserts reversal reimbursement amounts into DailyFee.reimbursement.
 *
 * Uses ADD semantics (existing + new) so repeated applications within a
 * settlement window accumulate correctly. Dedup is handled by the
 * processedSettlementIds cursor above.
 *
 * Account-level reimbursements (no SKU) fall back to the first active product.
 */
async function normalizeSettlementReimbursementRows(
  rows: RawSettlementReimbursementRow[],
  maps: LookupMaps,
  fallbackProductId: string | null
): Promise<ReimbursementNormResult> {
  let written = 0;
  let reimbursementTotal = 0;
  let skippedUnknownMarketplace = 0;
  let skippedNoProduct = 0;

  for (const row of rows) {
    let productId: string | undefined;
    if (row.sku) productId = maps.skuToProductId.get(row.sku);
    if (!productId) productId = fallbackProductId ?? undefined;
    if (!productId) {
      skippedNoProduct++;
      continue;
    }

    const marketplaceId = maps.codeToMarketplaceId.get(row.marketplaceCode);
    if (!marketplaceId) {
      skippedUnknownMarketplace++;
      continue;
    }

    if (row.reimbursement === 0) continue;

    const existing = await prisma.dailyFee.findUnique({
      where: {
        productId_marketplaceId_date: { productId, marketplaceId, date: row.date },
      },
      select: { reimbursement: true },
    });

    if (existing) {
      await prisma.dailyFee.update({
        where: {
          productId_marketplaceId_date: { productId, marketplaceId, date: row.date },
        },
        data: {
          reimbursement: Number(existing.reimbursement) + row.reimbursement,
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
          storageFee: 0,
          awdStorageFee: 0,
          returnProcessingFee: 0,
          otherFees: 0,
          reimbursement: row.reimbursement,
        },
      });
    }

    written++;
    reimbursementTotal += row.reimbursement;
  }

  return { written, reimbursementTotal, skippedUnknownMarketplace, skippedNoProduct };
}

// ─── Cursor serialization ───────────────────────────────────────────────────

type CursorData = {
  createdSince: string;              // ISO timestamp
  processedSettlementIds: string[];  // settlement-ids already written
};

/**
 * Parses a cursor value into structured data.
 * Accepts either a JSON object (new format) or a plain ISO timestamp
 * string (legacy format, for backwards compatibility).
 */
function parseCursor(raw: string): CursorData {
  try {
    const obj = JSON.parse(raw);
    if (
      obj &&
      typeof obj === "object" &&
      typeof obj.createdSince === "string"
    ) {
      return {
        createdSince: obj.createdSince,
        processedSettlementIds: Array.isArray(obj.processedSettlementIds)
          ? obj.processedSettlementIds.filter((x: unknown): x is string => typeof x === "string")
          : [],
      };
    }
  } catch {
    // Not JSON — fall through to legacy handling
  }
  return { createdSince: raw, processedSettlementIds: [] };
}

function serializeCursor(data: CursorData): string {
  return JSON.stringify(data);
}

// ─── Main Job ────────────────────────────────────────────────────────────────

export async function syncSettlementRefundsJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.spConnectionId, JOB_NAME);

  console.log(`[sync-settlement-refunds] starting`);

  try {
    const client = getSpClientForUser();
    const maps = await loadLookupMaps(ctx.userId);
    const rawCursor = await getCursor(ctx.spConnectionId, JOB_NAME);
    const cursorData = parseCursor(rawCursor);
    const alreadyProcessedSet = new Set(cursorData.processedSettlementIds);

    // On first run (cursor is epoch), look back 90 days
    const cursorDate = new Date(cursorData.createdSince);
    const ninetyDaysAgo = new Date(Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const effectiveSince = cursorDate < ninetyDaysAgo
      ? ninetyDaysAgo.toISOString()
      : cursorData.createdSince;

    console.log(
      `[sync-settlement-refunds] createdSince=${cursorData.createdSince} ` +
        `effectiveSince=${effectiveSince} ` +
        `alreadyProcessed=${alreadyProcessedSet.size} ` +
        `marketplace=${ctx.marketplace.code}`
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
    // and settlement fee rows (storage, disposal, subscription).
    //
    // Reports whose settlement-id is already in alreadyProcessedSet are
    // downloaded and parsed (required to read settlement-id) but their
    // data is NOT written — this prevents double-counting on the 24h
    // rewind overlap window.
    //
    // newProcessedIds is rebuilt from scratch each run using only the
    // settlement-ids that appear in this run's listing window. This
    // naturally prunes old entries: anything outside the ≤90-day listing
    // window disappears from the cursor.
    const allRefundRows: RawSettlementRefundRow[] = [];
    const allFeeRows: RawSettlementFeeRow[] = [];
    const allPromoRows: RawSettlementPromoRow[] = [];
    const allReimbursementRows: RawSettlementReimbursementRow[] = [];
    const newProcessedIds: string[] = [];
    let totalLines = 0;
    let totalRefundLines = 0;
    let totalFeeRowLines = 0;
    let totalPromoLines = 0;
    let totalReimbursementLines = 0;
    let skippedAlreadyProcessed = 0;
    let latestCreatedTime = cursorData.createdSince;

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

      // Track latest createdTime for cursor advancement regardless of skip
      if (report.createdTime > latestCreatedTime) {
        latestCreatedTime = report.createdTime;
      }

      // Dedup by settlement-id: skip if already processed on a prior run.
      // Still record it in newProcessedIds so it stays in the cursor as
      // long as it's within the listing window.
      if (parsed.settlementId && alreadyProcessedSet.has(parsed.settlementId)) {
        skippedAlreadyProcessed++;
        newProcessedIds.push(parsed.settlementId);
        console.log(
          `[sync-settlement-refunds] report ${report.reportId}: ` +
            `settlement=${parsed.settlementId} ALREADY PROCESSED — skipping writes`
        );
        continue;
      }

      console.log(
        `[sync-settlement-refunds] report ${report.reportId}: ` +
          `settlement=${parsed.settlementId}, ${parsed.totalLines} lines, ` +
          `${parsed.refundLines} refund lines → ${parsed.refundRows.length} aggregated rows, ` +
          `${parsed.feeRowLines} settlement fee lines → ${parsed.feeRows.length} fee rows` +
          (parsed.skippedNoSku > 0 ? ` (skipped ${parsed.skippedNoSku} without SKU)` : "")
      );

      allRefundRows.push(...parsed.refundRows);
      allFeeRows.push(...parsed.feeRows);
      allPromoRows.push(...parsed.promoRows);
      allReimbursementRows.push(...parsed.reimbursementRows);
      totalLines += parsed.totalLines;
      totalRefundLines += parsed.refundLines;
      totalFeeRowLines += parsed.feeRowLines;
      totalPromoLines += parsed.promoLines;
      totalReimbursementLines += parsed.reimbursementLines;

      // Mark this settlement-id as processed going forward
      if (parsed.settlementId) {
        newProcessedIds.push(parsed.settlementId);
        alreadyProcessedSet.add(parsed.settlementId);
      }
    }

    if (skippedAlreadyProcessed > 0) {
      console.log(
        `[sync-settlement-refunds] skipped ${skippedAlreadyProcessed} already-processed reports (dedup by settlement-id)`
      );
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

    // ── Phase 3: Apply settlement fees (storage, disposal, subscription) ──

    let totalFeeRowsWritten = 0;
    let storageTotal = 0;
    let awdStorageTotal = 0;
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
      awdStorageTotal = feeRowResult.awdStorageTotal;
      disposalTotal = feeRowResult.disposalTotal;
      subscriptionTotal = feeRowResult.subscriptionTotal;
      otherFeeTotal = feeRowResult.otherTotal;

      console.log(
        `[sync-settlement-refunds] applied ${feeRowResult.written} settlement fee rows ` +
          `(storage: $${storageTotal.toFixed(2)}, ` +
          `awd storage: $${awdStorageTotal.toFixed(2)}, ` +
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

    // ── Phase 4: Apply promo (coupon/discount) rows ──────────────────────

    let totalPromoWritten = 0;
    let promoTotal = 0;

    if (allPromoRows.length > 0) {
      console.log(
        `[sync-settlement-refunds] applying ${allPromoRows.length} promo rows`
      );
      const promoResult = await normalizeSettlementPromoRows(allPromoRows, maps);
      totalPromoWritten = promoResult.written;
      promoTotal = promoResult.promoTotal;
      console.log(
        `[sync-settlement-refunds] applied ${promoResult.written} promo rows ` +
          `(total: $${promoTotal.toFixed(2)})` +
          (promoResult.skippedUnknownSku > 0
            ? `, skipped ${promoResult.skippedUnknownSku} (unknown SKU)`
            : "") +
          (promoResult.skippedUnknownMarketplace > 0
            ? `, skipped ${promoResult.skippedUnknownMarketplace} (unknown marketplace)`
            : "")
      );
    }

    // ── Phase 5: Apply reversal reimbursement rows ───────────────────────

    let totalReimbursementWritten = 0;
    let reimbursementTotal = 0;

    if (allReimbursementRows.length > 0) {
      console.log(
        `[sync-settlement-refunds] applying ${allReimbursementRows.length} reimbursement rows`
      );
      const fallbackProductId = await getFirstProductId(ctx.userId);
      const reimbResult = await normalizeSettlementReimbursementRows(
        allReimbursementRows,
        maps,
        fallbackProductId
      );
      totalReimbursementWritten = reimbResult.written;
      reimbursementTotal = reimbResult.reimbursementTotal;
      console.log(
        `[sync-settlement-refunds] applied ${reimbResult.written} reimbursement rows ` +
          `(total: $${reimbursementTotal.toFixed(2)})` +
          (reimbResult.skippedNoProduct > 0
            ? `, skipped ${reimbResult.skippedNoProduct} (no product)`
            : "") +
          (reimbResult.skippedUnknownMarketplace > 0
            ? `, skipped ${reimbResult.skippedUnknownMarketplace} (unknown marketplace)`
            : "")
      );
    }

    console.log(
      `[sync-settlement-refunds] done: ${doneReports.length} reports ` +
        `(${skippedAlreadyProcessed} skipped as already-processed), ` +
        `${totalRefundLines} refund lines → ${totalWritten} rows written, ` +
        `${totalFeeRowLines} settlement fee lines → ${totalFeeRowsWritten} applied, ` +
        `${totalPromoLines} promo lines → ${totalPromoWritten} applied, ` +
        `${totalReimbursementLines} reimbursement lines → ${totalReimbursementWritten} applied`
    );

    // Advance cursor to 24 hours BEFORE the latest report's createdTime.
    // Why the 24h rewind: Amazon can publish multiple settlement reports on
    // the same day with different timestamps. If we used latestCreatedTime
    // directly, any report created minutes before that timestamp (same day,
    // earlier time) would be permanently skipped on subsequent runs. By
    // rewinding 24h we guarantee same-day reports are always re-discovered.
    //
    // Double-counting is prevented by processedSettlementIds dedup above:
    // re-discovered reports have their settlement-id checked against the
    // set and their data writes are skipped.
    const latestCreated = new Date(latestCreatedTime);
    latestCreated.setHours(latestCreated.getHours() - 24);
    const nextCreatedSince = latestCreated.toISOString();

    // newProcessedIds contains every settlement-id seen in this run's
    // listing window. IDs from reports outside the window are dropped
    // naturally, keeping the set bounded to the last ~90 days.
    const nextCursor = serializeCursor({
      createdSince: nextCreatedSince,
      processedSettlementIds: newProcessedIds,
    });

    await updateCursor(ctx.spConnectionId, JOB_NAME, nextCursor);

    await completeJobRun(runId, {
      fetchedCount: totalLines,
      writtenCount: totalWritten,
    });

    return {
      fetchedCount: totalLines,
      writtenCount: totalWritten,
      nextCursor,
      notes:
        `${doneReports.length} settlement reports ` +
        `(${skippedAlreadyProcessed} deduped), ` +
        `${totalRefundLines} refund lines, ` +
        `${totalFeeRowsWritten} settlement fees ` +
        `(storage: $${storageTotal.toFixed(2)}, ` +
        `awd storage: $${awdStorageTotal.toFixed(2)}, ` +
        `disposal: $${disposalTotal.toFixed(2)}, ` +
        `subscription: $${subscriptionTotal.toFixed(2)}), ` +
        `promo: $${promoTotal.toFixed(2)}, ` +
        `reimbursement: $${reimbursementTotal.toFixed(2)}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(runId, msg);
    throw err;
  }
}
