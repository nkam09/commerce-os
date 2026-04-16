/**
 * POST /api/sync/amazon/test-financial-transform
 *
 * Accepts a raw SP API FinancialEvents payload and runs it through
 * transformFinancialEventsToFeeRows, returning the aggregated RawFeeRow output.
 *
 * Use this to validate that real SP API financial event responses transform
 * into the expected fee bucket breakdown before running a full sync.
 *
 * Request body:
 * {
 *   financialEvents: SP API FinancialEvents object (ShipmentEventList, RefundEventList, etc.)
 *   marketplaceCode?: string  — fallback marketplace ID if events lack MarketplaceId
 * }
 *
 * Response data:
 * {
 *   inputEventCounts: { shipment, refund, serviceFee }
 *   outputRowCount: number
 *   rows: RawFeeRow[]     — dates serialized as ISO strings
 *   unknownAsinCount: number  — rows that will be skipped during normalization
 * }
 *
 * TODO: Validate request body against a real SP API financial events response live.
 */

import { requireUser } from "@/lib/auth/require-user";
import {
  apiSuccess,
  apiError,
  apiUnauthorized,
  apiServerError,
} from "@/lib/utils/api";
import { transformFinancialEventsToFeeRows } from "@/lib/amazon/financial-events-transformer";
import type { SpFinancialEvents } from "@/lib/amazon/sp-api-client";

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

    const { financialEvents, marketplaceCode } = body as Record<string, unknown>;

    if (!financialEvents || typeof financialEvents !== "object") {
      return apiError(
        'Body must contain a "financialEvents" object matching the SP API FinancialEvents shape.',
        400
      );
    }

    const events = financialEvents as SpFinancialEvents;
    const fallbackCode =
      typeof marketplaceCode === "string" ? marketplaceCode : US_MARKETPLACE_CODE;

    const inputEventCounts = {
      shipment: (events.ShipmentEventList ?? []).length,
      refund: (events.RefundEventList ?? []).length,
      serviceFee: (events.ServiceFeeEventList ?? []).length,
    };

    const rows = transformFinancialEventsToFeeRows(events, fallbackCode);
    const unknownAsinCount = rows.filter((r) => r.asin === "UNKNOWN").length;

    return apiSuccess({
      inputEventCounts,
      outputRowCount: rows.length,
      unknownAsinCount,
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
