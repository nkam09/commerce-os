/**
 * Keyword Report Parser
 *
 * Parses raw AdsReportRow arrays from spTargeting and spSearchTerm
 * reports into typed keyword/search-term row objects.
 *
 * Reuses helpers from ads-report-parser.ts pattern.
 */

import type { AdsReportRow } from "@/lib/amazon/ads-api-client";

// ─── Output Types ────────────────────────────────────────────────────────────

export type ParsedKeywordRow = {
  date: Date;
  campaignName: string | null;
  campaignId: string | null;
  adGroupName: string | null;
  adGroupId: string | null;
  keywordId: string | null;
  keywordText: string | null;
  matchType: string | null;
  keywordType: string | null;
  advertisedAsin: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  attributedSales: number;
  attributedOrders: number;
};

export type ParsedSearchTermRow = {
  date: Date;
  campaignName: string | null;
  campaignId: string | null;
  adGroupName: string | null;
  adGroupId: string | null;
  keywordId: string | null;
  keywordText: string | null;
  matchType: string | null;
  searchTerm: string | null;
  advertisedAsin: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  attributedSales: number;
  attributedOrders: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  const s = String(v);
  const normalized = s.length === 8
    ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
    : s;
  const d = new Date(normalized + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

// ─── Targeting (Keyword) Report Parser ───────────────────────────────────────

/**
 * Parses spTargeting report rows into ParsedKeywordRow[].
 * Rows with no parseable date are skipped.
 * Note: targeting reports may or may not have advertisedAsin.
 */
export function parseTargetingReportRows(rawRows: AdsReportRow[]): ParsedKeywordRow[] {
  const parsed: ParsedKeywordRow[] = [];

  for (const row of rawRows) {
    const date = parseReportDate(row.date);
    if (!date) continue;

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
      keywordId: safeStr(row.keywordId),
      keywordText: safeStr(row.keyword) ?? safeStr(row.targeting),
      matchType: safeStr(row.matchType),
      keywordType: safeStr(row.keywordType),
      advertisedAsin: safeStr(row.advertisedAsin),
      impressions: safeNum(row.impressions),
      clicks: safeNum(row.clicks),
      spend: safeNum(row.cost),
      attributedSales,
      attributedOrders,
    });
  }

  return parsed;
}

// ─── Search Term Report Parser ───────────────────────────────────────────────

/**
 * Parses spSearchTerm report rows into ParsedSearchTermRow[].
 * Rows with no parseable date are skipped.
 * Note: search term reports typically do NOT have advertisedAsin.
 */
export function parseSearchTermReportRows(rawRows: AdsReportRow[]): ParsedSearchTermRow[] {
  const parsed: ParsedSearchTermRow[] = [];

  for (const row of rawRows) {
    const date = parseReportDate(row.date);
    if (!date) continue;

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
      keywordId: safeStr(row.keywordId),
      keywordText: safeStr(row.targeting) ?? safeStr(row.keyword),
      matchType: safeStr(row.matchType),
      searchTerm: safeStr(row.searchTerm),
      advertisedAsin: safeStr(row.advertisedAsin),
      impressions: safeNum(row.impressions),
      clicks: safeNum(row.clicks),
      spend: safeNum(row.cost),
      attributedSales,
      attributedOrders,
    });
  }

  return parsed;
}
