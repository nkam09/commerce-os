export {};

/**
 * Runner: sync-orders
 *
 * Entry point for `npm run job:sync-orders`.
 * Resolves user + job context, runs syncOrdersJob, triggers recompute.
 *
 * Note: package.json points to src/lib/jobs/runners/run-sync-orders.ts
 * Update the script path if this file is moved.
 */

import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncOrdersJob } from "@/lib/jobs/sync-orders-job";
import { runRecompute } from "@/lib/services/recompute-orchestration-service";

async function main() {
  console.log("[run-sync-orders] starting");

  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);

  const result = await syncOrdersJob(ctx);

  console.log("[run-sync-orders] done:", result);

  await runRecompute({ userId, fromDate: new Date(result.nextCursor ?? new Date().toISOString()) });
}

main().catch((err) => {
  console.error("[run-sync-orders] fatal:", err);
  process.exit(1);
});
