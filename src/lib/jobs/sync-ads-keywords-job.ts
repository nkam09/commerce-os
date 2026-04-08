/**
 * Sync Ads Keywords Job
 *
 * Requests SP Targeting and SP Search Term reports from the Ads API,
 * polls until complete, downloads and parses the gzip JSON,
 * then normalizes into DailyKeyword and DailySearchTerm records.
 *
 * Cursor: ISO date string in SyncCursor(adsConnectionId, "sync-ads-keywords").
 * Report covers from cursor date to yesterday.
 *
 * Amazon limits: max 31 days per report request. This job chunks the full
 * date range into 31-day windows and processes each sequentially.
 */
import { AdsApiClient } from "@/lib/amazon/ads-api-client";
import { getAdsConfigForUser } from "@/lib/amazon/get-sp-client-for-user";
import { parseTargetingReportRows, parseSearchTermReportRows } from "@/lib/amazon/keyword-report-parser";
import { loadLookupMaps } from "@/lib/sync/sales-normalization-service";
import { normalizeKeywordRows, normalizeSearchTermRows } from "@/lib/sync/keyword-normalization-service";
import {
  getCursor,
  updateCursor,
  beginJobRun,
  completeJobRun,
  failJobRun,
} from "@/lib/sync/sync-orchestration-service";
import type { JobContext, JobResult } from "@/lib/jobs/job-types";

const JOB_NAME = "sync-ads-keywords";
const MAX_DAYS_PER_CHUNK = 31;

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

/**
 * Requests a report, handling 425 "duplicate" errors by extracting the existing report ID.
 */
async function requestWithDedupe(
  requestFn: () => Promise<string>,
  label: string
): Promise<string> {
  try {
    return await requestFn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const match = msg.match(/duplicate of\s*:\s*([a-f0-9-]+)/i);
    if (match) {
      const existingId = match[1];
      console.log(`[${JOB_NAME}] ${label} duplicate detected, reusing existing report: ${existingId}`);
      return existingId;
    }
    throw err;
  }
}

