/**
 * Ads Report Transformer
 *
 * Transforms ParsedAdRow[] from the parser into RawAdRow[] suitable for
 * normalization. Each row represents one (asin, date, campaignName) tuple.
 *
 * DailyAd has no unique constraint in the schema, so normalization does
 * a delete-then-insert for the date range covered by the report.
 *
 * This module is pure: no DB access.
 *
 * TODO: Validate aggregation key choice (campaignName vs campaignId) live.
 */

import type { ParsedAdRow } from "@/lib/amazon/ads-report-parser";

// ─── Output Types ─────────────────────────────────────────────────────────────

export type RawAdRow = {
  asin: string;
  marketplaceCode: string; // Will be set by the job — Ads reports don't include it
  date: Date;
  campaignName: string | null;
  spend: number;
  attributedSales: number;
  clicks: number;
  impressions: number;
  orders: number;
  // Derived metrics — calculated here so normalization service has them ready
  acos: number | null;     // spend / attributedSales, null if no sales
  roas: number | null;     // attributedSales / spend, null if no spend
  cpc: number | null;      // spend / clicks, null if no clicks
};

type AggKey = string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function calcAcos(spend: number, sales: number): number | null {
  if (sales === 0) return null;
  return round4(spend / sales);
}

function calcRoas(sales: number, spend: number): number | null {
  if (spend === 0) return null;
  return round4(sales / spend);
}

function calcCpc(spend: number, clicks: number): number | null {
  if (clicks === 0) return null;
  return round4(spend / clicks);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ─── Main transformer ─────────────────────────────────────────────────────────

/**
 * Aggregates parsed ad rows by (asin, date, campaignName).
 * Computes ACOS, ROAS, and CPC from totals.
 *
 * marketplaceCode must be injected by the caller — it is not present
 * in the Ads report itself.
 *
 * TODO: Validate whether one ASIN can appear in multiple campaigns for
 *       the same date and whether aggregating here is correct live.
 */
export function transformAdRowsToRawAdRows(
  rows: ParsedAdRow[],
  marketplaceCode: string
): RawAdRow[] {
  const agg = new Map<AggKey, RawAdRow>();

  for (const row of rows) {
    if (!row.advertisedAsin) continue;

    // Group by asin + date + campaignName
    const key: AggKey = `${row.advertisedAsin}::${dateToStr(row.date)}::${row.campaignName ?? ""}`;

    if (!agg.has(key)) {
      agg.set(key, {
        asin: row.advertisedAsin,
        marketplaceCode,
        date: row.date,
        campaignName: row.campaignName,
        spend: 0,
        attributedSales: 0,
        clicks: 0,
        impressions: 0,
        orders: 0,
        acos: null,
        roas: null,
        cpc: null,
      });
    }

    const agg_row = agg.get(key)!;
    agg_row.spend += row.spend;
    agg_row.attributedSales += row.attributedSales;
    agg_row.clicks += row.clicks;
    agg_row.impressions += row.impressions;
    agg_row.orders += row.attributedOrders;
  }

  // Compute derived metrics once totals are stable
  const results: RawAdRow[] = [];
  for (const row of agg.values()) {
    results.push({
      ...row,
      acos: calcAcos(row.spend, row.attributedSales),
      roas: calcRoas(row.attributedSales, row.spend),
      cpc: calcCpc(row.spend, row.clicks),
    });
  }

  return results;
}
