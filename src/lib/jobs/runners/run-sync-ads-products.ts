/**
 * Runner: sync-ads-products
 *
 * Entry point for `npm run job:sync-ads-products`.
 */

import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncAdsProductsJob } from "@/lib/jobs/sync-ads-products-job";
import { runRecompute } from "@/lib/services/recompute-orchestration-service";

async function main() {
  console.log("[run-sync-ads-products] starting");

  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);

  const result = await syncAdsProductsJob(ctx);

  console.log("[run-sync-ads-products] done:", result);

  await runRecompute({ userId });
}

main().catch((err) => {
  console.error("[run-sync-ads-products] fatal:", err);
  process.exit(1);
});
