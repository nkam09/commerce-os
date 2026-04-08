export {};

/**
 * Runner: sync-finances
 *
 * Entry point for `npm run job:sync-finances`.
 */

import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncFinancesJob } from "@/lib/jobs/sync-finances-job";
import { runRecompute } from "@/lib/services/recompute-orchestration-service";

async function main() {
  console.log("[run-sync-finances] starting");

  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);

  const result = await syncFinancesJob(ctx);

  console.log("[run-sync-finances] done:", result);

  await runRecompute({ userId });
}

main().catch((err) => {
  console.error("[run-sync-finances] fatal:", err);
  process.exit(1);
});
