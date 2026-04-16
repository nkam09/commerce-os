/**
 * POST /api/sync/amazon/test-orders-transform
 *
 * Accepts a raw SP API orders-with-items payload, runs it through
 * transformOrdersToSaleRows, and returns the normalized RawSaleRow output.
 *
 * Use this to validate that a real SP API orders response transforms
 * correctly before committing to a full sync run.
 *
 * Request body:
 * {
 *   orders: Array of SP API Order objects, each with an `items` array
 *           attached (not native SP API shape — items must be pre-fetched
 *           and embedded manually for this test route).
 *   marketplaceCode?: string  — used if MarketplaceId is absent on orders
 * }
 *
 * Response data:
 * {
 *   inputOrderCount: number
 *   outputRowCount: number
 *   rows: RawSaleRow[]    — dates serialized as ISO strings
 * }
 *
 * TODO: Validate the test body shape matches real SP API order payloads live.
 */

import { requireUser } from "@/lib/auth/require-user";
import {
  apiSuccess,
  apiError,
  apiUnauthorized,
  apiServerError,
} from "@/lib/utils/api";
import { transformOrdersToSaleRows } from "@/lib/amazon/order-payload-transformer";
import type { OrderWithItems } from "@/lib/amazon/order-payload-transformer";

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

    const { orders } = body as Record<string, unknown>;

    if (!Array.isArray(orders)) {
      return apiError(
        'Body must contain an "orders" array. Each element must have an "order" object and an "items" array.',
        400
      );
    }

    // Validate minimal shape of each entry
    for (let i = 0; i < orders.length; i++) {
      const entry = orders[i] as Record<string, unknown>;
      if (!entry?.order || typeof entry.order !== "object") {
        return apiError(
          `orders[${i}] is missing an "order" object.`,
          400
        );
      }
      if (!Array.isArray(entry.items)) {
        return apiError(
          `orders[${i}] is missing an "items" array.`,
          400
        );
      }
    }

    const ordersWithItems = orders as OrderWithItems[];
    const rows = transformOrdersToSaleRows(ordersWithItems);

    return apiSuccess({
      inputOrderCount: orders.length,
      outputRowCount: rows.length,
      rows: rows.map((r) => ({
        ...r,
        date: r.date.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }
    return apiServerError(err);
  }
}
