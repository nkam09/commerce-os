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
 *   5. sync-returns    — provisional refund counts for recent dates (runs BEFORE
 *                        sync-settlement-refunds so settlements can overwrite)
 *   6. sync-settlement-refunds — build DailySale.refundCount + refundAmount from settlement reports
 *   7. sync-health-refresh — update connection statuses
 *
 * Note: sync-returns provides provisional refund counts for dates not yet
 * covered by settlements. sync-settlement-refunds overwrites with
 * authoritative data when settlements arrive.
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
import { syncReturnsJob } from "@/lib/jobs/sync-returns-job";
import { syncSettlementRefundsJob } from "@/lib/jobs/sync-settlement-refunds-job";
import { runRecompute, refreshSyncHealth } from "@/lib/services/recompute-orchestration-service";

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
    // sync-returns provides provisional refund counts for dates not yet covered by
    // settlements. sync-settlement-refunds overwrites with authoritative data when
    // settlements arrive.
    { name: "sync-returns", fn: () => syncReturnsJob(ctx) },
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
