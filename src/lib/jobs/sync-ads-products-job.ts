/**
 * Sync Ads Products Job
 *
 * Requests a Sponsored Products daily report from the Ads API,
 * polls until complete, downloads and parses the gzip JSON,
 * then normalizes into DailyAd records.
 *
 * Cursor: ISO date string in SyncCursor(adsConnectionId, "sync-ads-products").
 * Report covers from cursor date to yesterday (Ads data is typically
 * available with a 1-day lag).
 *
 * Amazon limits: max 31 days per report request. This job chunks the full
 * date range into 31-day windows and processes each sequentially.
 */
import { AdsApiClient } from "@/lib/amazon/ads-api-client";
import { getAdsConfigForUser } from "@/lib/amazon/get-sp-client-for-user";
import { parseAdsReportRows } from "@/lib/amazon/ads-report-parser";
import { transformAdRowsToRawAdRows } from "@/lib/amazon/ads-report-transformer";
import { loadLookupMaps } from "@/lib/sync/sales-normalization-service";
import { normalizeAdRows } from "@/lib/sync/ads-normalization-service";
import {
  getCursor,
  updateCursor,
  beginJobRun,
  completeJobRun,
  failJobRun,
} from "@/lib/sync/sync-orchestration-service";
import type { JobContext, JobResult } from "@/lib/jobs/job-types";

const JOB_NAME = "sync-ads-products";
const MAX_DAYS_PER_CHUNK = 31;

const REPORT_TYPE_ID = "spAdvertisedProduct";
const REPORT_AD_PRODUCT = "SPONSORED_PRODUCTS";
const REPORT_TIME_UNIT = "DAILY";
const REPORT_FORMAT = "GZIP_JSON";
const REPORT_GROUP_BY = ["advertiser"];
const REPORT_COLUMNS = [
  "date",
  "campaignName",
  "campaignId",
  "adGroupName",
  "adGroupId",
  "advertisedAsin",
  "advertisedSku",
  "impressions",
  "clicks",
  "cost",
  "purchases7d",
  "sales7d",
];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + n);
  return result;
}

function yesterday(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Splits [start, end] into chunks of at most MAX_DAYS_PER_CHUNK days.
 * Both dates are inclusive YYYY-MM-DD strings.
 */
function buildChunks(startDate: string, endDate: string): Array<{ startDate: string; endDate: string }> {
  const chunks: Array<{ startDate: string; endDate: string }> = [];
  let current = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  while (current <= end) {
    const chunkEnd = new Date(Math.min(
      addDays(current, MAX_DAYS_PER_CHUNK - 1).getTime(),
      end.getTime()
    ));
    chunks.push({ startDate: toDateStr(current), endDate: toDateStr(chunkEnd) });
    current = addDays(chunkEnd, 1);
  }

  return chunks;
}

export async function syncAdsProductsJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.adsConnectionId, JOB_NAME);

  try {
    const adsConfig = getAdsConfigForUser();
    const client = new AdsApiClient(adsConfig);
    const maps = await loadLookupMaps(ctx.userId);

    const cursorStr = await getCursor(ctx.adsConnectionId, JOB_NAME);
    const cursorDate = new Date(cursorStr);

    // 3-day lookback: re-fetch recent ads data to pick up Amazon's finalized numbers
    const LOOKBACK_DAYS = 3;
    const lookbackDate = addDays(cursorDate, -LOOKBACK_DAYS);
    const effectiveStart = lookbackDate < cursorDate ? lookbackDate : cursorDate;
    const startDate = toDateStr(effectiveStart);
    const endDate = toDateStr(yesterday());

    console.log(`[sync-ads-products] profile ID: ${adsConfig.profileId}`);
    console.log(`[sync-ads-products] report type: ${REPORT_TYPE_ID} | ad product: ${REPORT_AD_PRODUCT} | format: ${REPORT_FORMAT}`);
    console.log(`[sync-ads-products] cursor=${toDateStr(cursorDate)} effectiveCursor=${startDate}`);
    console.log(`[sync-ads-products] full date range: ${startDate} → ${endDate}`);

    if (startDate > endDate) {
      console.log(`[sync-ads-products] cursor=${startDate} is at or past yesterday, nothing to fetch`);
      await completeJobRun(runId, { fetchedCount: 0, writtenCount: 0 });
      return { fetchedCount: 0, writtenCount: 0 };
    }

    const chunks = buildChunks(startDate, endDate);
    console.log(`[sync-ads-products] splitting into ${chunks.length} chunk(s) of max ${MAX_DAYS_PER_CHUNK} days`);

    let totalFetched = 0;
    let totalWritten = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[sync-ads-products] chunk ${i + 1}/${chunks.length}: ${chunk.startDate} → ${chunk.endDate}`);

      // Request
      const reportId = await client.requestSponsoredProductsReport(chunk);
      console.log(`[sync-ads-products] chunk ${i + 1} reportId=${reportId}`);

      // Poll
      const report = await client.pollReport(reportId);
      console.log(`[sync-ads-products] chunk ${i + 1} status=${report.status} fileSize=${report.fileSize ?? "(none)"} bytes`);

      if (report.statusDetails) {
        console.log(`[sync-ads-products] chunk ${i + 1} statusDetails=${report.statusDetails}`);
      }

      if (!report.url) {
        throw new Error(`Report ${reportId} completed but has no download URL`);
      }

      // Download and parse
      const buffer = await client.downloadReport(report.url);
      const rawRows = await client.parseGzipJsonReport(buffer);
      console.log(`[sync-ads-products] chunk ${i + 1} fetched ${rawRows.length} rows`);

      if (rawRows.length === 0) {
        console.log(`[sync-ads-products] chunk ${i + 1} empty dataset — no SP activity in this range`);
      } else {
        console.log(`[sync-ads-products] chunk ${i + 1} first row: ${JSON.stringify(rawRows[0])}`);
      }

      totalFetched += rawRows.length;

      // Parse, transform, normalize
      const parsedRows = parseAdsReportRows(rawRows);
      const adRows = transformAdRowsToRawAdRows(parsedRows, ctx.marketplace.code);

      const dateRange = {
        from: new Date(chunk.startDate + "T00:00:00Z"),
        to: new Date(chunk.endDate + "T00:00:00Z"),
      };

      const result = await normalizeAdRows(adRows, maps, dateRange);
      totalWritten += result.written;

      if (result.skippedUnknownAsin > 0) {
        console.log(`[sync-ads-products] chunk ${i + 1} skipped ${result.skippedUnknownAsin} unknown ASINs`);
      }

      console.log(`[sync-ads-products] chunk ${i + 1} written ${result.written} rows`);
    }

    // Advance cursor to now
    let newCursor: string | undefined;
    if (totalFetched > 0) {
      newCursor = new Date().toISOString();
      await updateCursor(ctx.adsConnectionId, JOB_NAME, newCursor);
    }

    await completeJobRun(runId, {
      fetchedCount: totalFetched,
      writtenCount: totalWritten,
    });

    return {
      fetchedCount: totalFetched,
      writtenCount: totalWritten,
      nextCursor: newCursor,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(runId, msg);
    throw err;
  }
}