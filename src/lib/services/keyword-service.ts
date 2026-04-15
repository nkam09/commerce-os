/**
 * Keyword Service — queries daily_keywords and daily_search_terms via Prisma.
 * No raw SQL. Same patterns as ppc-service.ts.
 */
import { prisma } from "@/lib/db/prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KeywordSummaryMetrics {
  totalSpend: number;
  totalSales: number;
  acos: number | null;
  clicks: number;
  impressions: number;
  orders: number;
  cpc: number | null;
  ctr: number | null;
  roas: number | null;
  uniqueKeywords: number;
  uniqueSearchTerms: number;
}

export interface KeywordRow {
  keywordText: string;
  matchType: string;
  campaignName: string | null;
  adGroupName: string | null;
  adSpend: number;
  sales: number;
  acos: number | null;
  clicks: number;
  impressions: number;
  cpc: number | null;
  ctr: number | null;
  orders: number;
  roas: number | null;
}

export interface SearchTermRow {
  searchTerm: string;
  keywordText: string | null;
  matchType: string | null;
  campaignName: string | null;
  adSpend: number;
  sales: number;
  acos: number | null;
  clicks: number;
  impressions: number;
  orders: number;
  roas: number | null;
}

export interface KeywordDetailRow {
  campaignName: string;
  adGroupName: string | null;
  adSpend: number;
  sales: number;
  acos: number | null;
  clicks: number;
  impressions: number;
  orders: number;
}

export interface KeywordDetail {
  keywordText: string;
  matchType: string;
  totalSpend: number;
  totalSales: number;
  acos: number | null;
  roas: number | null;
  clicks: number;
  impressions: number;
  orders: number;
  campaigns: KeywordDetailRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dec(v: unknown): number {
  if (v == null) return 0;
  return typeof v === "object" && "toNumber" in (v as object) ? (v as { toNumber(): number }).toNumber() : Number(v) || 0;
}

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 10000) / 100 : null;
}

function div(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 100) / 100 : null;
}

async function getProductIds(userId: string, brand?: string): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" }, ...(brand ? { brand } : {}) },
    select: { id: true },
  });
  return products.map((p) => p.id);
}

// ─── getKeywordSummary ───────────────────────────────────────────────────────

