/**
 * Runner: sync-catalog
 *
 * Entry point for `npm run job:sync-catalog`.
 * Currently a placeholder — syncCatalogJob logs and exits without API calls.
 */

import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncCatalogJob } from "@/lib/jobs/sync-catalog-job";

async function main() {
  console.log("[run-sync-catalog] starting");

  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);

  const result = await syncCatalogJob(ctx);

  console.log("[run-sync-catalog] done:", result);
}

main().catch((err) => {
  console.error("[run-sync-catalog] fatal:", err);
  process.exit(1);
});
