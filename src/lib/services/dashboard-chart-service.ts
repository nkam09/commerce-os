import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round } from "@/lib/utils/math";
import { todayUtc } from "@/lib/utils/dates";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MonthlyTimeSeriesPoint = {
  month: string; // "Jan", "Feb", etc.
  year: number;
  label: string; // "Jan 2026"
  revenue: number;
  adSpend: number;
  profit: number;
  unitsSold: number;
  acosPct: number; // 0-100 range
};

export type ProductPerformanceRow = {
  name: string;
  revenue: number;
  profit: number;
  units: number;
  acosPct: number;
  marginPct: number;
};

export type ChartViewData = {
  monthly: MonthlyTimeSeriesPoint[];
  products: ProductPerformanceRow[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthsAgo(n: number): Date {
  const d = todayUtc();
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(1);
  return d;
}

// ─── Query ──────────────────────────────────────────────────────────────────

export async function getChartViewData(userId: string): Promise<ChartViewData> {
  const today = todayUtc();
  const start = monthsAgo(11); // 12 months back (including current month)

  // ── Monthly aggregates via raw SQL for date_trunc ─────────────────────
  // We group by year-month using Prisma's raw query for date_trunc,
  // but we can achieve this with groupBy on date if we post-process.

  const [salesByDate, feesByDate, adsByDate, cogsData] = await Promise.all([
    prisma.dailySale.groupBy({
      by: ["date"],
      where: { product: { userId }, date: { gte: start, lte: today } },
      _sum: { grossSales: true, unitsSold: true, refundAmount: true },
    }),
    prisma.dailyFee.groupBy({
      by: ["date"],
      where: { product: { userId }, date: { gte: start, lte: today } },
      _sum: { referralFee: true, fbaFee: true, storageFee: true, returnProcessingFee: true, otherFees: true },
    }),
    prisma.dailyAd.groupBy({
      by: ["date"],
      where: { product: { userId }, date: { gte: start, lte: today } },
      _sum: { spend: true, attributedSales: true },
    }),
    // Get COGS per product for the period
    prisma.dailySale.groupBy({
      by: ["productId", "date"],
      where: { product: { userId }, date: { gte: start, lte: today } },
      _sum: { unitsSold: true },
    }),
  ]);

  // Build COGS lookup
  const productIds = [...new Set(cogsData.map((c) => c.productId))];
  const settings = productIds.length > 0
    ? await prisma.productSetting.findMany({
        where: { productId: { in: productIds } },
        select: { productId: true, landedCogs: true },
      })
    : [];
  const cogsMap = new Map(settings.map((s) => [s.productId, toNum(s.landedCogs)]));

  // Aggregate COGS by date
  const cogsByDate = new Map<string, number>();
  for (const row of cogsData) {
    const key = toMonthKey(row.date);
    const cogs = cogsMap.get(row.productId) ?? 0;
    cogsByDate.set(key, (cogsByDate.get(key) ?? 0) + cogs * (row._sum.unitsSold ?? 0));
  }

  // ── Aggregate daily data into monthly buckets ─────────────────────────

  type MonthBucket = {
    grossSales: number;
    refunds: number;
    unitsSold: number;
    referralFees: number;
    fbaFees: number;
    storageFees: number;
    returnFees: number;
    otherFees: number;
    adSpend: number;
    adSales: number;
  };

  const buckets = new Map<string, MonthBucket>();

  function getBucket(key: string): MonthBucket {
    if (!buckets.has(key)) {
      buckets.set(key, {
        grossSales: 0, refunds: 0, unitsSold: 0,
        referralFees: 0, fbaFees: 0, storageFees: 0, returnFees: 0, otherFees: 0,
        adSpend: 0, adSales: 0,
      });
    }
    return buckets.get(key)!;
  }

  for (const row of salesByDate) {
    const key = toMonthKey(row.date);
    const b = getBucket(key);
    b.grossSales += toNum(row._sum.grossSales);
    b.refunds += toNum(row._sum.refundAmount);
    b.unitsSold += row._sum.unitsSold ?? 0;
  }

  for (const row of feesByDate) {
    const key = toMonthKey(row.date);
    const b = getBucket(key);
    b.referralFees += toNum(row._sum.referralFee);
    b.fbaFees += toNum(row._sum.fbaFee);
    b.storageFees += toNum(row._sum.storageFee);
    b.returnFees += toNum(row._sum.returnProcessingFee);
    b.otherFees += toNum(row._sum.otherFees);
  }

  for (const row of adsByDate) {
    const key = toMonthKey(row.date);
    const b = getBucket(key);
    b.adSpend += toNum(row._sum.spend);
    b.adSales += toNum(row._sum.attributedSales);
  }

  // ── Build ordered monthly array ───────────────────────────────────────

  const monthly: MonthlyTimeSeriesPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = monthsAgo(i);
    const key = toMonthKey(d);
    const b = buckets.get(key);
    const totalCogs = cogsByDate.get(key) ?? 0;

    const grossSales = b?.grossSales ?? 0;
    const refunds = b?.refunds ?? 0;
    const netRevenue = grossSales - refunds;
    const totalFees = (b?.referralFees ?? 0) + (b?.fbaFees ?? 0) + (b?.storageFees ?? 0) + (b?.returnFees ?? 0) + (b?.otherFees ?? 0);
    const adSpend = b?.adSpend ?? 0;
    const adSales = b?.adSales ?? 0;
    const profit = netRevenue - totalFees - totalCogs - adSpend;
    const unitsSold = b?.unitsSold ?? 0;
    const acosPct = adSales > 0 ? round((adSpend / adSales) * 100, 1) : 0;

    monthly.push({
      month: MONTH_NAMES[d.getUTCMonth()],
      year: d.getUTCFullYear(),
      label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      revenue: round(netRevenue),
      adSpend: round(adSpend),
      profit: round(profit),
      unitsSold,
      acosPct,
    });
  }

  // ── Product performance (last 12 months aggregate) ────────────────────

  const products = await queryProductPerformance(userId, start, today, cogsMap);

  return { monthly, products };
}

// ─── Product performance query ──────────────────────────────────────────────

async function queryProductPerformance(
  userId: string,
  start: Date,
  end: Date,
  cogsMap: Map<string, number>
): Promise<ProductPerformanceRow[]> {
  const productList = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: { id: true, title: true, asin: true },
  });

  if (productList.length === 0) return [];

  const productIds = productList.map((p) => p.id);

  const [salesByProduct, feesByProduct, adsByProduct] = await Promise.all([
    prisma.dailySale.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: end } },
      _sum: { grossSales: true, unitsSold: true, refundAmount: true },
    }),
    prisma.dailyFee.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: end } },
      _sum: { referralFee: true, fbaFee: true, storageFee: true, returnProcessingFee: true, otherFees: true },
    }),
    prisma.dailyAd.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: end } },
      _sum: { spend: true, attributedSales: true },
    }),
  ]);

  const salesMap = new Map(salesByProduct.map((s) => [s.productId, s._sum]));
  const feesMap = new Map(feesByProduct.map((f) => [f.productId, f._sum]));
  const adsMap = new Map(adsByProduct.map((a) => [a.productId, a._sum]));

  const nameMap = new Map(productList.map((p) => [p.id, p.title ?? p.asin]));

  const rows: ProductPerformanceRow[] = productList.map((p) => {
    const sales = salesMap.get(p.id);
    const fees = feesMap.get(p.id);
    const ads = adsMap.get(p.id);

    const grossSales = toNum(sales?.grossSales);
    const refunds = toNum(sales?.refundAmount);
    const netRevenue = grossSales - refunds;
    const unitsSold = sales?.unitsSold ?? 0;

    const totalFees =
      toNum(fees?.referralFee) + toNum(fees?.fbaFee) + toNum(fees?.storageFee) +
      toNum(fees?.returnProcessingFee) + toNum(fees?.otherFees);

    const adSpend = toNum(ads?.spend);
    const adSales = toNum(ads?.attributedSales);
    const landedCogs = cogsMap.get(p.id) ?? 0;
    const totalCogs = landedCogs * unitsSold;
    const profit = netRevenue - totalFees - totalCogs - adSpend;

    return {
      name: nameMap.get(p.id) ?? p.asin,
      revenue: round(netRevenue),
      profit: round(profit),
      units: unitsSold,
      acosPct: adSales > 0 ? round((adSpend / adSales) * 100, 1) : 0,
      marginPct: netRevenue > 0 ? round(safeDiv(profit, netRevenue) * 100, 1) : 0,
    };
  });

  // Sort by revenue descending, return top products
  return rows.sort((a, b) => b.revenue - a.revenue).slice(0, 10);
}

// ─── Utility ────────────────────────────────────────────────────────────────

function toMonthKey(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