export async function syncAdsKeywordsJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.adsConnectionId, JOB_NAME);

  try {
    const adsConfig = getAdsConfigForUser();
    const client = new AdsApiClient(adsConfig);
    const maps = await loadLookupMaps(ctx.userId);

    const cursorStr = await getCursor(ctx.adsConnectionId, JOB_NAME);
    const startDate = toDateStr(new Date(cursorStr));
    const endDate = toDateStr(yesterday());

    console.log(`[${JOB_NAME}] profile ID: ${adsConfig.profileId}`);
    console.log(`[${JOB_NAME}] full date range: ${startDate} → ${endDate}`);

    if (startDate > endDate) {
      console.log(`[${JOB_NAME}] cursor=${startDate} is at or past yesterday, nothing to fetch`);
      await completeJobRun(runId, { fetchedCount: 0, writtenCount: 0 });
      return { fetchedCount: 0, writtenCount: 0 };
    }

    const chunks = buildChunks(startDate, endDate);
    console.log(`[${JOB_NAME}] splitting into ${chunks.length} chunk(s) of max ${MAX_DAYS_PER_CHUNK} days`);

    let totalFetched = 0;
    let totalWritten = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[${JOB_NAME}] chunk ${i + 1}/${chunks.length}: ${chunk.startDate} → ${chunk.endDate}`);

      // ─── 1. Targeting (Keyword) Report ─────────────────────────────────
      console.log(`[${JOB_NAME}] chunk ${i + 1} requesting spTargeting report...`);
      const targetingReportId = await requestWithDedupe(
        () => client.requestSPTargetingReport(chunk),
        `chunk ${i + 1} targeting`
      );
      console.log(`[${JOB_NAME}] chunk ${i + 1} targeting reportId=${targetingReportId}`);

      const targetingReport = await client.pollReport(targetingReportId, { maxAttempts: 120, intervalMs: 15_000 });
      console.log(`[${JOB_NAME}] chunk ${i + 1} targeting status=${targetingReport.status} fileSize=${targetingReport.fileSize ?? "(none)"}`);

      let keywordsWritten = 0;
      if (targetingReport.url) {
        const buffer = await client.downloadReport(targetingReport.url);
        const rawTargetingRows = await client.parseGzipJsonReport(buffer);
        console.log(`[${JOB_NAME}] chunk ${i + 1} targeting fetched ${rawTargetingRows.length} rows`);

        if (rawTargetingRows.length > 0) {
          console.log(`[${JOB_NAME}] chunk ${i + 1} TARGETING FIRST RAW ROW: ${JSON.stringify(rawTargetingRows[0])}`);
        }

        totalFetched += rawTargetingRows.length;

        const parsedKeywords = parseTargetingReportRows(rawTargetingRows);
        console.log(`[${JOB_NAME}] chunk ${i + 1} targeting parsed ${parsedKeywords.length} keyword rows`);

        const dateRange = {
          from: new Date(chunk.startDate + "T00:00:00Z"),
          to: new Date(chunk.endDate + "T00:00:00Z"),
        };

        const kwResult = await normalizeKeywordRows(parsedKeywords, maps, ctx.marketplace.code, dateRange);
        keywordsWritten = kwResult.written;
        totalWritten += kwResult.written;

        console.log(`[${JOB_NAME}] chunk ${i + 1} targeting: deleted=${kwResult.deleted}, written=${kwResult.written}, skipped=${kwResult.skippedUnknownAsin}`);
      } else {
        console.log(`[${JOB_NAME}] chunk ${i + 1} targeting report has no download URL (status=${targetingReport.status})`);
        if (targetingReport.statusDetails) {
          console.log(`[${JOB_NAME}] chunk ${i + 1} targeting statusDetails: ${targetingReport.statusDetails}`);
        }
      }

      // ─── 2. Search Term Report ─────────────────────────────────────────
      console.log(`[${JOB_NAME}] chunk ${i + 1} requesting spSearchTerm report...`);
      const searchTermReportId = await requestWithDedupe(
        () => client.requestSPSearchTermReport(chunk),
        `chunk ${i + 1} searchTerm`
      );
      console.log(`[${JOB_NAME}] chunk ${i + 1} searchTerm reportId=${searchTermReportId}`);

      const searchTermReport = await client.pollReport(searchTermReportId, { maxAttempts: 120, intervalMs: 15_000 });
      console.log(`[${JOB_NAME}] chunk ${i + 1} searchTerm status=${searchTermReport.status} fileSize=${searchTermReport.fileSize ?? "(none)"}`);

      let searchTermsWritten = 0;
      if (searchTermReport.url) {
        const buffer = await client.downloadReport(searchTermReport.url);
        const rawSearchTermRows = await client.parseGzipJsonReport(buffer);
        console.log(`[${JOB_NAME}] chunk ${i + 1} searchTerm fetched ${rawSearchTermRows.length} rows`);

        if (rawSearchTermRows.length > 0) {
          console.log(`[${JOB_NAME}] chunk ${i + 1} SEARCH TERM FIRST RAW ROW: ${JSON.stringify(rawSearchTermRows[0])}`);
        }

        totalFetched += rawSearchTermRows.length;

        const parsedSearchTerms = parseSearchTermReportRows(rawSearchTermRows);
        console.log(`[${JOB_NAME}] chunk ${i + 1} searchTerm parsed ${parsedSearchTerms.length} search term rows`);

        const dateRange = {
          from: new Date(chunk.startDate + "T00:00:00Z"),
          to: new Date(chunk.endDate + "T00:00:00Z"),
        };

        const stResult = await normalizeSearchTermRows(parsedSearchTerms, maps, ctx.marketplace.code, dateRange);
        searchTermsWritten = stResult.written;
        totalWritten += stResult.written;

        console.log(`[${JOB_NAME}] chunk ${i + 1} searchTerm: deleted=${stResult.deleted}, written=${stResult.written}, skipped=${stResult.skippedUnknownAsin}`);
      } else {
        console.log(`[${JOB_NAME}] chunk ${i + 1} searchTerm report has no download URL (status=${searchTermReport.status})`);
        if (searchTermReport.statusDetails) {
          console.log(`[${JOB_NAME}] chunk ${i + 1} searchTerm statusDetails: ${searchTermReport.statusDetails}`);
        }
      }

      console.log(`[${JOB_NAME}] chunk ${i + 1} done: ${keywordsWritten} keywords + ${searchTermsWritten} search terms written`);
    }

    // Advance cursor
    let newCursor: string | undefined;
    if (totalFetched > 0) {
      newCursor = new Date().toISOString();
      await updateCursor(ctx.adsConnectionId, JOB_NAME, newCursor);
    }

    await completeJobRun(runId, {
      fetchedCount: totalFetched,
      writtenCount: totalWritten,
    });

    console.log(`[${JOB_NAME}] complete: fetched=${totalFetched}, written=${totalWritten}`);

    return {
      fetchedCount: totalFetched,
      writtenCount: totalWritten,
      nextCursor: newCursor,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${JOB_NAME}] error:`, msg);
    await failJobRun(runId, msg);
    throw err;
  }
}
