import { describe, it, expect } from "vitest";
import {
  transformOrdersToSaleRows,
  mergeRefundsIntoSaleRows,
} from "@/lib/amazon/order-payload-transformer";
import type { OrderWithItems } from "@/lib/amazon/order-payload-transformer";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    AmazonOrderId: "111-1111111-1111111",
    PurchaseDate: "2024-03-15T10:00:00Z",
    LastUpdateDate: "2024-03-15T12:00:00Z",
    OrderStatus: "Unshipped",
    MarketplaceId: "ATVPDKIKX0DER",
    ...overrides,
  };
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    ASIN: "B001234567",
    SellerSKU: "SKU-001",
    OrderItemId: "item-1",
    QuantityOrdered: 1,
    ItemPrice: { CurrencyCode: "USD", Amount: "29.99" },
    ...overrides,
  };
}

// ─── transformOrdersToSaleRows ────────────────────────────────────────────────

describe("transformOrdersToSaleRows", () => {
  it("returns an empty array for empty input", () => {
    const result = transformOrdersToSaleRows([]);
    expect(result).toEqual([]);
  });

  it("maps a single order + item to a single RawSaleRow", () => {
    const input: OrderWithItems[] = [
      { order: makeOrder(), items: [makeItem()] },
    ];
    const rows = transformOrdersToSaleRows(input);
    expect(rows).toHaveLength(1);
    expect(rows[0].asin).toBe("B001234567");
    expect(rows[0].marketplaceCode).toBe("ATVPDKIKX0DER");
    expect(rows[0].unitsSold).toBe(1);
    expect(rows[0].orderCount).toBe(1);
    expect(rows[0].grossSales).toBeCloseTo(29.99);
    expect(rows[0].refundCount).toBe(0);
    expect(rows[0].refundAmount).toBe(0);
  });

  it("skips cancelled orders", () => {
    const input: OrderWithItems[] = [
      { order: makeOrder({ OrderStatus: "Canceled" }), items: [makeItem()] },
    ];
    const rows = transformOrdersToSaleRows(input);
    expect(rows).toHaveLength(0);
  });

  it("skips items without an ASIN", () => {
    const input: OrderWithItems[] = [
      { order: makeOrder(), items: [makeItem({ ASIN: undefined })] },
    ];
    const rows = transformOrdersToSaleRows(input);
    expect(rows).toHaveLength(0);
  });

  it("aggregates two items with the same ASIN on the same day", () => {
    const input: OrderWithItems[] = [
      {
        order: makeOrder({ AmazonOrderId: "111-0000001-0000001" }),
        items: [makeItem({ QuantityOrdered: 2, ItemPrice: { CurrencyCode: "USD", Amount: "59.98" } })],
      },
      {
        order: makeOrder({ AmazonOrderId: "111-0000002-0000002" }),
        items: [makeItem({ QuantityOrdered: 1, ItemPrice: { CurrencyCode: "USD", Amount: "29.99" } })],
      },
    ];
    const rows = transformOrdersToSaleRows(input);
    expect(rows).toHaveLength(1);
    expect(rows[0].unitsSold).toBe(3);
    expect(rows[0].orderCount).toBe(2);
    expect(rows[0].grossSales).toBeCloseTo(89.97);
  });

  it("produces separate rows for different ASINs on the same day", () => {
    const input: OrderWithItems[] = [
      {
        order: makeOrder(),
        items: [
          makeItem({ ASIN: "B001111111" }),
          makeItem({ ASIN: "B002222222" }),
        ],
      },
    ];
    const rows = transformOrdersToSaleRows(input);
    expect(rows).toHaveLength(2);
    const asins = rows.map((r) => r.asin).sort();
    expect(asins).toEqual(["B001111111", "B002222222"]);
  });

  it("produces separate rows for the same ASIN on different days", () => {
    const input: OrderWithItems[] = [
      {
        order: makeOrder({ PurchaseDate: "2024-03-15T10:00:00Z" }),
        items: [makeItem()],
      },
      {
        order: makeOrder({ AmazonOrderId: "111-0000002-0000002", PurchaseDate: "2024-03-16T10:00:00Z" }),
        items: [makeItem()],
      },
    ];
    const rows = transformOrdersToSaleRows(input);
    expect(rows).toHaveLength(2);
  });

  it("sets the date to midnight UTC regardless of purchase time", () => {
    const input: OrderWithItems[] = [
      {
        order: makeOrder({ PurchaseDate: "2024-03-15T23:59:59Z" }),
        items: [makeItem()],
      },
    ];
    const rows = transformOrdersToSaleRows(input);
    expect(rows[0].date.getUTCHours()).toBe(0);
    expect(rows[0].date.getUTCMinutes()).toBe(0);
    expect(rows[0].date.getUTCSeconds()).toBe(0);
  });

  it("handles missing ItemPrice gracefully (defaults to 0)", () => {
    const input: OrderWithItems[] = [
      {
        order: makeOrder(),
        items: [makeItem({ ItemPrice: undefined })],
      },
    ];
    const rows = transformOrdersToSaleRows(input);
    expect(rows[0].grossSales).toBe(0);
  });

  it("handles quantity > 1 correctly", () => {
    const input: OrderWithItems[] = [
      {
        order: makeOrder(),
        items: [makeItem({ QuantityOrdered: 5 })],
      },
    ];
    const rows = transformOrdersToSaleRows(input);
    expect(rows[0].unitsSold).toBe(5);
  });
});

// ─── mergeRefundsIntoSaleRows ─────────────────────────────────────────────────

describe("mergeRefundsIntoSaleRows", () => {
  it("merges a refund into a matching sale row", () => {
    const saleRows = transformOrdersToSaleRows([
      { order: makeOrder(), items: [makeItem()] },
    ]);

    const refunds = [
      {
        asin: "B001234567",
        marketplaceCode: "ATVPDKIKX0DER",
        date: new Date("2024-03-15T00:00:00Z"),
        qty: 1,
        amount: 29.99,
      },
    ];

    const merged = mergeRefundsIntoSaleRows(saleRows, refunds);
    expect(merged[0].refundCount).toBe(1);
    expect(merged[0].refundAmount).toBeCloseTo(29.99);
  });

  it("does not affect rows where no refund matches", () => {
    const saleRows = transformOrdersToSaleRows([
      { order: makeOrder(), items: [makeItem()] },
    ]);

    const refunds = [
      {
        asin: "B009999999",
        marketplaceCode: "ATVPDKIKX0DER",
        date: new Date("2024-03-15T00:00:00Z"),
        qty: 1,
        amount: 29.99,
      },
    ];

    const merged = mergeRefundsIntoSaleRows(saleRows, refunds);
    expect(merged[0].refundCount).toBe(0);
    expect(merged[0].refundAmount).toBe(0);
  });
});
