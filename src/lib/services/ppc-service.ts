/**
 * PPC Service — queries daily_ads via Prisma DailyAd model.
 * No raw SQL. No ppc_performance_daily or ppc_managed_entities.
 */
import { prisma } from "@/lib/db/prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PPCSummaryMetrics {
  ppcSales: number;
  adSpend: number;
  acos: number | null;
  tacos: number | null;
  profit: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  ctr: number | null;
  orders: number;
  conversionRate: number | null;
  roas: number | null;
}

export interface CampaignRow {
  entityId: string;
  campaignName: string;
  campaignType: string;
  status: string;
  dailyBudget: number | null;
  adSpend: number;
  ppcSales: number;
  acos: number | null;
  profit: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  ctr: number | null;
  orders: number;
  conversionRate: number | null;
  roas: number | null;
}

export interface PPCChartDataPoint {
  date: string;
  adSpend: number;
  ppcSales: number;
  profit: number;
  acos: number | null;
  impressions: number;
  clicks: number;
  orders: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dec(v: unknown): number {
  if (v == null) return 0;
  return typeof v === "object" && "toNumber" in (v as object) ? (v as { toNumber(): number }).toNumber() : Number(v) || 0;
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : null;
}

function div(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 100) / 100 : null;
}

/** Get product IDs for a user (to filter daily_ads which has no userId) */
async function getProductIds(userId: string, brand?: string): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" }, ...(brand ? { brand } : {}) },
    select: { id: true },
  });
  return products.map((p) => p.id);
}

// ─── getPPCSummary ───────────────────────────────────────────────────────────

