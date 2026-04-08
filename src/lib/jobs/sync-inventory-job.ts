/**
 * Sync Inventory Job
 *
 * Requests the GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA report from SP-API
 * Reports API, downloads and parses the TSV, then writes today's
 * InventorySnapshot for each known product.
 *
 * Uses the Reports API instead of the Inventory Summaries API because the
 * Summaries API has a known issue where some ASINs are excluded from
 * the response even when they have active FBA inventory.
 *
 * No cursor is needed â€” inventory is always a full snapshot of current state.
 * The job writes one snapshot per product per run date.
 */

import { getSpClientForUser } from "@/lib/amazon/get-sp-client-for-user";
import { parseInventoryReport } from "@/lib/amazon/inventory-report-parser";
import { loadLookupMaps } from "@/lib/sync/sales-normalization-service";
import { normalizeInventoryRows } from "@/lib/sync/inventory-normalization-service";
import {
  beginJobRun,
  completeJobRun,
  failJobRun,
} from "@/lib/sync/sync-orchestration-service";
import type { JobContext, JobResult } from "@/lib/jobs/job-types";

const JOB_NAME = "sync-inventory";
const REPORT_TYPE = "GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA";

export async function syncInventoryJob(ctx: JobContext): Promise<JobResult> {
  const runId = await beginJobRun(ctx.spConnectionId, JOB_NAME);

  try {
    const client = getSpClientForUser();
    const maps = await loadLookupMaps(ctx.userId);

    const knownAsins = [...maps.asinToProductId.keys()];
    const knownSkus = [...maps.skuToProductId.keys()];

    console.log(`[${JOB_NAME}] marketplace=${ctx.marketplace.code}`);
    console.log(`[${JOB_NAME}] known ASINs: ${knownAsins.join(", ") || "(none)"}`);
    console.log(`[${JOB_NAME}] known SKUs: ${knownSkus.join(", ") || "(none)"}`);
    console.log(`[${JOB_NAME}] using Reports API: ${REPORT_TYPE}`);

    // â”€â”€ Step 1: Request the report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log(`[${JOB_NAME}] requesting report...`);
    const reportId = await client.createReport({
      reportType: REPORT_TYPE,
      marketplaceIds: [ctx.marketplace.code],
    });
    console.log(`[${JOB_NAME}] reportId=${reportId}`);

    // â”€â”€ Step 2: Poll until complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log(`[${JOB_NAME}] polling report status...`);
    const documentId = await client.pollReportUntilDone(reportId, 15_000, 900_000);
    console.log(`[${JOB_NAME}] report DONE, documentId=${documentId}`);

    // â”€â”€ Step 3: Download the report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const doc = await client.getReportDocument(documentId);
    console.log(`[${JOB_NAME}] downloading report from URL (compressed=${doc.compressionAlgorithm ?? "none"})...`);

    const tsvContent = await client.downloadReportDocument(
      doc.url,
      doc.compressionAlgorithm
    );
    console.log(`[${JOB_NAME}] downloaded ${tsvContent.length} bytes of TSV`);

    // Log first few lines for debugging
    const firstLines = tsvContent.split("\n").slice(0, 3);
    for (let i = 0; i < firstLines.length; i++) {
      console.log(`[${JOB_NAME}] TSV line ${i}: ${firstLines[i].slice(0, 200)}`);
    }

    // â”€â”€ Step 4: Parse TSV into RawInventoryRow[] â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const rows = parseInventoryReport(tsvContent, ctx.marketplace.code);
    const totalFetched = rows.length;
    console.log(`[${JOB_NAME}] parsed ${totalFetched} inventory rows`);

    // â”€â”€ Post-fetch: warn about tracked ASINs absent from report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const returnedAsins = new Set(rows.map((r) => r.asin));
    const returnedSkus = new Set(rows.map((r) => r.sku).filter(Boolean));

    const missingTracked = knownAsins.filter((asin) => {
      const sku = [...maps.skuToProductId.entries()].find(
        ([, id]) => id === maps.asinToProductId.get(asin)
      )?.[0];
      return !returnedAsins.has(asin) && (!sku || !returnedSkus.has(sku));
    });

    if (missingTracked.length > 0) {
      console.warn(
        `[${JOB_NAME}] WARNING: ${missingTracked.length} tracked product(s) not in report:`
      );
      for (const asin of missingTracked) {
        const productId = maps.asinToProductId.get(asin);
        const sku =
          [...maps.skuToProductId.entries()].find(
            ([, id]) => id === productId
          )?.[0] ?? "(no sku)";
        console.warn(
          `  asin=${asin} sku=${sku} â€” not in report, snapshot will not be written`
        );
      }
    } else {
      console.log(`[${JOB_NAME}] all tracked products present in report`);
    }

    // â”€â”€ Step 5: Normalize and write â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const result = await normalizeInventoryRows(rows, maps);
    const totalWritten = result.written + result.updated;

    if (result.skippedUnknownAsin > 0) {
      console.log(
        `[${JOB_NAME}] skipped ${result.skippedUnknownAsin} unknown ASINs:`
      );
      for (const r of result.skippedRows) {
        console.log(
          `  asin=${r.asin} fnSku=${r.fnSku ?? "(none)"} sku=${r.sku ?? "(none)"}`
        );
      }
    }

    console.log(
      `[${JOB_NAME}] done: fetched=${totalFetched}, written=${result.written}, updated=${result.updated}, skipped=${result.skippedUnknownAsin}`
    );

    await completeJobRun(runId, {
      fetchedCount: totalFetched,
      writtenCount: totalWritten,
    });

    return {
      fetchedCount: totalFetched,
      writtenCount: totalWritten,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${JOB_NAME}] error:`, msg);
    await failJobRun(runId, msg);
    throw err;
  }
}

