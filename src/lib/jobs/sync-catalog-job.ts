/**
 * Sync Catalog Job
 *
 * Placeholder: fetches product metadata (title, brand, category, imageUrl)
 * from the SP API Catalog Items API and updates Product records.
 *
 * TODO: Implement full catalog sync live after validating:
 *   - /catalog/2022-04-01/items/{asin} response shape
 *   - summaries[0].itemName field name for title
 *   - images[0].link field for imageUrl
 *   - brandRefinements field for brand
 *   - Rate limits for catalog item calls at catalog scale
 *
 * Currently logs a message and returns without making API calls.
 */

import {
  beginJobRun,
  completeJobRun,
} from "@/lib/sync/sync-orchestration-service";
import type { JobContext, JobResult } from "@/lib/jobs/job-types";

const JOB_NAME = "sync-catalog";

export async function syncCatalogJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.spConnectionId, JOB_NAME);

  console.log(
    `[sync-catalog] placeholder — catalog sync not yet implemented. ` +
    `TODO: Implement after validating /catalog/2022-04-01/items endpoint live.`
  );

  await completeJobRun(runId, { fetchedCount: 0, writtenCount: 0 });

  return {
    fetchedCount: 0,
    writtenCount: 0,
    notes: "Catalog sync not yet implemented.",
  };
}