export async function getPPCSummary(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  brand?: string
): Promise<PPCSummaryMetrics> {
  const productIds = await getProductIds(userId, brand);
  if (productIds.length === 0) {
    console.log(`[ppc] getPPCSummary: no products for user ${userId}`);
    return { ppcSales: 0, adSpend: 0, acos: null, tacos: null, profit: 0, impressions: 0, clicks: 0, cpc: null, ctr: null, orders: 0, conversionRate: null, roas: null };
  }

  const agg = await prisma.dailyAd.aggregate({
    where: { productId: { in: productIds }, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
  });

  const adSpend = dec(agg._sum.spend);
  const ppcSales = dec(agg._sum.attributedSales);
  const clicks = dec(agg._sum.clicks);
  const impressions = dec(agg._sum.impressions);
  const orders = dec(agg._sum.orders);
  const profit = ppcSales - adSpend;

  // TACOS: adSpend / totalRevenue
  let tacos: number | null = null;
  const salesAgg = await prisma.dailySale.aggregate({
    where: { productId: { in: productIds }, date: { gte: dateFrom, lte: dateTo } },
    _sum: { grossSales: true },
  });
  const totalRevenue = dec(salesAgg._sum.grossSales);
  if (totalRevenue > 0) tacos = pct(adSpend, totalRevenue);

  const result: PPCSummaryMetrics = {
    ppcSales, adSpend, profit, impressions, clicks, orders,
    acos: pct(adSpend, ppcSales),
    tacos,
    cpc: div(adSpend, clicks),
    ctr: pct(clicks, impressions),
    conversionRate: pct(orders, clicks),
    roas: div(ppcSales, adSpend),
  };

  console.log(`[ppc] getPPCSummary: ${dateFrom.toISOString().slice(0, 10)} to ${dateTo.toISOString().slice(0, 10)} | spend=$${adSpend.toFixed(2)} sales=$${ppcSales.toFixed(2)} campaigns=${productIds.length} products`);
  return result;
}

// ─── getCampaignRows ─────────────────────────────────────────────────────────

export async function getCampaignRows(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  filters?: { status?: string; campaignType?: string; search?: string },
  brand?: string
): Promise<CampaignRow[]> {
  const productIds = await getProductIds(userId, brand);
  if (productIds.length === 0) return [];

  const rows = await prisma.dailyAd.groupBy({
    by: ["campaignName"],
    where: {
      productId: { in: productIds },
      date: { gte: dateFrom, lte: dateTo },
      ...(filters?.search ? { campaignName: { contains: filters.search, mode: "insensitive" as const } } : {}),
    },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { _sum: { spend: "desc" } },
  });

  const campaigns: CampaignRow[] = [];

  for (const r of rows) {
    if (r.campaignName == null) continue;

    const adSpend = dec(r._sum.spend);
    const ppcSales = dec(r._sum.attributedSales);
    const clicks = dec(r._sum.clicks);
    const impressions = dec(r._sum.impressions);
    const orders = dec(r._sum.orders);
    const name = r.campaignName;

    // Infer type from campaign name convention
    let campaignType = "SP";
    const lower = name.toLowerCase();
    if (lower.includes(" sb ") || lower.includes("-sb-") || lower.includes("sponsored brand")) campaignType = "SB";
    else if (lower.includes(" sd ") || lower.includes("-sd-") || lower.includes("sponsored display")) campaignType = "SD";
    else if (lower.includes(" sbv") || lower.includes("video")) campaignType = "SBV";

    // Filter by type if requested
    if (filters?.campaignType && filters.campaignType !== "all" && campaignType !== filters.campaignType.toUpperCase()) continue;

    campaigns.push({
      entityId: name,
      campaignName: name,
      campaignType,
      status: "ENABLED",
      dailyBudget: null,
      adSpend, ppcSales, profit: ppcSales - adSpend,
      acos: pct(adSpend, ppcSales),
      impressions, clicks, orders,
      cpc: div(adSpend, clicks),
      ctr: pct(clicks, impressions),
      conversionRate: pct(orders, clicks),
      roas: div(ppcSales, adSpend),
    });
  }

  console.log(`[ppc] getCampaignRows: ${dateFrom.toISOString().slice(0, 10)} to ${dateTo.toISOString().slice(0, 10)} | ${campaigns.length} campaigns`);
  return campaigns;
}

// ─── getPPCChartData ─────────────────────────────────────────────────────────

export async function getPPCChartData(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  granularity: "daily" | "weekly" | "monthly" = "daily",
  brand?: string
): Promise<PPCChartDataPoint[]> {
  const productIds = await getProductIds(userId, brand);
  if (productIds.length === 0) return [];

  const rows = await prisma.dailyAd.groupBy({
    by: ["date"],
    where: { productId: { in: productIds }, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { date: "asc" },
  });

  // For weekly/monthly, re-bucket the daily data
  if (granularity === "daily") {
    const points = rows.map((r) => {
      const adSpend = dec(r._sum.spend);
      const ppcSales = dec(r._sum.attributedSales);
      return {
        date: r.date.toISOString().slice(0, 10),
        adSpend, ppcSales, profit: ppcSales - adSpend,
        acos: pct(adSpend, ppcSales),
        impressions: dec(r._sum.impressions),
        clicks: dec(r._sum.clicks),
        orders: dec(r._sum.orders),
      };
    });
    console.log(`[ppc] getPPCChartData: ${dateFrom.toISOString().slice(0, 10)} to ${dateTo.toISOString().slice(0, 10)} | daily | ${points.length} points`);
    return points;
  }

  // Bucket by week or month
  const buckets = new Map<string, { spend: number; sales: number; clicks: number; impressions: number; orders: number }>();

  for (const r of rows) {
    const d = r.date;
    let key: string;
    if (granularity === "weekly") {
      const weekStart = new Date(d);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      key = weekStart.toISOString().slice(0, 10);
    } else {
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    }

    const existing = buckets.get(key) ?? { spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0 };
    existing.spend += dec(r._sum.spend);
    existing.sales += dec(r._sum.attributedSales);
    existing.clicks += dec(r._sum.clicks);
    existing.impressions += dec(r._sum.impressions);
    existing.orders += dec(r._sum.orders);
    buckets.set(key, existing);
  }

  const points = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      adSpend: b.spend,
      ppcSales: b.sales,
      profit: b.sales - b.spend,
      acos: pct(b.spend, b.sales),
      impressions: b.impressions,
      clicks: b.clicks,
      orders: b.orders,
    }));

  console.log(`[ppc] getPPCChartData: ${dateFrom.toISOString().slice(0, 10)} to ${dateTo.toISOString().slice(0, 10)} | ${granularity} | ${points.length} points`);
  return points;
}

// ─── Additional types ────────────────────────────────────────────────────────

export interface ByProductRow {
  productId: string;
  asin: string;
  title: string;
  adSpend: number;
  ppcSales: number;
  acos: number | null;
  profit: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  ctr: number | null;
  orders: number;
  conversionRate: number | null;
  roas: number | null;
  campaignCount: number;
}