export async function getKeywordSummary(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  brand?: string
): Promise<KeywordSummaryMetrics> {
  const productIds = await getProductIds(userId, brand);
  if (productIds.length === 0) {
    return { totalSpend: 0, totalSales: 0, acos: null, clicks: 0, impressions: 0, orders: 0, cpc: null, ctr: null, roas: null, uniqueKeywords: 0, uniqueSearchTerms: 0 };
  }

  const kwAgg = await prisma.dailyKeyword.aggregate({
    where: { productId: { in: productIds }, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
  });

  const spend = dec(kwAgg._sum.spend);
  const sales = dec(kwAgg._sum.attributedSales);
  const clicks = dec(kwAgg._sum.clicks);
  const impressions = dec(kwAgg._sum.impressions);
  const orders = dec(kwAgg._sum.orders);

  const kwDistinct = await prisma.dailyKeyword.groupBy({
    by: ["keywordText"],
    where: { productId: { in: productIds }, date: { gte: dateFrom, lte: dateTo }, keywordText: { not: null } },
  });

  const stDistinct = await prisma.dailySearchTerm.groupBy({
    by: ["searchTerm"],
    where: { productId: { in: productIds }, date: { gte: dateFrom, lte: dateTo }, searchTerm: { not: null } },
  });

  console.log(`[keyword-svc] summary: spend=$${spend.toFixed(2)}, ${kwDistinct.length} keywords, ${stDistinct.length} search terms`);

  return {
    totalSpend: spend, totalSales: sales, clicks, impressions, orders,
    acos: pct(spend, sales), cpc: div(spend, clicks), ctr: pct(clicks, impressions), roas: div(sales, spend),
    uniqueKeywords: kwDistinct.length, uniqueSearchTerms: stDistinct.length,
  };
}

// ─── getKeywordRows ──────────────────────────────────────────────────────────

export async function getKeywordRows(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  filters?: { search?: string; matchType?: string; minSpend?: number; maxAcos?: number },
  brand?: string
): Promise<KeywordRow[]> {
  const productIds = await getProductIds(userId, brand);
  if (productIds.length === 0) return [];

  const rows = await prisma.dailyKeyword.groupBy({
    by: ["keywordText", "matchType", "campaignName", "adGroupName"],
    where: {
      productId: { in: productIds },
      date: { gte: dateFrom, lte: dateTo },
      ...(filters?.search ? { keywordText: { contains: filters.search, mode: "insensitive" as const } } : {}),
      ...(filters?.matchType && filters.matchType !== "all" ? { matchType: filters.matchType } : {}),
    },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { _sum: { spend: "desc" } },
  });

  const keywords: KeywordRow[] = [];
  for (const r of rows) {
    const adSpend = dec(r._sum.spend);
    const sales = dec(r._sum.attributedSales);
    const clicks = dec(r._sum.clicks);
    const impressions = dec(r._sum.impressions);
    const orders = dec(r._sum.orders);

    if (filters?.minSpend && adSpend < filters.minSpend) continue;
    const acos = pct(adSpend, sales);
    if (filters?.maxAcos != null && acos != null && acos > filters.maxAcos) continue;

    keywords.push({
      keywordText: r.keywordText ?? "Unknown", matchType: r.matchType ?? "UNKNOWN",
      campaignName: r.campaignName, adGroupName: r.adGroupName,
      adSpend, sales, clicks, impressions, orders, acos,
      cpc: div(adSpend, clicks), ctr: pct(clicks, impressions), roas: div(sales, adSpend),
    });
  }

  console.log(`[keyword-svc] getKeywordRows: ${keywords.length} rows`);
  return keywords;
}

// ─── getSearchTermRows ───────────────────────────────────────────────────────

export async function getSearchTermRows(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  filters?: { search?: string; minSpend?: number },
  brand?: string
): Promise<SearchTermRow[]> {
  const productIds = await getProductIds(userId, brand);
  if (productIds.length === 0) return [];

  const rows = await prisma.dailySearchTerm.groupBy({
    by: ["searchTerm", "keywordText", "matchType", "campaignName"],
    where: {
      productId: { in: productIds },
      date: { gte: dateFrom, lte: dateTo },
      ...(filters?.search ? { searchTerm: { contains: filters.search, mode: "insensitive" as const } } : {}),
    },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { _sum: { spend: "desc" } },
  });

  const terms: SearchTermRow[] = [];
  for (const r of rows) {
    const adSpend = dec(r._sum.spend);
    const sales = dec(r._sum.attributedSales);
    if (filters?.minSpend && adSpend < filters.minSpend) continue;

    terms.push({
      searchTerm: r.searchTerm ?? "Unknown", keywordText: r.keywordText, matchType: r.matchType,
      campaignName: r.campaignName, adSpend, sales, acos: pct(adSpend, sales),
      clicks: dec(r._sum.clicks), impressions: dec(r._sum.impressions),
      orders: dec(r._sum.orders), roas: div(sales, adSpend),
    });
  }

  console.log(`[keyword-svc] getSearchTermRows: ${terms.length} rows`);
  return terms;
}

// ─── getKeywordDetail ────────────────────────────────────────────────────────

export async function getKeywordDetail(
  userId: string,
  keywordText: string,
  matchType: string,
  dateFrom: Date,
  dateTo: Date,
  brand?: string
): Promise<KeywordDetail> {
  const productIds = await getProductIds(userId, brand);

  const agg = await prisma.dailyKeyword.aggregate({
    where: { productId: { in: productIds }, keywordText, matchType, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
  });

  const totalSpend = dec(agg._sum.spend);
  const totalSales = dec(agg._sum.attributedSales);

  const campaignRows = await prisma.dailyKeyword.groupBy({
    by: ["campaignName", "adGroupName"],
    where: { productId: { in: productIds }, keywordText, matchType, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { _sum: { spend: "desc" } },
  });

  const campaigns: KeywordDetailRow[] = campaignRows.map((r) => {
    const s = dec(r._sum.spend);
    const sa = dec(r._sum.attributedSales);
    return {
      campaignName: r.campaignName ?? "Unknown", adGroupName: r.adGroupName,
      adSpend: s, sales: sa, acos: pct(s, sa),
      clicks: dec(r._sum.clicks), impressions: dec(r._sum.impressions), orders: dec(r._sum.orders),
    };
  });

  console.log(`[keyword-svc] detail "${keywordText.slice(0, 30)}": spend=$${totalSpend.toFixed(2)}, ${campaigns.length} campaigns`);

  return {
    keywordText, matchType, totalSpend, totalSales,
    acos: pct(totalSpend, totalSales), roas: div(totalSales, totalSpend),
    clicks: dec(agg._sum.clicks), impressions: dec(agg._sum.impressions), orders: dec(agg._sum.orders),
    campaigns,
  };
}
