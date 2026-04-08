/**
 * POST /api/sync/amazon/test-inventory-transform
 *
 * Accepts a raw SP API inventory summaries payload and runs it through
 * transformInventorySummariesToRows, returning the RawInventoryRow output.
 *
 * Use this to validate that a real FBA inventory summaries response produces
 * the correct available/reserved/inbound/warehouse breakdown.
 *
 * Request body:
 * {
 *   inventorySummaries: SP API inventorySummaries array
 *   marketplaceCode?: string  — defaults to US marketplace
 *   snapshotDate?: string     — ISO date string, defaults to today
 * }
 *
 * Response data:
 * {
 *   inputCount: number
 *   outputRowCount: number
 *   skippedNoAsin: number
 *   rows: RawInventoryRow[]   — dates serialized as ISO strings
 * }
 *
 * TODO: Validate request body against a real FBA inventory summaries response live.
 * TODO: Validate that inventoryDetails nesting is preserved correctly live.
 */

import { requireUser } from "@/lib/auth/require-user";
import {
  apiSuccess,
  apiError,
  apiUnauthorized,
  apiServerError,
} from "@/lib/utils/api";
import { transformInventorySummariesToRows } from "@/lib/amazon/inventory-payload-transformer";
import type { SpInventorySummary } from "@/lib/amazon/sp-api-client";

const US_MARKETPLACE_CODE = "ATVPDKIKX0DER";

export async function POST(req: Request) {
  try {
    await requireUser();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Request body must be valid JSON.", 400);
    }

    if (!body || typeof body !== "object") {
      return apiError("Request body must be an object.", 400);
    }

    const {
      inventorySummaries,
      marketplaceCode,
      snapshotDate: snapshotDateStr,
    } = body as Record<string, unknown>;

    if (!Array.isArray(inventorySummaries)) {
      return apiError(
        'Body must contain an "inventorySummaries" array matching the SP API FBA Inventory Summaries shape.',
        400
      );
    }

    const summaries = inventorySummaries as SpInventorySummary[];
    const code =
      typeof marketplaceCode === "string" ? marketplaceCode : US_MARKETPLACE_CODE;

    let snapshotDate: Date | undefined;
    if (typeof snapshotDateStr === "string") {
      const parsed = new Date(snapshotDateStr);
      if (isNaN(parsed.getTime())) {
        return apiError(
          `"snapshotDate" must be a valid ISO date string, got: ${snapshotDateStr}`,
          400
        );
      }
      snapshotDate = parsed;
    }

    const inputCount = summaries.length;
    const rows = transformInventorySummariesToRows(summaries, code, snapshotDate);
    const skippedNoAsin = inputCount - rows.length;

    return apiSuccess({
      inputCount,
      outputRowCount: rows.length,
      skippedNoAsin,
      rows: rows.map((r) => ({
        ...r,
        snapshotDate: r.snapshotDate.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }
    return apiServerError(err);
  }
}
