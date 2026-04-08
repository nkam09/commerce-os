export {};

/**
 * Runner: sync-settlement-refunds
 *
 * Entry point for `npm run job:sync-settlement-refunds`.
 * Resolves user + job context, runs syncSettlementRefundsJob, triggers recompute.
 */

import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncSettlementRefundsJob } from "@/lib/jobs/sync-settlement-refunds-job";
import { runRecompute } from "@/lib/services/recompute-orchestration-service";

async function main() {
  console.log("[run-sync-settlement-refunds] starting");

  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);

  const result = await syncSettlementRefundsJob(ctx);

  console.log("[run-sync-settlement-refunds] done:", result);

  await runRecompute({ userId, fromDate: new Date(result.nextCursor ?? new Date().toISOString()) });
}

main().catch((err) => {
  console.error("[run-sync-settlement-refunds] fatal:", err);
  process.exit(1);
});
