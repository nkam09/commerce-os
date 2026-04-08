import { describe, it, expect } from "vitest";
import { parseAdsReportRows } from "@/lib/amazon/ads-report-parser";
import { transformAdRowsToRawAdRows } from "@/lib/amazon/ads-report-transformer";
import type { AdsReportRow } from "@/lib/amazon/ads-api-client";

const MARKETPLACE = "ATVPDKIKX0DER";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRawRow(overrides: Partial<AdsReportRow> = {}): AdsReportRow {
  return {
    date: "2024-03-15",
    campaignName: "Campaign A",
    campaignId: "campaign-001",
    adGroupName: "Ad Group 1",
    adGroupId: "adgroup-001",
    advertisedAsin: "B001234567",
    advertisedSku: "SKU-001",
    impressions: 1000,
    clicks: 25,
    cost: 12.50,
    purchases7d: 3,
    sales7d: 89.97,
    ...overrides,
  };
}

// ─── parseAdsReportRows ───────────────────────────────────────────────────────

describe("parseAdsReportRows", () => {
  it("returns empty array for empty input", () => {
    expect(parseAdsReportRows([])).toEqual([]);
  });

  it("parses a well-formed row", () => {
    const rows = parseAdsReportRows([makeRawRow()]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.advertisedAsin).toBe("B001234567");
    expect(r.impressions).toBe(1000);
    expect(r.clicks).toBe(25);
    expect(r.spend).toBeCloseTo(12.50);
    expect(r.attributedSales).toBeCloseTo(89.97);
    expect(r.attributedOrders).toBe(3);
  });

  it("skips rows with no date", () => {
    const rows = parseAdsReportRows([makeRawRow({ date: undefined })]);
    expect(rows).toHaveLength(0);
  });

  it("skips rows with an unparseable date", () => {
    const rows = parseAdsReportRows([makeRawRow({ date: "not-a-date" })]);
    expect(rows).toHaveLength(0);
  });

  it("skips rows with no ASIN", () => {
    const rows = parseAdsReportRows([makeRawRow({ advertisedAsin: undefined })]);
    expect(rows).toHaveLength(0);
  });

  it("handles YYYYMMDD date format (8-digit)", () => {
    const rows = parseAdsReportRows([makeRawRow({ date: "20240315" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].date.getUTCFullYear()).toBe(2024);
    expect(rows[0].date.getUTCMonth()).toBe(2); // 0-indexed
    expect(rows[0].date.getUTCDate()).toBe(15);
  });

  it("falls back to sales14d when sales7d is absent", () => {
    const rows = parseAdsReportRows([makeRawRow({ sales7d: undefined, sales14d: 60.00 })]);
    expect(rows[0].attributedSales).toBeCloseTo(60.00);
  });

  it("falls back to purchases14d when purchases7d is absent", () => {
    const rows = parseAdsReportRows([makeRawRow({ purchases7d: undefined, purchases14d: 2 })]);
    expect(rows[0].attributedOrders).toBe(2);
  });

  it("sets numeric fields to 0 when absent", () => {
    const rows = parseAdsReportRows([
      makeRawRow({ impressions: undefined, clicks: undefined, cost: undefined }),
    ]);
    expect(rows[0].impressions).toBe(0);
    expect(rows[0].clicks).toBe(0);
    expect(rows[0].spend).toBe(0);
  });

  it("parses numeric strings correctly", () => {
    const rows = parseAdsReportRows([
      makeRawRow({ impressions: "500" as unknown as number, cost: "7.25" as unknown as number }),
    ]);
    expect(rows[0].impressions).toBe(500);
    expect(rows[0].spend).toBeCloseTo(7.25);
  });
});

// ─── transformAdRowsToRawAdRows ───────────────────────────────────────────────

describe("transformAdRowsToRawAdRows", () => {
  it("returns empty array for empty input", () => {
    expect(transformAdRowsToRawAdRows([], MARKETPLACE)).toEqual([]);
  });

  it("maps a single parsed row to a RawAdRow", () => {
    const parsed = parseAdsReportRows([makeRawRow()]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.asin).toBe("B001234567");
    expect(r.marketplaceCode).toBe(MARKETPLACE);
    expect(r.spend).toBeCloseTo(12.50);
    expect(r.attributedSales).toBeCloseTo(89.97);
    expect(r.clicks).toBe(25);
    expect(r.impressions).toBe(1000);
    expect(r.orders).toBe(3);
  });

  it("computes ACOS correctly (spend / attributedSales)", () => {
    const parsed = parseAdsReportRows([makeRawRow({ cost: 10.00, sales7d: 100.00 })]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows[0].acos).toBeCloseTo(0.1);
  });

  it("computes ROAS correctly (attributedSales / spend)", () => {
    const parsed = parseAdsReportRows([makeRawRow({ cost: 10.00, sales7d: 100.00 })]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows[0].roas).toBeCloseTo(10.0);
  });

  it("computes CPC correctly (spend / clicks)", () => {
    const parsed = parseAdsReportRows([makeRawRow({ cost: 12.50, clicks: 25 })]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows[0].cpc).toBeCloseTo(0.5);
  });

  it("sets ACOS to null when attributedSales is 0", () => {
    const parsed = parseAdsReportRows([makeRawRow({ sales7d: 0, purchases7d: 0 })]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows[0].acos).toBeNull();
  });

  it("sets ROAS to null when spend is 0", () => {
    const parsed = parseAdsReportRows([makeRawRow({ cost: 0 })]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows[0].roas).toBeNull();
  });

  it("sets CPC to null when clicks is 0", () => {
    const parsed = parseAdsReportRows([makeRawRow({ clicks: 0 })]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows[0].cpc).toBeNull();
  });

  it("aggregates two rows with the same ASIN + date + campaign", () => {
    const parsed = parseAdsReportRows([
      makeRawRow({ cost: 5.00, clicks: 10, impressions: 400, sales7d: 30.00, purchases7d: 1 }),
      makeRawRow({ cost: 7.50, clicks: 15, impressions: 600, sales7d: 60.00, purchases7d: 2 }),
    ]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBeCloseTo(12.50);
    expect(rows[0].clicks).toBe(25);
    expect(rows[0].impressions).toBe(1000);
    expect(rows[0].attributedSales).toBeCloseTo(90.00);
    expect(rows[0].orders).toBe(3);
  });

  it("produces separate rows for different campaigns on the same ASIN + date", () => {
    const parsed = parseAdsReportRows([
      makeRawRow({ campaignName: "Campaign A" }),
      makeRawRow({ campaignName: "Campaign B" }),
    ]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows).toHaveLength(2);
  });

  it("produces separate rows for the same campaign on different dates", () => {
    const parsed = parseAdsReportRows([
      makeRawRow({ date: "2024-03-15" }),
      makeRawRow({ date: "2024-03-16" }),
    ]);
    const rows = transformAdRowsToRawAdRows(parsed, MARKETPLACE);
    expect(rows).toHaveLength(2);
  });

  it("injects the supplied marketplaceCode into all rows", () => {
    const parsed = parseAdsReportRows([makeRawRow()]);
    const rows = transformAdRowsToRawAdRows(parsed, "CUSTOM_MP_CODE");
    expect(rows[0].marketplaceCode).toBe("CUSTOM_MP_CODE");
  });
});
