/**
 * Inventory Planning Service Tests
 *
 * Tests the inventory snapshot transformer and the core days-of-stock
 * arithmetic used by the inventory planner page.
 *
 * There is no standalone inventory-planning-service yet; these tests cover
 * the pure functions that will feed it:
 *   - transformInventorySummariesToRows (from inventory-payload-transformer)
 *   - daysOfStockRemaining   (inline pure helper, tested here before extraction)
 *   - reorderQtyNeeded       (inline pure helper, tested here before extraction)
 */

import { describe, it, expect } from "vitest";
import { transformInventorySummariesToRows } from "@/lib/amazon/inventory-payload-transformer";
import type { SpInventorySummary } from "@/lib/amazon/sp-api-client";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<SpInventorySummary> = {}): SpInventorySummary {
  return {
    asin: "B001234567",
    fnSku: "X001234567",
    sellerSku: "SKU-001",
    inventoryDetails: {
      fulfillableQuantity: 100,
      inboundWorkingQuantity: 0,
      inboundShippedQuantity: 50,
      inboundReceivingQuantity: 0,
      reservedQuantity: {
        totalReservedQuantity: 10,
      },
      unfulfillableQuantity: {
        totalUnfulfillableQuantity: 5,
      },
    },
    ...overrides,
  };
}

// ─── transformInventorySummariesToRows ────────────────────────────────────────

describe("transformInventorySummariesToRows", () => {
  const MARKETPLACE = "ATVPDKIKX0DER";
  const SNAPSHOT_DATE = new Date("2024-03-15T00:00:00Z");

  it("returns empty array for empty summaries", () => {
    expect(transformInventorySummariesToRows([], MARKETPLACE, SNAPSHOT_DATE)).toEqual([]);
  });

  it("maps a single summary to a RawInventoryRow", () => {
    const rows = transformInventorySummariesToRows([makeSummary()], MARKETPLACE, SNAPSHOT_DATE);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.asin).toBe("B001234567");
    expect(r.marketplaceCode).toBe(MARKETPLACE);
    expect(r.available).toBe(100);
    expect(r.reserved).toBe(10);
    expect(r.inbound).toBe(50); // inboundShipped = 50, others = 0
    expect(r.warehouse).toBe(5);
    expect(r.awd).toBe(0);
  });

  it("sums all inbound buckets (working + shipped + receiving)", () => {
    const rows = transformInventorySummariesToRows(
      [
        makeSummary({
          inventoryDetails: {
            fulfillableQuantity: 100,
            inboundWorkingQuantity: 20,
            inboundShippedQuantity: 30,
            inboundReceivingQuantity: 10,
            reservedQuantity: { totalReservedQuantity: 0 },
            unfulfillableQuantity: { totalUnfulfillableQuantity: 0 },
          },
        }),
      ],
      MARKETPLACE,
      SNAPSHOT_DATE
    );
    expect(rows[0].inbound).toBe(60);
  });

  it("skips summaries without an ASIN", () => {
    const rows = transformInventorySummariesToRows(
      [makeSummary({ asin: "" })],
      MARKETPLACE,
      SNAPSHOT_DATE
    );
    expect(rows).toHaveLength(0);
  });

  it("handles missing inventoryDetails gracefully (all fields default to 0)", () => {
    const rows = transformInventorySummariesToRows(
      [makeSummary({ inventoryDetails: undefined })],
      MARKETPLACE,
      SNAPSHOT_DATE
    );
    expect(rows[0].available).toBe(0);
    expect(rows[0].reserved).toBe(0);
    expect(rows[0].inbound).toBe(0);
    expect(rows[0].warehouse).toBe(0);
  });

  it("sets snapshotDate to midnight UTC", () => {
    const rows = transformInventorySummariesToRows([makeSummary()], MARKETPLACE, SNAPSHOT_DATE);
    expect(rows[0].snapshotDate.getUTCHours()).toBe(0);
    expect(rows[0].snapshotDate.getUTCMinutes()).toBe(0);
    expect(rows[0].snapshotDate.getUTCSeconds()).toBe(0);
  });

  it("copies fnSku and sku from summary", () => {
    const rows = transformInventorySummariesToRows([makeSummary()], MARKETPLACE, SNAPSHOT_DATE);
    expect(rows[0].fnSku).toBe("X001234567");
    expect(rows[0].sku).toBe("SKU-001");
  });

  it("processes multiple summaries independently", () => {
    const rows = transformInventorySummariesToRows(
      [
        makeSummary({ asin: "B001111111" }),
        makeSummary({ asin: "B002222222" }),
        makeSummary({ asin: "B003333333" }),
      ],
      MARKETPLACE,
      SNAPSHOT_DATE
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.asin).sort()).toEqual([
      "B001111111",
      "B002222222",
      "B003333333",
    ]);
  });
});

// ─── Days-of-stock arithmetic ─────────────────────────────────────────────────
// Pure planning helpers. These will be extracted into an
// inventory-planning-service when that module is built.

function daysOfStockRemaining(available: number, avgDailySales: number): number {
  if (avgDailySales <= 0) return Infinity;
  return available / avgDailySales;
}

function reorderQtyNeeded(params: {
  avgDailySales: number;
  productionLeadDays: number;
  shippingLeadDays: number;
  safetyStockDays: number;
  reorderCoverageDays: number;
  reorderCasePack: number;
}): number {
  const {
    avgDailySales,
    productionLeadDays,
    shippingLeadDays,
    safetyStockDays,
    reorderCoverageDays,
    reorderCasePack,
  } = params;
  const totalDays = productionLeadDays + shippingLeadDays + safetyStockDays + reorderCoverageDays;
  const rawQty = avgDailySales * totalDays;
  if (reorderCasePack <= 1) return Math.ceil(rawQty);
  return Math.ceil(rawQty / reorderCasePack) * reorderCasePack;
}

describe("daysOfStockRemaining", () => {
  it("divides available by avgDailySales", () => {
    expect(daysOfStockRemaining(100, 5)).toBe(20);
  });

  it("returns Infinity when avgDailySales is 0", () => {
    expect(daysOfStockRemaining(100, 0)).toBe(Infinity);
  });

  it("returns 0 when available is 0", () => {
    expect(daysOfStockRemaining(0, 10)).toBe(0);
  });

  it("returns fractional days correctly", () => {
    expect(daysOfStockRemaining(10, 3)).toBeCloseTo(3.333);
  });
});

describe("reorderQtyNeeded", () => {
  const base = {
    avgDailySales: 10,
    productionLeadDays: 30,
    shippingLeadDays: 30,
    safetyStockDays: 14,
    reorderCoverageDays: 90,
    reorderCasePack: 1,
  };

  it("computes total lead + coverage days and multiplies by avgDailySales", () => {
    // 30 + 30 + 14 + 90 = 164 days × 10 units/day = 1640
    expect(reorderQtyNeeded(base)).toBe(1640);
  });

  it("rounds up to the nearest case pack", () => {
    // raw = 164 × 3 = 492, case pack = 50 → ceil(492/50) × 50 = 500
    expect(reorderQtyNeeded({ ...base, avgDailySales: 3, reorderCasePack: 50 })).toBe(500);
  });

  it("does not round up when qty is already a multiple of case pack", () => {
    // raw = 164 × 10 = 1640, case pack = 40 → ceil(1640/40) × 40 = 1640
    expect(reorderQtyNeeded({ ...base, reorderCasePack: 40 })).toBe(1640);
  });

  it("returns 0 when avgDailySales is 0", () => {
    expect(reorderQtyNeeded({ ...base, avgDailySales: 0 })).toBe(0);
  });
});
