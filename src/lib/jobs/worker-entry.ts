/**
 * Worker Entry Point
 *
 * Entry point for `npm run worker` (Render Background Worker service).
 *
 * Runs all active sync jobs in sequence on a configurable interval.
 * Designed for Render's Background Worker service type, which keeps the
 * process alive. For cron-based deployment, run individual job scripts instead.
 *
 * Job order:
 *   1. sync-orders     — build DailySale (requires products to exist)
 *   2. sync-finances   — build DailyFee
 *   3. sync-inventory  — build InventorySnapshot
 *   4. sync-ads        — build DailyAd
 *   5. sync-refund-events     — PRIMARY refund source (Financial Events API, PostedDate)
 *   6. sync-settlement-refunds — AUTHORITATIVE refund overwrite from settlement reports
 *   7. sync-health-refresh    — update connection statuses
 *
 * Refund attribution: Uses PostedDate from Financial Events API (matches Sellerboard).
 * sync-returns is DISABLED — its FBA return-initiated date is off by 1-3 days from
 * Amazon's PostedDate and caused count mismatches.
 *
 * Catalog sync is excluded from the regular loop — run it separately on demand.
 *
 * Note: Runner scripts in this file use inline logic rather than importing
 * the standalone run-*.ts files to avoid process.exit() calls mid-worker.
 *
 * TODO: Add WORKER_INTERVAL_MS env var support for configurable intervals.
 * TODO: Add graceful shutdown on SIGTERM.
 */

import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncOrdersJob } from "@/lib/jobs/sync-orders-job";
// sync-finances removed — fees calculated by sync-orders, non-order fees from settlements
import { syncInventoryJob } from "@/lib/jobs/sync-inventory-job";
import { syncAdsProductsJob } from "@/lib/jobs/sync-ads-products-job";
import { syncAdsKeywordsJob } from "@/lib/jobs/sync-ads-keywords-job";
import { syncRefundEventsJob } from "@/lib/jobs/sync-refund-events-job";
import { syncSettlementRefundsJob } from "@/lib/jobs/sync-settlement-refunds-job";
import { runRecompute, refreshSyncHealth } from "@/lib/services/recompute-orchestration-service";
import { runRecurringTasks } from "@/lib/services/recurring-task-service";
import { syncToGoogleCalendar } from "@/lib/services/google-calendar-sync-service";

const INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL_MS ?? "3600000", 10); // default 1 hour

async function runAllJobs(): Promise<void> {
  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);

  const jobs = [
    { name: "sync-orders", fn: () => syncOrdersJob(ctx) },
    // sync-finances removed — fees calculated by sync-orders, non-order fees from settlements
    { name: "sync-inventory", fn: () => syncInventoryJob(ctx) },
    { name: "sync-ads-products", fn: () => syncAdsProductsJob(ctx) },
    { name: "sync-ads-keywords", fn: () => syncAdsKeywordsJob(ctx) },
    // Refund data hierarchy:
    //   1. sync-refund-events    — PRIMARY refund source (Financial Events API, PostedDate attribution, near-real-time)
    //   2. sync-settlement-refunds — AUTHORITATIVE overwrite when settlements arrive (~2 weeks lag)
    //
    // sync-returns is DISABLED — it attributes refunds by FBA return-initiated
    // date which is off by 1-3 days from Amazon's PostedDate used by Sellerboard.
    // { name: "sync-returns", fn: () => syncReturnsJob(ctx) }, // DISABLED — wrong date attribution
    { name: "sync-refund-events", fn: () => syncRefundEventsJob(ctx) },
    { name: "sync-settlement-refunds", fn: () => syncSettlementRefundsJob(ctx) },
  ];

  for (const job of jobs) {
    try {
      console.log(`[worker] starting ${job.name}`);
      const result = await job.fn();
      console.log(`[worker] ${job.name} done:`, result);
    } catch (err) {
      // Log and continue — one job failure should not stop others
      console.error(`[worker] ${job.name} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Recompute derived metrics after all jobs
  try {
    await runRecompute({ userId });
  } catch (err) {
    console.error("[worker] recompute failed:", err);
  }

  // Refresh sync health page data
  try {
    await refreshSyncHealth(userId);
  } catch (err) {
    console.error("[worker] sync health refresh failed:", err);
  }

  // Fan out PM extensions — non-critical, failures shouldn't affect core syncs.
  try {
    const result = await runRecurringTasks(userId);
    if (result.created > 0) {
      console.log(`[worker] recurring-tasks created ${result.created} tasks`);
    }
  } catch (err) {
    console.error("[worker] recurring-tasks failed:", err);
  }

  try {
    const result = await syncToGoogleCalendar(userId);
    if (result.created > 0 || result.updated > 0 || result.deleted > 0) {
      console.log(
        `[worker] google-calendar-sync: +${result.created} ~${result.updated} -${result.deleted}`
      );
    }
  } catch (err) {
    console.error("[worker] google-calendar-sync failed:", err);
  }
}

async function main(): Promise<void> {
  console.log(`[worker] starting — interval=${INTERVAL_MS}ms`);

  // Run immediately on startup
  await runAllJobs();

  // Then run on interval
  setInterval(() => {
    runAllJobs().catch((err) => {
      console.error("[worker] unhandled error in job loop:", err);
    });
  }, INTERVAL_MS);
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("[worker] received SIGTERM, shutting down");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[worker] received SIGINT, shutting down");
  process.exit(0);
});

main().catch((err) => {
  console.error("[worker] fatal startup error:", err);
  process.exit(1);
});
