import { describe, it, expect } from "vitest";
import { transformFinancialEventsToFeeRows } from "@/lib/amazon/financial-events-transformer";
import {
  mapFeeToBucket,
  isRevenueLikeCharge,
} from "@/lib/amazon/financial-event-bucket-mapper";
import type { SpFinancialEvents } from "@/lib/amazon/sp-api-client";

const FALLBACK_MP = "ATVPDKIKX0DER";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFeeItem(feeType: string, amount: number) {
  return {
    ASIN: "B001234567",
    SellerSKU: "SKU-001",
    QuantityShipped: 1,
    ItemChargeList: [],
    ItemFeeList: [
      {
        FeeType: feeType,
        FeeAmount: { CurrencyCode: "USD", CurrencyAmount: amount },
      },
    ],
  };
}

function makeShipmentEvent(items: ReturnType<typeof makeFeeItem>[], postedDate = "2024-03-15T00:00:00Z") {
  return {
    AmazonOrderId: "111-1111111-1111111",
    PostedDate: postedDate,
    MarketplaceId: FALLBACK_MP,
    ShipmentItemList: items,
  };
}

// ─── mapFeeToBucket ───────────────────────────────────────────────────────────

describe("mapFeeToBucket", () => {
  it("maps Commission to referralFee", () => {
    expect(mapFeeToBucket("Commission")).toBe("referralFee");
  });

  it("maps commission (lowercase) to referralFee", () => {
    expect(mapFeeToBucket("commission")).toBe("referralFee");
  });

  it("maps FBAPerOrderFulfillmentFee to fbaFee", () => {
    expect(mapFeeToBucket("FBAPerOrderFulfillmentFee")).toBe("fbaFee");
  });

  it("maps FBAPerUnitFulfillmentFee to fbaFee", () => {
    expect(mapFeeToBucket("FBAPerUnitFulfillmentFee")).toBe("fbaFee");
  });

  it("maps FBAStorageFee to storageFee", () => {
    expect(mapFeeToBucket("FBAStorageFee")).toBe("storageFee");
  });

  it("maps LongTermStorageFee to storageFee", () => {
    expect(mapFeeToBucket("LongTermStorageFee")).toBe("storageFee");
  });

  it("maps ReturnProcessingFee to returnProcessingFee", () => {
    expect(mapFeeToBucket("ReturnProcessingFee")).toBe("returnProcessingFee");
  });

  it("maps unknown fee type to otherFees", () => {
    expect(mapFeeToBucket("DisposalFee")).toBe("otherFees");
    expect(mapFeeToBucket("RemovalFee")).toBe("otherFees");
    expect(mapFeeToBucket("SomeFutureAmazonFee")).toBe("otherFees");
  });
});

// ─── isRevenueLikeCharge ──────────────────────────────────────────────────────

describe("isRevenueLikeCharge", () => {
  it("identifies Principal as revenue-like", () => {
    expect(isRevenueLikeCharge("Principal")).toBe(true);
  });

  it("identifies Tax as revenue-like", () => {
    expect(isRevenueLikeCharge("Tax")).toBe(true);
  });

  it("identifies ShippingCharge as revenue-like", () => {
    expect(isRevenueLikeCharge("ShippingCharge")).toBe(true);
  });

  it("does not identify Commission as revenue-like", () => {
    expect(isRevenueLikeCharge("Commission")).toBe(false);
  });

  it("does not identify FBAPerOrderFulfillmentFee as revenue-like", () => {
    expect(isRevenueLikeCharge("FBAPerOrderFulfillmentFee")).toBe(false);
  });
});

// ─── transformFinancialEventsToFeeRows ────────────────────────────────────────