export interface CampaignProductBreakdown {
  productId: string;
  asin: string;
  title: string;
  adSpend: number;
  ppcSales: number;
  acos: number | null;
  profit: number;
  orders: number;
  clicks: number;
  impressions: number;
}

// ─── getByProductRows ────────────────────────────────────────────────────────

export async function getByProductRows(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  brand?: string
): Promise<ByProductRow[]> {
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" }, ...(brand ? { brand } : {}) },
    select: { id: true, asin: true, title: true },
  });
  if (products.length === 0) return [];
  const productIds = products.map((p) => p.id);

  const rows = await prisma.dailyAd.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { _sum: { spend: "desc" } },
  });

  // Count campaigns per product
  const campaignCounts = await prisma.dailyAd.groupBy({
    by: ["productId", "campaignName"],
    where: { productId: { in: productIds }, date: { gte: dateFrom, lte: dateTo } },
  });
  const countMap = new Map<string, number>();
  for (const r of campaignCounts) {
    countMap.set(r.productId, (countMap.get(r.productId) ?? 0) + 1);
  }

  const result: ByProductRow[] = rows.map((r) => {
    const prod = products.find((p) => p.id === r.productId);
    const adSpend = dec(r._sum.spend);
    const ppcSales = dec(r._sum.attributedSales);
    const clicks = dec(r._sum.clicks);
    const impressions = dec(r._sum.impressions);
    const orders = dec(r._sum.orders);
    return {
      productId: r.productId,
      asin: prod?.asin ?? "Unknown",
      title: prod?.title ?? "Unknown Product",
      adSpend, ppcSales, profit: ppcSales - adSpend,
      acos: pct(adSpend, ppcSales),
      impressions, clicks, orders,
      cpc: div(adSpend, clicks),
      ctr: pct(clicks, impressions),
      conversionRate: pct(orders, clicks),
      roas: div(ppcSales, adSpend),
      campaignCount: countMap.get(r.productId) ?? 0,
    };
  });

  console.log(`[ppc] getByProductRows: ${dateFrom.toISOString().slice(0, 10)} to ${dateTo.toISOString().slice(0, 10)} | ${result.length} products`);
  return result;
}

// ─── getAllPeriodsRows ───────────────────────────────────────────────────────

export async function getAllPeriodsRows(
  userId: string,
  brand?: string
): Promise<CampaignRow[]> {
  const productIds = await getProductIds(userId, brand);
  if (productIds.length === 0) return [];

  const rows = await prisma.dailyAd.groupBy({
    by: ["campaignName"],
    where: { productId: { in: productIds } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { _sum: { spend: "desc" } },
  });

  const campaigns: CampaignRow[] = [];
  for (const r of rows) {
    if (r.campaignName == null) continue;
    const adSpend = dec(r._sum.spend);
    const ppcSales = dec(r._sum.attributedSales);
    const clicks = dec(r._sum.clicks);
    const impressions = dec(r._sum.impressions);
    const orders = dec(r._sum.orders);
    const name = r.campaignName;
    let campaignType = "SP";
    const lower = name.toLowerCase();
    if (lower.includes(" sb ") || lower.includes("-sb-") || lower.includes("sponsored brand")) campaignType = "SB";
    else if (lower.includes(" sd ") || lower.includes("-sd-") || lower.includes("sponsored display")) campaignType = "SD";
    else if (lower.includes(" sbv") || lower.includes("video")) campaignType = "SBV";
    campaigns.push({
      entityId: name, campaignName: name, campaignType, status: "ENABLED", dailyBudget: null,
      adSpend, ppcSales, profit: ppcSales - adSpend, acos: pct(adSpend, ppcSales),
      impressions, clicks, orders,
      cpc: div(adSpend, clicks), ctr: pct(clicks, impressions),
      conversionRate: pct(orders, clicks), roas: div(ppcSales, adSpend),
    });
  }
  console.log(`[ppc] getAllPeriodsRows: ${campaigns.length} campaigns (all time)`);
  return campaigns;
}

// ─── getCampaignProductBreakdown ─────────────────────────────────────────────

export async function getCampaignProductBreakdown(
  userId: string,
  campaignName: string,
  dateFrom: Date,
  dateTo: Date,
  brand?: string
): Promise<CampaignProductBreakdown[]> {
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" }, ...(brand ? { brand } : {}) },
    select: { id: true, asin: true, title: true },
  });
  const productIds = products.map((p) => p.id);

  const rows = await prisma.dailyAd.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, campaignName, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { _sum: { spend: "desc" } },
  });

  return rows.map((r) => {
    const prod = products.find((p) => p.id === r.productId);
    const adSpend = dec(r._sum.spend);
    const ppcSales = dec(r._sum.attributedSales);
    return {
      productId: r.productId,
      asin: prod?.asin ?? "Unknown",
      title: prod?.title ?? "Unknown",
      adSpend, ppcSales, profit: ppcSales - adSpend,
      acos: pct(adSpend, ppcSales),
      orders: dec(r._sum.orders),
      clicks: dec(r._sum.clicks),
      impressions: dec(r._sum.impressions),
    };
  });
}

