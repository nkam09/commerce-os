export {};

/**
 * Runner: sync-health-refresh
 *
 * Entry point for `npm run job:sync-health-refresh`.
 *
 * Refreshes SyncConnection.status for all connections belonging to the
 * resolved user, based on the most recent SyncJobRun per connection.
 *
 * Run this after any sync job to keep the Sync Health page current.
 */

import { resolveUserId } from "@/lib/jobs/job-connection-resolver";
import { refreshSyncHealth } from "@/lib/services/recompute-orchestration-service";

async function main() {
  console.log("[run-sync-health-refresh] starting");

  const userId = await resolveUserId();
  await refreshSyncHealth(userId);

  console.log("[run-sync-health-refresh] done");
}

main().catch((err) => {
  console.error("[run-sync-health-refresh] fatal:", err);
  process.exit(1);
});
