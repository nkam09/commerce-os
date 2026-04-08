export {};


/**
 * Runner: sync-inventory
 *
 * Entry point for `npm run job:sync-inventory`.
 */

import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncInventoryJob } from "@/lib/jobs/sync-inventory-job";
import { runRecompute } from "@/lib/services/recompute-orchestration-service";

async function main() {
  console.log("[run-sync-inventory] starting");

  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);

  const result = await syncInventoryJob(ctx);

  console.log("[run-sync-inventory] done:", result);

  await runRecompute({ userId });
}

main().catch((err) => {
  console.error("[run-sync-inventory] fatal:", err);
  process.exit(1);
});
