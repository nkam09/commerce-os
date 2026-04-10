/**
 * Sync Orders Job
 *
 * Fetches orders via Amazon's flat file order report
 * (GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL), parses the TSV,
 * and upserts DailySale rows.
 *
 * Why reports instead of the Orders API?
 *   - The Orders API returns "Pending" orders with null prices, causing $0 rows
 *   - The flat file report includes all orders with real prices regardless of
 *     ship status, matching Sellerboard's numbers exactly
 *   - A single report request replaces hundreds of paginated API calls
 *
 * Cursor: ISO date string stored in SyncCursor(connectionId, "sync-orders").
 * On first run, defaults to 30 days ago.
 *
 * A 3-day lookback window is applied so recent orders are re-synced each run
 * to capture late updates. The cursor itself only advances forward.
 *
 * IMPORTANT: The report is parsed into RawSaleRow[] in one pass, then
 * upserted. This preserves the two-phase approach — all data is collected
 * first, then written, preventing partial overwrites.
 */

import { getSpClientForUser } from "@/lib/amazon/get-sp-client-for-user";
import { parseOrderReport } from "@/lib/amazon/order-report-parser";
import { loadLookupMaps, normalizeSaleRows } from "@/lib/sync/sales-normalization-service";
import { estimateRecentFees } from "@/lib/services/fee-estimation-service";
import {
  getCursor,
  updateCursor,
  beginJobRun,
  completeJobRun,
  failJobRun,
} from "@/lib/sync/sync-orchestration-service";
import type { JobContext, JobResult } from "@/lib/jobs/job-types";

const JOB_NAME = "sync-orders";

const REPORT_TYPE = "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL";

export async function syncOrdersJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.spConnectionId, JOB_NAME);

  console.log(`[sync-orders] starting (report-based)`);

  try {
    const client = getSpClientForUser();
    const maps = await loadLookupMaps(ctx.userId);
    const cursor = await getCursor(ctx.spConnectionId, JOB_NAME);

    // 3-day lookback: re-fetch recent orders to catch status changes and late items
    const LOOKBACK_DAYS = 3;
    const lookbackDate = new Date(
      new Date(cursor).getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const effectiveCursor = lookbackDate < cursor ? lookbackDate : cursor;
    const now = new Date().toISOString();

    console.log(
      `[sync-orders] cursor=${cursor} effectiveCursor=${effectiveCursor} marketplace=${ctx.marketplace.code}`
    );

    // ── Phase 1: Request and download order report ───────────────────────

    console.log(`[sync-orders] requesting report ${REPORT_TYPE}...`);
    const reportId = await client.createReport({
      reportType: REPORT_TYPE,
      marketplaceIds: [ctx.marketplace.code],
      dataStartTime: effectiveCursor,
      dataEndTime: now,
    });
    console.log(`[sync-orders] report requested: ${reportId}`);

    const documentId = await client.pollReportUntilDone(reportId);
    console.log(`[sync-orders] report ready, documentId=${documentId}`);

    const doc = await client.getReportDocument(documentId);
    const tsv = await client.downloadReportDocument(
      doc.url,
      doc.compressionAlgorithm
    );
    console.log(
      `[sync-orders] downloaded report (${tsv.length} bytes, compression=${doc.compressionAlgorithm ?? "none"})`
    );

    // ── Phase 2: Parse report → RawSaleRow[], then upsert ───────────────
    const parsed = parseOrderReport(tsv, ctx.marketplace.code);

    console.log(
      `[sync-orders] parsed ${parsed.totalLines} report lines → ${parsed.saleRows.length} daily sale rows` +
        (parsed.skippedCancelled > 0
          ? ` (skipped ${parsed.skippedCancelled} cancelled)`
          : "")
    );

    let totalWritten = 0;

    if (parsed.saleRows.length > 0) {
      const result = await normalizeSaleRows(parsed.saleRows, maps);
      totalWritten = result.written;

      if (result.skippedUnknownAsin > 0) {
        console.log(
          `[sync-orders] skipped ${result.skippedUnknownAsin} rows with unknown ASINs: ${result.skippedAsins.join(", ")}`
        );
      }

      if (result.skippedUnknownMarketplace > 0) {
        console.log(
          `[sync-orders] skipped ${result.skippedUnknownMarketplace} rows with unknown marketplace`
        );
      }
    }

    // ── Phase 3: Calculate fees from order data (ALWAYS overwrites) ────
    // Uses hardcoded per-unit rates verified against Sellerboard.
    // Only writes fbaFee + referralFee; storage/AWD/reimbursement come from settlements.
    if (totalWritten > 0) {
      const effectiveCursorDate = new Date(effectiveCursor);
      effectiveCursorDate.setUTCHours(0, 0, 0, 0);
      const feeResult = await estimateRecentFees(ctx.userId, effectiveCursorDate);
      console.log(
        `[sync-orders] fee estimation: ${feeResult.estimated} calculated`
      );
    }

    // Advance cursor to the latest purchase date seen in the report,
    // but never backward
    const latestPurchaseDate =
      parsed.latestPurchaseDate > cursor
        ? parsed.latestPurchaseDate
        : cursor;

    await updateCursor(ctx.spConnectionId, JOB_NAME, latestPurchaseDate);

    await completeJobRun(runId, {
      fetchedCount: parsed.totalLines,
      writtenCount: totalWritten,
    });

    return {
      fetchedCount: parsed.totalLines,
      writtenCount: totalWritten,
      nextCursor: latestPurchaseDate,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(runId, msg);
    throw err;
  }
}
