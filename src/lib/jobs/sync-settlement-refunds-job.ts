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
 *   3. Extract refund rows (transaction-type="Refund", amount-description="Principal")
 *   4. Resolve SKU → productId (settlements use SKU, not ASIN)
 *   5. Upsert into daily_sales: refundCount + refundAmount
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
import type { RawSettlementRefundRow } from "@/lib/amazon/settlement-report-parser";
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

    // Download and parse all reports, collecting refund rows
    const allRefundRows: RawSettlementRefundRow[] = [];
    let totalLines = 0;
    let totalRefundLines = 0;
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

      // ── DEBUG: inspect raw report structure ──
      console.log(`[sync-settlement-refunds] DEBUG first 5 lines:`, text.split('\n').slice(0, 5));
      const allRows = text.split('\n');
      const headers = allRows[0]?.split('\t');
      console.log(`[sync-settlement-refunds] DEBUG headers:`, headers?.slice(0, 15));
      const txTypeIdx = headers?.findIndex(h => h.toLowerCase().includes('transaction'));
      if (txTypeIdx !== undefined && txTypeIdx >= 0) {
        const types = new Set(allRows.slice(1).map(l => l.split('\t')[txTypeIdx]).filter(Boolean));
        console.log(`[sync-settlement-refunds] DEBUG transaction types:`, [...types]);
      }
      // ── END DEBUG ──

      const parsed = parseSettlementReport(text, ctx.marketplace.code);

      console.log(
        `[sync-settlement-refunds] report ${report.reportId}: ` +
          `settlement=${parsed.settlementId}, ${parsed.totalLines} lines, ` +
          `${parsed.refundLines} refund lines → ${parsed.refundRows.length} aggregated rows` +
          (parsed.skippedNoSku > 0 ? ` (skipped ${parsed.skippedNoSku} without SKU)` : "")
      );

      allRefundRows.push(...parsed.refundRows);
      totalLines += parsed.totalLines;
      totalRefundLines += parsed.refundLines;

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

    console.log(
      `[sync-settlement-refunds] done: ${doneReports.length} reports, ` +
        `${totalRefundLines} refund lines → ${totalWritten} rows written`
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
      notes: `${doneReports.length} settlement reports processed, ${totalRefundLines} refund lines`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(runId, msg);
    throw err;
  }
}
