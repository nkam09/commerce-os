export {};

/**
 * Runner: sync-returns
 *
 * Entry point for `npm run job:sync-returns`.
 * Resolves user + job context, runs syncReturnsJob, triggers recompute.
 */

import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncReturnsJob } from "@/lib/jobs/sync-returns-job";
import { runRecompute } from "@/lib/services/recompute-orchestration-service";

async function main() {
  console.log("[run-sync-returns] starting");

  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);

  const result = await syncReturnsJob(ctx);

  console.log("[run-sync-returns] done:", result);

  await runRecompute({ userId, fromDate: new Date(result.nextCursor ?? new Date().toISOString()) });
}

main().catch((err) => {
  console.error("[run-sync-returns] fatal:", err);
  process.exit(1);
});
