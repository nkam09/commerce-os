/**
 * Financial Event Flattener
 *
 * Converts the deeply nested SpFinancialEvents structure into a flat array
 * of FlatFinancialEvent items. Each item represents one charge or fee line
 * attached to a date, ASIN, and event type.
 *
 * This module is pure: no DB access.
 *
 * TODO: Validate exact event list names and field shapes against live
 *       SP API financial events responses. Amazon adds new event types
 *       and changes field names across API versions.
 */

import type {
  SpFinancialEvents,
  SpShipmentEvent,
  SpServiceFeeEvent,
} from "@/lib/amazon/sp-api-client";

// ─── Output Type ──────────────────────────────────────────────────────────────

export type FlatFinancialEvent = {
  eventSource: "shipment" | "refund" | "serviceFee" | "storage" | "other";
  postedDate: Date;
  asin: string | null;
  sku: string | null;
  marketplaceId: string | null;
  chargeType: string;  // e.g. "Principal", "Commission"
  feeType: string;     // e.g. "FBAPerOrderFulfillmentFee", "Commission"
  amount: number;      // positive = credit, negative = fee deducted from seller
  currencyCode: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toUtcDateOnly(isoString?: string): Date {
  if (!isoString) return new Date(0);
  const d = new Date(isoString);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ─── Shipment / Refund event flattening ──────────────────────────────────────

function flattenShipmentEvent(
  event: SpShipmentEvent,
  source: "shipment" | "refund"
): FlatFinancialEvent[] {
  const results: FlatFinancialEvent[] = [];
  const postedDate = toUtcDateOnly(event.PostedDate);
  // TODO: Validate MarketplaceId presence on shipment events live.
  const marketplaceId = (event as Record<string, unknown>)["MarketplaceId"] as string | null ?? null;

  for (const item of event.ShipmentItemList ?? []) {
    const asin = item.ASIN ?? null;
    const sku = item.SellerSKU ?? null;

    // Item charges (Principal, Tax, ShippingCharge, etc.)
    for (const charge of item.ItemChargeList ?? []) {
      results.push({
        eventSource: source,
        postedDate,
        asin,
        sku,
        marketplaceId,
        chargeType: charge.ChargeType,
        feeType: charge.ChargeType,
        amount: charge.ChargeAmount.CurrencyAmount ?? 0,
        currencyCode: charge.ChargeAmount.CurrencyCode ?? "USD",
      });
    }

    // Item fees (FBA fees, referral, etc.)
    for (const fee of item.ItemFeeList ?? []) {
      results.push({
        eventSource: source,
        postedDate,
        asin,
        sku,
        marketplaceId,
        chargeType: "Fee",
        feeType: fee.FeeType,
        amount: fee.FeeAmount.CurrencyAmount ?? 0,
        currencyCode: fee.FeeAmount.CurrencyCode ?? "USD",
      });
    }
  }

  return results;
}

// ─── Service fee event flattening ────────────────────────────────────────────

function flattenServiceFeeEvent(event: SpServiceFeeEvent): FlatFinancialEvent[] {
  const results: FlatFinancialEvent[] = [];
  const postedDate = toUtcDateOnly(event.PostedDate);
  const asin = event.ASIN ?? null;

  for (const fee of event.FeeList ?? []) {
    results.push({
      eventSource: "serviceFee",
      postedDate,
      asin,
      sku: null,
      marketplaceId: null,
      chargeType: "ServiceFee",
      feeType: fee.FeeType,
      amount: fee.FeeAmount.CurrencyAmount ?? 0,
      currencyCode: fee.FeeAmount.CurrencyCode ?? "USD",
    });
  }

  return results;
}

// ─── Main flattener ───────────────────────────────────────────────────────────

/**
 * Flattens all event lists in SpFinancialEvents into a single array.
 *
 * TODO: Add StorageFeeEventList flattening once shape is validated live.
 * TODO: Add LoanServicingEvent, SAFETReimbursementEvent, etc. as needed live.
 * TODO: Validate RefundEventList structure (may differ from ShipmentEventList) live.
 */
export function flattenFinancialEvents(events: SpFinancialEvents): FlatFinancialEvent[] {
  const results: FlatFinancialEvent[] = [];

  // Shipment events (sales and fees settled)
  for (const event of events.ShipmentEventList ?? []) {
    results.push(...flattenShipmentEvent(event, "shipment"));
  }

  // Refund events
  for (const event of events.RefundEventList ?? []) {
    results.push(...flattenShipmentEvent(event, "refund"));
  }

  // Service fee events (subscription fees, removal order fees, etc.)
  for (const event of events.ServiceFeeEventList ?? []) {
    results.push(...flattenServiceFeeEvent(event));
  }

  // TODO: Add StorageFeeEventList, AdjustmentEventList, etc.
  // These require live shape validation before implementing.

  return results;
}
