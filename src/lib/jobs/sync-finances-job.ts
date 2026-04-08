/**
 * Sync Finances Job
 *
 * Fetches financial events from SP API since the last cursor, transforms
 * them into DailyFee rows, and upserts to the database.
 *
 * Cursor: ISO date string stored in SyncCursor(connectionId, "sync-finances").
 * On first run, defaults to 30 days ago.
 *
 * TODO: Validate financial events settlement delay live.
 *       Amazon typically settles financial events 1-3 days after the order ships.
 *       The cursor may need to look back further to catch late settlements.
 */

import { getSpClientForUser } from "@/lib/amazon/get-sp-client-for-user";
import { flattenFinancialEvents } from "@/lib/amazon/financial-event-flattener";
import { transformFinancialEventsToFeeRows, transformFinancialEventsToRefundRows } from "@/lib/amazon/financial-events-transformer";
import { normalizeFeeRows, normalizeRefundRows } from "@/lib/sync/financial-normalization-service";
import { loadLookupMaps } from "@/lib/sync/sales-normalization-service";
import {
  getCursor,
  updateCursor,
  beginJobRun,
  completeJobRun,
  failJobRun,
} from "@/lib/sync/sync-orchestration-service";
import type { JobContext, JobResult } from "@/lib/jobs/job-types";

const JOB_NAME = "sync-finances";

export async function syncFinancesJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.spConnectionId, JOB_NAME);

  try {
    const client = getSpClientForUser();
    const maps = await loadLookupMaps(ctx.userId);
    const cursor = await getCursor(ctx.spConnectionId, JOB_NAME);

    console.log(`[sync-finances] cursor=${cursor}`);
    console.log(`[sync-finances] known ASINs in lookup map: ${[...maps.asinToProductId.keys()].join(", ") || "(none)"}`);

    let totalFetched = 0;
    let totalWritten = 0;
    let totalRefundsWritten = 0;
    let nextToken: string | undefined;
    const newCursor = new Date().toISOString();

    do {
      const page = await client.getFinancialEvents({
        postedAfter: cursor,
        nextToken,
      });

      const events = page.FinancialEvents;
      nextToken = page.NextToken;

      const shipmentCount = (events.ShipmentEventList ?? []).length;
      const refundEventCount = (events.RefundEventList ?? []).length;
      const serviceFeeCount = (events.ServiceFeeEventList ?? []).length;
      totalFetched += shipmentCount + refundEventCount + serviceFeeCount;

      // Log UNKNOWN-asin flat events before aggregation so all identifiers are visible
      const flatEvents = flattenFinancialEvents(events);
      const unknownFlat = flatEvents.filter((e) => !e.asin);
      if (unknownFlat.length > 0) {
        console.log(`[sync-finances] ${unknownFlat.length} flat event(s) with no ASIN (will become UNKNOWN rows):`);
        for (const e of unknownFlat) {
          console.log(
            `  eventSource=${e.eventSource} chargeType=${e.chargeType} feeType=${e.feeType}` +
            ` sku=${e.sku ?? "(none)"} marketplaceId=${e.marketplaceId ?? "(none)"}` +
            ` date=${e.postedDate.toISOString().slice(0, 10)} amount=${e.amount}`
          );
        }
      }

      // ── Fee pipeline (existing) ─────────────────────────────────────────
      const feeRows = transformFinancialEventsToFeeRows(events, ctx.marketplace.code);
      const result = await normalizeFeeRows(feeRows, maps);
      totalWritten += result.written;

      if (result.skippedUnknownAsin > 0) {
        console.log(`[sync-finances] skipped ${result.skippedUnknownAsin} aggregated fee rows with unknown ASINs:`);
        for (const r of result.skippedRows) {
          console.log(`  asin=${r.asin} marketplace=${r.marketplaceCode} date=${r.date}`);
        }
      }

      // ── Refund pipeline (new) ───────────────────────────────────────────
      const refundRows = transformFinancialEventsToRefundRows(events, ctx.marketplace.code);
      if (refundRows.length > 0) {
        const refundResult = await normalizeRefundRows(refundRows, maps);
        totalRefundsWritten += refundResult.written;
        console.log(
          `[sync-finances] refunds: ${refundRows.length} raw rows → ${refundResult.written} written` +
          (refundResult.skippedUnknownAsin > 0 ? `, ${refundResult.skippedUnknownAsin} skipped (unknown ASIN)` : "")
        );
      }
    } while (nextToken);

    console.log(`[sync-finances] totals: ${totalWritten} fee rows, ${totalRefundsWritten} refund rows written`);

    await updateCursor(ctx.spConnectionId, JOB_NAME, newCursor);

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
