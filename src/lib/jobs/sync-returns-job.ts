/**
 * Sync Returns Job
 *
 * Fetches FBA customer return data via Amazon's
 * GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA report, parses the TSV,
 * and upserts DailySale.refundCount as a PROVISIONAL value.
 *
 * This job writes refundCount + estimated refundAmount ONLY when the
 * existing DailySale row has no settlement data yet (refundCount === 0).
 * Once sync-settlement-refunds writes authoritative values, this job
 * will skip those rows (settlement data takes precedence).
 *
 * Flow:
 *   - Fresh refunds show up within hours (from the returns report)
 *   - When settlements arrive, sync-settlement-refunds overwrites with
 *     exact refundCount and refundAmount
 *
 * refundAmount estimation: refundCount × avg selling price (computed
 * from recent DailySale grossSales/unitsSold per product).
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
 * Build a map of productId → average selling price from recent DailySale
 * records. Used to estimate refundAmount when only the provisional return
 * count is available.
 */
async function loadAvgPriceMap(): Promise<Map<string, number>> {
  const PRICE_LOOKBACK_DAYS = 60;
  const since = new Date(Date.now() - PRICE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.dailySale.groupBy({
    by: ["productId"],
    where: {
      date: { gte: since },
      unitsSold: { gt: 0 },
    },
    _sum: {
      grossSales: true,
      unitsSold: true,
    },
  });

  const map = new Map<string, number>();
  for (const r of rows) {
    const gross = Number(r._sum.grossSales ?? 0);
    const units = Number(r._sum.unitsSold ?? 0);
    if (units > 0 && gross > 0) {
      map.set(r.productId, gross / units);
    }
  }
  return map;
}

/**
 * Upserts return data into DailySale as PROVISIONAL values.
 *
 * Behavior:
 *   - If the row does not exist → create with refundCount + estimated refundAmount.
 *   - If the row exists and existing refundCount === 0 → update with provisional data.
 *   - If the row exists and existing refundCount > 0 → skip entirely. Settlement
 *     data is authoritative and must not be overwritten.
 *
 * Does NOT touch grossSales/unitsSold/orderCount in either branch.
 */
async function normalizeReturnRows(
  rows: RawReturnRow[],
  maps: LookupMaps,
  priceMap: Map<string, number>
): Promise<ReturnNormResult> {
  let written = 0;
  let skippedUnknownAsin = 0;
  let skippedUnknownMarketplace = 0;
  let skippedSettled = 0;

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

    // Check existing refund values — settlement data is authoritative and
    // must not be overwritten by provisional return-report data.
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
      skippedSettled++;
      continue;
    }

    const avgPrice = priceMap.get(productId) ?? 0;
    const estimatedRefundAmount = row.refundCount * avgPrice;

    if (existing) {
      // Row exists with no settlement data yet — update provisional fields only.
      await prisma.dailySale.update({
        where: {
          productId_marketplaceId_date: {
            productId,
            marketplaceId,
            date: row.date,
          },
        },
        data: {
          refundCount: row.refundCount,
          refundAmount: estimatedRefundAmount,
        },
      });
    } else {
      // No row yet — create with zero sales and provisional refund data.
      await prisma.dailySale.create({
        data: {
          productId,
          marketplaceId,
          date: row.date,
          unitsSold: 0,
          orderCount: 0,
          grossSales: 0,
          refundCount: row.refundCount,
          refundAmount: estimatedRefundAmount,
        },
      });
    }

    written++;
  }

  if (skippedSettled > 0) {
    console.log(
      `[sync-returns] skipped ${skippedSettled} rows already covered by settlement data`
    );
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
      const priceMap = await loadAvgPriceMap();
      const result = await normalizeReturnRows(parsed.returnRows, maps, priceMap);
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