// ─── Campaign detail ─────────────────────────────────────────────────────────

export interface CampaignDetail {
  campaignName: string;
  campaignType: string;
  totalSpend: number;
  totalSales: number;
  totalProfit: number;
  acos: number | null;
  roas: number | null;
  impressions: number;
  clicks: number;
  orders: number;
  cpc: number | null;
  ctr: number | null;
  conversionRate: number | null;
  dailyData: PPCChartDataPoint[];
  productBreakdown: CampaignProductBreakdown[];
}

export async function getCampaignDetail(
  userId: string,
  campaignName: string,
  dateFrom: Date,
  dateTo: Date,
  brand?: string
): Promise<CampaignDetail> {
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" }, ...(brand ? { brand } : {}) },
    select: { id: true, asin: true, title: true },
  });
  const productIds = products.map((p) => p.id);

  // Summary aggregate
  const agg = await prisma.dailyAd.aggregate({
    where: { productId: { in: productIds }, campaignName, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
  });

  const totalSpend = dec(agg._sum.spend);
  const totalSales = dec(agg._sum.attributedSales);
  const clicks = dec(agg._sum.clicks);
  const impressions = dec(agg._sum.impressions);
  const orders = dec(agg._sum.orders);

  // Daily time series
  const dailyRows = await prisma.dailyAd.groupBy({
    by: ["date"],
    where: { productId: { in: productIds }, campaignName, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { date: "asc" },
  });

  const dailyData: PPCChartDataPoint[] = dailyRows.map((r) => {
    const s = dec(r._sum.spend);
    const sa = dec(r._sum.attributedSales);
    return {
      date: r.date.toISOString().slice(0, 10),
      adSpend: s, ppcSales: sa, profit: sa - s,
      acos: pct(s, sa),
      impressions: dec(r._sum.impressions),
      clicks: dec(r._sum.clicks),
      orders: dec(r._sum.orders),
    };
  });

  // Per-product breakdown
  const prodRows = await prisma.dailyAd.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, campaignName, date: { gte: dateFrom, lte: dateTo } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    orderBy: { _sum: { spend: "desc" } },
  });

  const productBreakdown: CampaignProductBreakdown[] = prodRows.map((r) => {
    const prod = products.find((p) => p.id === r.productId);
    const s = dec(r._sum.spend);
    const sa = dec(r._sum.attributedSales);
    return {
      productId: r.productId, asin: prod?.asin ?? "Unknown", title: prod?.title ?? "Unknown",
      adSpend: s, ppcSales: sa, profit: sa - s, acos: pct(s, sa),
      orders: dec(r._sum.orders), clicks: dec(r._sum.clicks), impressions: dec(r._sum.impressions),
    };
  });

  // Infer type
  let campaignType = "SP";
  const lower = campaignName.toLowerCase();
  if (lower.includes(" sb ") || lower.includes("-sb-")) campaignType = "SB";
  else if (lower.includes(" sd ") || lower.includes("-sd-")) campaignType = "SD";
  else if (lower.includes(" sbv") || lower.includes("video")) campaignType = "SBV";

  console.log(`[ppc] getCampaignDetail: "${campaignName.slice(0, 40)}" | spend=$${totalSpend.toFixed(2)}, ${dailyData.length} days, ${productBreakdown.length} products`);

  return {
    campaignName, campaignType,
    totalSpend, totalSales, totalProfit: totalSales - totalSpend,
    acos: pct(totalSpend, totalSales), roas: div(totalSales, totalSpend),
    impressions, clicks, orders,
    cpc: div(totalSpend, clicks), ctr: pct(clicks, impressions), conversionRate: pct(orders, clicks),
    dailyData, productBreakdown,
  };
}
