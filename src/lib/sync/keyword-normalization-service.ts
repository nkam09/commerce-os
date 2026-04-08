/**
 * Keyword Normalization Service
 *
 * Resolves ASIN → productId, then writes DailyKeyword and DailySearchTerm records.
 * Strategy: delete all existing rows for the covered date range, then insert fresh.
 * Same pattern as ads-normalization-service.ts.
 */

import { prisma } from "@/lib/db/prisma";
import type { ParsedKeywordRow, ParsedSearchTermRow } from "@/lib/amazon/keyword-report-parser";
import type { LookupMaps } from "@/lib/sync/sales-normalization-service";

export type KeywordNormResult = {
  deleted: number;
  written: number;
  skippedUnknownAsin: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function calcAcos(spend: number, sales: number): number | null {
  return sales > 0 ? round4(spend / sales) : null;
}

function calcRoas(sales: number, spend: number): number | null {
  return spend > 0 ? round4(sales / spend) : null;
}

function calcCpc(spend: number, clicks: number): number | null {
  return clicks > 0 ? round4(spend / clicks) : null;
}

// ─── Normalize Keyword Rows ──────────────────────────────────────────────────

export async function normalizeKeywordRows(
  rows: ParsedKeywordRow[],
  maps: LookupMaps,
  marketplaceCode: string,
  dateRange: { from: Date; to: Date }
): Promise<KeywordNormResult> {
  let skippedUnknownAsin = 0;

  const marketplaceId = maps.codeToMarketplaceId.get(marketplaceCode);
  if (!marketplaceId) {
    console.log(`[keyword-norm] unknown marketplace code: ${marketplaceCode}`);
    return { deleted: 0, written: 0, skippedUnknownAsin: rows.length };
  }

  // Resolve rows — keyword reports may or may not have ASIN
  // If no ASIN, try to map through campaign→product from daily_ads
  type Resolved = {
    productId: string;
    marketplaceId: string;
    date: Date;
    campaignName: string | null;
    campaignId: string | null;
    adGroupName: string | null;
    adGroupId: string | null;
    keywordId: string | null;
    keywordText: string | null;
    matchType: string | null;
    keywordType: string | null;
    spend: number;
    attributedSales: number;
    clicks: number;
    impressions: number;
    orders: number;
    acos: number | null;
    roas: number | null;
    cpc: number | null;
  };

  const resolved: Resolved[] = [];

  // Build campaign→productId fallback map from daily_ads
  const campaignProductMap = new Map<string, string>();
  const products = await prisma.product.findMany({
    where: { userId: { in: [...maps.asinToProductId.values()].length > 0 ? undefined as never : [] } },
    select: { id: true },
  }).catch(() => []);

  // Get all productIds from the lookup maps
  const allProductIds = [...maps.asinToProductId.values()];
  if (allProductIds.length > 0) {
    const campaignMappings = await prisma.dailyAd.groupBy({
      by: ["campaignName", "productId"],
      where: {
        productId: { in: allProductIds },
        date: { gte: dateRange.from, lte: dateRange.to },
      },
    });
    for (const m of campaignMappings) {
      if (m.campaignName) campaignProductMap.set(m.campaignName, m.productId);
    }
  }

  for (const row of rows) {
    // Try direct ASIN resolution first
    let productId = row.advertisedAsin ? maps.asinToProductId.get(row.advertisedAsin) : undefined;

    // Fallback: campaign→product mapping
    if (!productId && row.campaignName) {
      productId = campaignProductMap.get(row.campaignName);
    }

    // Last resort: use first product (single-brand seller assumption)
    if (!productId) {
      const firstProduct = allProductIds[0];
      if (firstProduct) {
        productId = firstProduct;
      } else {
        skippedUnknownAsin++;
        continue;
      }
    }

    resolved.push({
      productId,
      marketplaceId,
      date: row.date,
      campaignName: row.campaignName,
      campaignId: row.campaignId,
      adGroupName: row.adGroupName,
      adGroupId: row.adGroupId,
      keywordId: row.keywordId,
      keywordText: row.keywordText,
      matchType: row.matchType,
      keywordType: row.keywordType,
      spend: row.spend,
      attributedSales: row.attributedSales,
      clicks: row.clicks,
      impressions: row.impressions,
      orders: row.attributedOrders,
      acos: calcAcos(row.spend, row.attributedSales),
      roas: calcRoas(row.attributedSales, row.spend),
      cpc: calcCpc(row.spend, row.clicks),
    });
  }

  if (resolved.length === 0) {
    return { deleted: 0, written: 0, skippedUnknownAsin };
  }

  const productIds = [...new Set(resolved.map((r) => r.productId))];

  const { count: deleted } = await prisma.dailyKeyword.deleteMany({
    where: {
      productId: { in: productIds },
      marketplaceId,
      date: { gte: dateRange.from, lte: dateRange.to },
    },
  });

  await prisma.dailyKeyword.createMany({
    data: resolved.map((r) => ({
      productId: r.productId,
      marketplaceId: r.marketplaceId,
      date: r.date,
      campaignName: r.campaignName,
      campaignId: r.campaignId,
      adGroupName: r.adGroupName,
      adGroupId: r.adGroupId,
      keywordId: r.keywordId,
      keywordText: r.keywordText,
      matchType: r.matchType,
      keywordType: r.keywordType,
      spend: r.spend,
      attributedSales: r.attributedSales,
      clicks: r.clicks,
      impressions: r.impressions,
      orders: r.orders,
      acos: r.acos,
      roas: r.roas,
      cpc: r.cpc,
    })),
  });

  return { deleted, written: resolved.length, skippedUnknownAsin };
}

// ─── Normalize Search Term Rows ──────────────────────────────────────────────

export async function normalizeSearchTermRows(
  rows: ParsedSearchTermRow[],
  maps: LookupMaps,
  marketplaceCode: string,
  dateRange: { from: Date; to: Date }
): Promise<KeywordNormResult> {
  let skippedUnknownAsin = 0;

  const marketplaceId = maps.codeToMarketplaceId.get(marketplaceCode);
  if (!marketplaceId) {
    console.log(`[searchterm-norm] unknown marketplace code: ${marketplaceCode}`);
    return { deleted: 0, written: 0, skippedUnknownAsin: rows.length };
  }

  const allProductIds = [...maps.asinToProductId.values()];

  // Campaign→product fallback (search terms rarely have ASIN)
  const campaignProductMap = new Map<string, string>();
  if (allProductIds.length > 0) {
    const campaignMappings = await prisma.dailyAd.groupBy({
      by: ["campaignName", "productId"],
      where: {
        productId: { in: allProductIds },
        date: { gte: dateRange.from, lte: dateRange.to },
      },
    });
    for (const m of campaignMappings) {
      if (m.campaignName) campaignProductMap.set(m.campaignName, m.productId);
    }
  }

  type Resolved = {
    productId: string;
    marketplaceId: string;
    date: Date;
    campaignName: string | null;
    campaignId: string | null;
    adGroupName: string | null;
    adGroupId: string | null;
    keywordId: string | null;
    keywordText: string | null;
    matchType: string | null;
    searchTerm: string | null;
    spend: number;
    attributedSales: number;
    clicks: number;
    impressions: number;
    orders: number;
    acos: number | null;
    roas: number | null;
    cpc: number | null;
  };

  const resolved: Resolved[] = [];

  for (const row of rows) {
    let productId = row.advertisedAsin ? maps.asinToProductId.get(row.advertisedAsin) : undefined;
    if (!productId && row.campaignName) {
      productId = campaignProductMap.get(row.campaignName);
    }
    if (!productId && allProductIds[0]) {
      productId = allProductIds[0];
    }
    if (!productId) { skippedUnknownAsin++; continue; }

    resolved.push({
      productId,
      marketplaceId,
      date: row.date,
      campaignName: row.campaignName,
      campaignId: row.campaignId,
      adGroupName: row.adGroupName,
      adGroupId: row.adGroupId,
      keywordId: row.keywordId,
      keywordText: row.keywordText,
      matchType: row.matchType,
      searchTerm: row.searchTerm,
      spend: row.spend,
      attributedSales: row.attributedSales,
      clicks: row.clicks,
      impressions: row.impressions,
      orders: row.attributedOrders,
      acos: calcAcos(row.spend, row.attributedSales),
      roas: calcRoas(row.attributedSales, row.spend),
      cpc: calcCpc(row.spend, row.clicks),
    });
  }

  if (resolved.length === 0) {
    return { deleted: 0, written: 0, skippedUnknownAsin };
  }

  const productIds = [...new Set(resolved.map((r) => r.productId))];

  const { count: deleted } = await prisma.dailySearchTerm.deleteMany({
    where: {
      productId: { in: productIds },
      marketplaceId,
      date: { gte: dateRange.from, lte: dateRange.to },
    },
  });

  await prisma.dailySearchTerm.createMany({
    data: resolved.map((r) => ({
      productId: r.productId,
      marketplaceId: r.marketplaceId,
      date: r.date,
      campaignName: r.campaignName,
      campaignId: r.campaignId,
      adGroupName: r.adGroupName,
      adGroupId: r.adGroupId,
      keywordId: r.keywordId,
      keywordText: r.keywordText,
      matchType: r.matchType,
      searchTerm: r.searchTerm,
      spend: r.spend,
      attributedSales: r.attributedSales,
      clicks: r.clicks,
      impressions: r.impressions,
      orders: r.orders,
      acos: r.acos,
      roas: r.roas,
      cpc: r.cpc,
    })),
  });

  return { deleted, written: resolved.length, skippedUnknownAsin };
}
