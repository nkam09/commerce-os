/**
 * Ads Report Parser
 *
 * Validates and normalises the raw AdsReportRow array returned by
 * AdsApiClient.parseGzipJsonReport(). Handles missing fields, type
 * coercion, and unknown column names defensively.
 *
 * TODO: Column names and types require live validation against the
 *       Ads API V3 spAdvertisedProduct report. Amazon changes column
 *       names between API versions and report types.
 */

import type { AdsReportRow } from "@/lib/amazon/ads-api-client";

// ─── Output Type ──────────────────────────────────────────────────────────────

export type ParsedAdRow = {
  date: Date;
  campaignName: string | null;
  campaignId: string | null;
  adGroupName: string | null;
  adGroupId: string | null;
  advertisedAsin: string | null;
  advertisedSku: string | null;
  impressions: number;
  clicks: number;
  spend: number;          // Maps from "cost" in API response
  attributedSales: number;  // Best available attributed sales field
  attributedOrders: number; // Best available attributed orders field
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) ? 0 : n;
}

function safeStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function parseReportDate(v: unknown): Date | null {
  if (!v) return null;
  // TODO: Validate date format returned in report (YYYYMMDD vs YYYY-MM-DD) live.
  const s = String(v);
  const normalized = s.length === 8
    ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
    : s;
  const d = new Date(normalized + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parses raw report rows into typed ParsedAdRow objects.
 * Rows with an unparseable date or no ASIN are skipped.
 *
 * TODO: The attributed sales/orders field selection (7d vs 14d vs 30d)
 *       is currently defaulting to 7d. Confirm preferred attribution window live.
 * TODO: Validate that "cost" is the correct spend field name in live reports.
 */
export function parseAdsReportRows(rawRows: AdsReportRow[]): ParsedAdRow[] {
  const parsed: ParsedAdRow[] = [];

  for (const row of rawRows) {
    const date = parseReportDate(row.date);
    if (!date) continue; // skip rows with no parseable date

    const asin = safeStr(row.advertisedAsin);
    if (!asin) continue; // skip rows with no ASIN

    // Prefer 7-day attributed sales; fall back to other windows if absent.
    // TODO: Make attribution window configurable and validate live.
    const attributedSales =
      safeNum(row.sales7d) ||
      safeNum(row.sales14d) ||
      safeNum(row.sales30d) ||
      safeNum(row.sales1d);

    const attributedOrders =
      safeNum(row.purchases7d) ||
      safeNum(row.purchases14d) ||
      safeNum(row.purchases30d) ||
      safeNum(row.purchases1d);

    parsed.push({
      date,
      campaignName: safeStr(row.campaignName),
      campaignId: safeStr(row.campaignId),
      adGroupName: safeStr(row.adGroupName),
      adGroupId: safeStr(row.adGroupId),
      advertisedAsin: asin,
      advertisedSku: safeStr(row.advertisedSku),
      impressions: safeNum(row.impressions),
      clicks: safeNum(row.clicks),
      spend: safeNum(row.cost), // TODO: Validate "cost" field name live.
      attributedSales,
      attributedOrders,
    });
  }

  return parsed;
}