describe("transformFinancialEventsToFeeRows", () => {
  it("returns empty array for empty events", () => {
    const events: SpFinancialEvents = {};
    expect(transformFinancialEventsToFeeRows(events, FALLBACK_MP)).toEqual([]);
  });

  it("returns empty array when only revenue-like charges are present", () => {
    const events: SpFinancialEvents = {
      ShipmentEventList: [
        makeShipmentEvent([
          {
            ASIN: "B001234567",
            SellerSKU: "SKU-001",
            QuantityShipped: 1,
            ItemChargeList: [
              { ChargeType: "Principal", ChargeAmount: { CurrencyCode: "USD", CurrencyAmount: 29.99 } },
              { ChargeType: "Tax", ChargeAmount: { CurrencyCode: "USD", CurrencyAmount: 2.40 } },
            ],
            ItemFeeList: [],
          },
        ]),
      ],
    };
    const rows = transformFinancialEventsToFeeRows(events, FALLBACK_MP);
    expect(rows).toHaveLength(0);
  });

  it("maps a Commission fee into referralFee bucket", () => {
    const events: SpFinancialEvents = {
      ShipmentEventList: [
        makeShipmentEvent([makeFeeItem("Commission", -4.50)]),
      ],
    };
    const rows = transformFinancialEventsToFeeRows(events, FALLBACK_MP);
    expect(rows).toHaveLength(1);
    expect(rows[0].referralFee).toBeCloseTo(4.50); // stored as absolute value
    expect(rows[0].fbaFee).toBe(0);
  });

  it("maps an FBA fulfillment fee into fbaFee bucket", () => {
    const events: SpFinancialEvents = {
      ShipmentEventList: [
        makeShipmentEvent([makeFeeItem("FBAPerUnitFulfillmentFee", -3.22)]),
      ],
    };
    const rows = transformFinancialEventsToFeeRows(events, FALLBACK_MP);
    expect(rows[0].fbaFee).toBeCloseTo(3.22);
  });

  it("aggregates multiple fee types for the same ASIN + date", () => {
    const events: SpFinancialEvents = {
      ShipmentEventList: [
        {
          AmazonOrderId: "111-1111111-1111111",
          PostedDate: "2024-03-15T00:00:00Z",
          MarketplaceId: FALLBACK_MP,
          ShipmentItemList: [
            {
              ASIN: "B001234567",
              SellerSKU: "SKU-001",
              QuantityShipped: 1,
              ItemChargeList: [],
              ItemFeeList: [
                { FeeType: "Commission", FeeAmount: { CurrencyCode: "USD", CurrencyAmount: -4.50 } },
                { FeeType: "FBAPerUnitFulfillmentFee", FeeAmount: { CurrencyCode: "USD", CurrencyAmount: -3.22 } },
              ],
            },
          ],
        },
      ],
    };
    const rows = transformFinancialEventsToFeeRows(events, FALLBACK_MP);
    expect(rows).toHaveLength(1);
    expect(rows[0].referralFee).toBeCloseTo(4.50);
    expect(rows[0].fbaFee).toBeCloseTo(3.22);
    expect(rows[0].storageFee).toBe(0);
  });

  it("produces separate rows for different ASINs on the same date", () => {
    const events: SpFinancialEvents = {
      ShipmentEventList: [
        {
          AmazonOrderId: "111-0000001-0000001",
          PostedDate: "2024-03-15T00:00:00Z",
          MarketplaceId: FALLBACK_MP,
          ShipmentItemList: [
            { ASIN: "B001111111", SellerSKU: "SKU-A", QuantityShipped: 1, ItemChargeList: [],
              ItemFeeList: [{ FeeType: "Commission", FeeAmount: { CurrencyCode: "USD", CurrencyAmount: -3.00 } }] },
            { ASIN: "B002222222", SellerSKU: "SKU-B", QuantityShipped: 1, ItemChargeList: [],
              ItemFeeList: [{ FeeType: "Commission", FeeAmount: { CurrencyCode: "USD", CurrencyAmount: -5.00 } }] },
          ],
        },
      ],
    };
    const rows = transformFinancialEventsToFeeRows(events, FALLBACK_MP);
    expect(rows).toHaveLength(2);
  });

  it("assigns UNKNOWN asin to service fee events with no ASIN", () => {
    const events: SpFinancialEvents = {
      ServiceFeeEventList: [
        {
          ASIN: undefined,
          FeeReason: "FBA Inventory Storage Fee",
          PostedDate: "2024-03-15T00:00:00Z",
          FeeList: [
            { FeeType: "FBAStorageFee", FeeAmount: { CurrencyCode: "USD", CurrencyAmount: -1.50 } },
          ],
        },
      ],
    };
    const rows = transformFinancialEventsToFeeRows(events, FALLBACK_MP);
    expect(rows).toHaveLength(1);
    expect(rows[0].asin).toBe("UNKNOWN");
    expect(rows[0].storageFee).toBeCloseTo(1.50);
  });

  it("uses fallbackMarketplaceCode when event has no MarketplaceId", () => {
    const events: SpFinancialEvents = {
      ShipmentEventList: [
        {
          AmazonOrderId: "111-1111111-1111111",
          PostedDate: "2024-03-15T00:00:00Z",
          // No MarketplaceId
          ShipmentItemList: [makeFeeItem("Commission", -4.50)],
        },
      ],
    };
    const rows = transformFinancialEventsToFeeRows(events, "FALLBACK_CODE");
    expect(rows[0].marketplaceCode).toBe("FALLBACK_CODE");
  });
});
