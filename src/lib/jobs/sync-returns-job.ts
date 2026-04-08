/**
 * Sync Returns Job
 *
 * Fetches FBA customer return data via Amazon's
 * GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA report, parses the TSV,
 * and upserts DailySale.refundCount.
 *
 * This job ONLY writes refundCount (unit counts). Actual dollar amounts
 * come from sync-settlement-refunds, which reads settlement reports
 * with exact refund amounts from Amazon.
 *
 * Why a separate job?
 *   - The return report gives immediate visibility into return counts
 *   - Settlement reports may lag behind (generated every ~2 weeks)
 *   - Having counts immediately lets the dashboard show return rates
 *
 * Cursor: ISO date string stored in SyncCursor(connectionId, "sync-returns").
 * On first run, defaults to 30 days ago.
 *
 * A 30-day lookback window is applied to ensure we capture late-arriving
 * return records. The cursor itself only advances forward.
 *
 * IMPORTANT: Two-phase approach — all data is collected first (report
 * download + parse), then written, preventing partial overwrites.
 */

import { prisma } from "@/lib/db/prisma";
import { getSpClientForUser } from "@/lib/amazon/get-sp-client-for-user";
import { parseReturnReport } from "@/lib/amazon/return-report-parser";
import type { RawReturnRow } from "@/lib/amazon/return-report-parser";
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

const JOB_NAME = "sync-returns";

const REPORT_TYPE = "GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA";

const LOOKBACK_DAYS = 30;

// ─── Normalization ───────────────────────────────────────────────────────────

type ReturnNormResult = {
  written: number;
  skippedUnknownAsin: number;
  skippedUnknownMarketplace: number;
};

/**
 * Upserts return data into DailySale.
 * Only touches refundCount — does NOT write refundAmount (that comes
 * from sync-settlement-refunds with exact amounts).
 * Does NOT overwrite grossSales/unitsSold/orderCount.
 */
async function normalizeReturnRows(
  rows: RawReturnRow[],
  maps: LookupMaps
): Promise<ReturnNormResult> {
  let written = 0;
  let skippedUnknownAsin = 0;
  let skippedUnknownMarketplace = 0;

  for (const row of rows) {
    // Resolve productId: try ASIN first, then SKU fallback
    let productId: string | undefined;

    if (row.asin) {
      productId = maps.asinToProductId.get(row.asin);
    }

    if (!productId && row.sku) {
      productId = maps.skuToProductId.get(row.sku);
    }

    if (!productId) {
      skippedUnknownAsin++;
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
        refundAmount: 0,
      },
      update: {
        refundCount: row.refundCount,
      },
    });

    written++;
  }

  return { written, skippedUnknownAsin, skippedUnknownMarketplace };
}

// ─── Main Job ────────────────────────────────────────────────────────────────

export async function syncReturnsJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.spConnectionId, JOB_NAME);

  console.log(`[sync-returns] starting (report-based)`);

  try {
    const client = getSpClientForUser();
    const maps = await loadLookupMaps(ctx.userId);
    const cursor = await getCursor(ctx.spConnectionId, JOB_NAME);

    // 30-day lookback: returns can appear late in the report
    const lookbackDate = new Date(
      new Date(cursor).getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const effectiveCursor = lookbackDate < cursor ? lookbackDate : cursor;
    const now = new Date().toISOString();

    console.log(
      `[sync-returns] cursor=${cursor} effectiveCursor=${effectiveCursor} marketplace=${ctx.marketplace.code}`
    );

    // ── Phase 1: Request and download return report ────────────────────

    console.log(`[sync-returns] requesting report ${REPORT_TYPE}...`);
    const reportId = await client.createReport({
      reportType: REPORT_TYPE,
      marketplaceIds: [ctx.marketplace.code],
      dataStartTime: effectiveCursor,
      dataEndTime: now,
    });
    console.log(`[sync-returns] report requested: ${reportId}`);

    const documentId = await client.pollReportUntilDone(reportId);
    console.log(`[sync-returns] report ready, documentId=${documentId}`);

    const doc = await client.getReportDocument(documentId);
    const tsv = await client.downloadReportDocument(
      doc.url,
      doc.compressionAlgorithm
    );
    console.log(
      `[sync-returns] downloaded report (${tsv.length} bytes, compression=${doc.compressionAlgorithm ?? "none"})`
    );

    // ── Phase 2: Parse report → RawReturnRow[], then upsert ───────────

    const parsed = parseReturnReport(tsv, ctx.marketplace.code);

    console.log(
      `[sync-returns] parsed ${parsed.totalLines} report lines → ${parsed.returnRows.length} daily return rows` +
        (parsed.skippedNoAsin > 0
          ? ` (skipped ${parsed.skippedNoAsin} without ASIN)`
          : "")
    );

    let totalWritten = 0;

    if (parsed.returnRows.length > 0) {
      const result = await normalizeReturnRows(parsed.returnRows, maps);
      totalWritten = result.written;

      if (result.skippedUnknownAsin > 0) {
        console.log(
          `[sync-returns] skipped ${result.skippedUnknownAsin} rows with unknown ASINs`
        );
      }

      if (result.skippedUnknownMarketplace > 0) {
        console.log(
          `[sync-returns] skipped ${result.skippedUnknownMarketplace} rows with unknown marketplace`
        );
      }
    }

    console.log(`[sync-returns] wrote ${totalWritten} refund count rows`);

    // Advance cursor to the latest return date seen in the report,
    // but never backward
    const latestReturnDate =
      parsed.latestReturnDate > cursor
        ? parsed.latestReturnDate
        : cursor;

    await updateCursor(ctx.spConnectionId, JOB_NAME, latestReturnDate);

    await completeJobRun(runId, {
      fetchedCount: parsed.totalLines,
      writtenCount: totalWritten,
    });

    return {
      fetchedCount: parsed.totalLines,
      writtenCount: totalWritten,
      nextCursor: latestReturnDate,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(runId, msg);
    throw err;
  }
}
