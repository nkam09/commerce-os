/**
 * Sync Returns Job
 *
 * Fetches FBA customer return data via Amazon's
 * GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA report, parses the TSV,
 * and upserts DailySale.refundCount / refundAmount.
 *
 * Why a separate job instead of relying solely on financial events?
 *   - Financial events may lag 24-72 hours behind actual returns
 *   - The return report gives immediate visibility into return counts
 *   - This job estimates refund amounts from historical unit prices when
 *     the financial events haven't arrived yet
 *
 * Cursor: ISO date string stored in SyncCursor(connectionId, "sync-returns").
 * On first run, defaults to 30 days ago.
 *
 * A 30-day lookback window is applied to ensure we capture late-arriving
 * return records. The cursor itself only advances forward.
 *
 * IMPORTANT: Two-phase approach — all data is collected first (report
 * download + parse), then written, preventing partial overwrites.
 *
 * Amount estimation strategy:
 *   1. Look up existing DailySale row for same product+marketplace+date
 *      → use grossSales / unitsSold as unit price
 *   2. If no sales data exists for that date, fall back to 30-day average
 *      unit price across all dates for that product+marketplace
 *   3. If still no data, refundAmount stays 0 (will be filled by
 *      sync-finances when financial events arrive)
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

// ─── Refund Amount Estimation ────────────────────────────────────────────────

/**
 * Estimates refund amount for a return row by looking up the unit price
 * from existing DailySale data.
 *
 * Strategy:
 *   1. Same-date unit price: grossSales / unitsSold from DailySale for that date
 *   2. 30-day average fallback: avg(grossSales / unitsSold) across recent dates
 *   3. Zero fallback: if no sales data at all, returns 0
 */
async function estimateRefundAmount(
  productId: string,
  marketplaceId: string,
  date: Date,
  refundCount: number
): Promise<number> {
  if (refundCount <= 0) return 0;

  // Strategy 1: Same-date unit price
  const sameDayRow = await prisma.dailySale.findUnique({
    where: {
      productId_marketplaceId_date: {
        productId,
        marketplaceId,
        date,
      },
    },
    select: { grossSales: true, unitsSold: true },
  });

  if (sameDayRow && sameDayRow.unitsSold > 0 && Number(sameDayRow.grossSales) > 0) {
    const unitPrice = Number(sameDayRow.grossSales) / sameDayRow.unitsSold;
    return Math.round(refundCount * unitPrice * 100) / 100;
  }

  // Strategy 2: 30-day average unit price
  const thirtyDaysAgo = new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentSales = await prisma.dailySale.findMany({
    where: {
      productId,
      marketplaceId,
      date: { gte: thirtyDaysAgo, lte: date },
      unitsSold: { gt: 0 },
      grossSales: { gt: 0 },
    },
    select: { grossSales: true, unitsSold: true },
  });

  if (recentSales.length > 0) {
    const totalGross = recentSales.reduce((sum, r) => sum + Number(r.grossSales), 0);
    const totalUnits = recentSales.reduce((sum, r) => sum + r.unitsSold, 0);
    if (totalUnits > 0) {
      const avgUnitPrice = totalGross / totalUnits;
      return Math.round(refundCount * avgUnitPrice * 100) / 100;
    }
  }

  // Strategy 3: No data — leave at 0 for sync-finances to fill later
  return 0;
}

// ─── Normalization ───────────────────────────────────────────────────────────

type ReturnNormResult = {
  written: number;
  estimated: number;
  skippedUnknownAsin: number;
  skippedUnknownMarketplace: number;
};

/**
 * Upserts return data into DailySale.
 * Only touches refundCount and refundAmount — does NOT overwrite
 * grossSales/unitsSold/orderCount.
 *
 * If the existing row already has a non-zero refundAmount (from
 * sync-finances), we skip the estimation and keep the real amount.
 */
async function normalizeReturnRows(
  rows: RawReturnRow[],
  maps: LookupMaps
): Promise<ReturnNormResult> {
  let written = 0;
  let estimated = 0;
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

    // Check if a real refundAmount already exists from sync-finances
    const existing = await prisma.dailySale.findUnique({
      where: {
        productId_marketplaceId_date: {
          productId,
          marketplaceId,
          date: row.date,
        },
      },
      select: { refundAmount: true },
    });

    let refundAmount = row.refundAmount; // 0 from the report

    // Only estimate if no real refund amount exists yet
    if (!existing?.refundAmount || Number(existing.refundAmount) === 0) {
      refundAmount = await estimateRefundAmount(
        productId,
        marketplaceId,
        row.date,
        row.refundCount
      );
      if (refundAmount > 0) estimated++;
    } else {
      // Keep existing real amount from financial events
      refundAmount = Number(existing.refundAmount);
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
        refundAmount,
      },
      update: {
        refundCount: row.refundCount,
        refundAmount,
      },
    });

    written++;
  }

  return { written, estimated, skippedUnknownAsin, skippedUnknownMarketplace };
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
    let totalEstimated = 0;

    if (parsed.returnRows.length > 0) {
      const result = await normalizeReturnRows(parsed.returnRows, maps);
      totalWritten = result.written;
      totalEstimated = result.estimated;

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

      console.log(
        `[sync-returns] wrote ${totalWritten} rows (${totalEstimated} with estimated amounts)`
      );
    }

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
      notes: `${totalEstimated} rows with estimated refund amounts`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(runId, msg);
    throw err;
  }
}
