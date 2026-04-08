/**
 * Runner: sync-ads-keywords
 *
 * Entry point for `npm run job:sync-ads-keywords`.
 */

import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncAdsKeywordsJob } from "@/lib/jobs/sync-ads-keywords-job";
import { runRecompute } from "@/lib/services/recompute-orchestration-service";

async function main() {
  console.log("[run-sync-ads-keywords] starting");

  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);

  const result = await syncAdsKeywordsJob(ctx);

  console.log("[run-sync-ads-keywords] done:", result);

  await runRecompute({ userId });
}

main().catch((err) => {
  console.error("[run-sync-ads-keywords] fatal:", err);
  process.exit(1);
});
