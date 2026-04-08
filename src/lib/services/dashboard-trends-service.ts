import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round } from "@/lib/utils/math";
import { todayUtc } from "@/lib/utils/dates";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TrendsMonthlyData = {
  month: string; // "Oct", "Nov", etc.
  grossSales: number;
  netRevenue: number;
  netProfit: number;
  unitsSold: number;
  orderCount: number;
  adSpend: number;
  acos: number; // decimal, e.g. 0.22
  tacos: number; // decimal
  netMarginPct: number; // decimal
  profitPerUnit: number;
};

export type ProductTrendData = {
  productId: string;
  title: string;
  asin: string;
  sku: string;
  imageUrl: string | null;
  /** Per-month values matching monthly array order */
  monthly: TrendsMonthlyData[];
};

export type TrendsViewData = {
  monthly: TrendsMonthlyData[];
  products: ProductTrendData[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthsAgo(n: number): Date {
  const d = todayUtc();
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(1);
  return d;
}

function toMonthKey(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── Query ──────────────────────────────────────────────────────────────────

export async function getTrendsViewData(userId: string): Promise<TrendsViewData> {
  const today = todayUtc();
  const start = monthsAgo(5); // 6 months

  // Fetch all daily data grouped by date
  const [salesByDate, feesByDate, adsByDate, cogsData] = await Promise.all([
    prisma.dailySale.groupBy({
      by: ["date"],
      where: { product: { userId }, date: { gte: start, lte: today } },
      _sum: { grossSales: true, unitsSold: true, orderCount: true, refundAmount: true },
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

  // Aggregate COGS by month key
  const cogsByMonth = new Map<string, number>();
  for (const row of cogsData) {
    const key = toMonthKey(row.date);
    const cogs = cogsMap.get(row.productId) ?? 0;
    cogsByMonth.set(key, (cogsByMonth.get(key) ?? 0) + cogs * (row._sum.unitsSold ?? 0));
  }

  // Aggregate into monthly buckets
  type MonthBucket = {
    grossSales: number;
    refunds: number;
    unitsSold: number;
    orderCount: number;
    totalFees: number;
    adSpend: number;
    adSales: number;
  };

  const buckets = new Map<string, MonthBucket>();

  function getBucket(key: string): MonthBucket {
    if (!buckets.has(key)) {
      buckets.set(key, {
        grossSales: 0, refunds: 0, unitsSold: 0, orderCount: 0,
        totalFees: 0, adSpend: 0, adSales: 0,
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
    b.orderCount += row._sum.orderCount ?? 0;
  }

  for (const row of feesByDate) {
    const key = toMonthKey(row.date);
    const b = getBucket(key);
    b.totalFees += toNum(row._sum.referralFee) + toNum(row._sum.fbaFee) +
      toNum(row._sum.storageFee) + toNum(row._sum.returnProcessingFee) + toNum(row._sum.otherFees);
  }

  for (const row of adsByDate) {
    const key = toMonthKey(row.date);
    const b = getBucket(key);
    b.adSpend += toNum(row._sum.spend);
    b.adSales += toNum(row._sum.attributedSales);
  }

  // Build ordered monthly array (6 months)
  const monthly: TrendsMonthlyData[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = monthsAgo(i);
    const key = toMonthKey(d);
    const b = buckets.get(key);
    const totalCogs = cogsByMonth.get(key) ?? 0;

    const grossSales = round(b?.grossSales ?? 0);
    const refunds = round(b?.refunds ?? 0);
    const netRevenue = round(grossSales - refunds);
    const totalFees = round(b?.totalFees ?? 0);
    const adSpend = round(b?.adSpend ?? 0);
    const adSales = round(b?.adSales ?? 0);
    const unitsSold = b?.unitsSold ?? 0;
    const orderCount = b?.orderCount ?? 0;
    const netProfit = round(netRevenue - totalFees - totalCogs - adSpend);

    monthly.push({
      month: MONTH_NAMES[d.getUTCMonth()],
      grossSales,
      netRevenue,
      netProfit,
      unitsSold,
      orderCount,
      adSpend,
      acos: adSales > 0 ? round(safeDiv(adSpend, adSales), 4) : 0,
      tacos: grossSales > 0 ? round(safeDiv(adSpend, grossSales), 4) : 0,
      netMarginPct: netRevenue > 0 ? round(safeDiv(netProfit, netRevenue), 4) : 0,
      profitPerUnit: unitsSold > 0 ? round(safeDiv(netProfit, unitsSold), 2) : 0,
    });
  }

  // ── Per-product monthly data ────────────────────────────────────────────────

  // Get products for the user
  const products = await prisma.product.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, title: true, asin: true, sku: true, imageUrl: true },
  });

  // Per-product per-month sales, fees, ads
  const [perProdSales, perProdFees, perProdAds] = await Promise.all([
    prisma.dailySale.groupBy({
      by: ["productId", "date"],
      where: { product: { userId }, date: { gte: start, lte: today } },
      _sum: { grossSales: true, unitsSold: true, orderCount: true, refundAmount: true },
    }),
    prisma.dailyFee.groupBy({
      by: ["productId", "date"],
      where: { product: { userId }, date: { gte: start, lte: today } },
      _sum: { referralFee: true, fbaFee: true, storageFee: true, returnProcessingFee: true, otherFees: true },
    }),
    prisma.dailyAd.groupBy({
      by: ["productId", "date"],
      where: { product: { userId }, date: { gte: start, lte: today } },
      _sum: { spend: true, attributedSales: true },
    }),
  ]);

  // Build per-product per-month buckets
  type ProdMonthBucket = { grossSales: number; refunds: number; unitsSold: number; orderCount: number; totalFees: number; adSpend: number; adSales: number };
  const prodBuckets = new Map<string, ProdMonthBucket>(); // key: productId::monthKey

  for (const row of perProdSales) {
    const k = `${row.productId}::${toMonthKey(row.date)}`;
    if (!prodBuckets.has(k)) prodBuckets.set(k, { grossSales: 0, refunds: 0, unitsSold: 0, orderCount: 0, totalFees: 0, adSpend: 0, adSales: 0 });
    const b = prodBuckets.get(k)!;
    b.grossSales += toNum(row._sum.grossSales);
    b.refunds += toNum(row._sum.refundAmount);
    b.unitsSold += row._sum.unitsSold ?? 0;
    b.orderCount += row._sum.orderCount ?? 0;
  }
  for (const row of perProdFees) {
    const k = `${row.productId}::${toMonthKey(row.date)}`;
    if (!prodBuckets.has(k)) prodBuckets.set(k, { grossSales: 0, refunds: 0, unitsSold: 0, orderCount: 0, totalFees: 0, adSpend: 0, adSales: 0 });
    const b = prodBuckets.get(k)!;
    b.totalFees += toNum(row._sum.referralFee) + toNum(row._sum.fbaFee) + toNum(row._sum.storageFee) + toNum(row._sum.returnProcessingFee) + toNum(row._sum.otherFees);
  }
  for (const row of perProdAds) {
    const k = `${row.productId}::${toMonthKey(row.date)}`;
    if (!prodBuckets.has(k)) prodBuckets.set(k, { grossSales: 0, refunds: 0, unitsSold: 0, orderCount: 0, totalFees: 0, adSpend: 0, adSales: 0 });
    const b = prodBuckets.get(k)!;
    b.adSpend += toNum(row._sum.spend);
    b.adSales += toNum(row._sum.attributedSales);
  }

  const productTrends: ProductTrendData[] = products.map((p) => {
    const prodMonthly: TrendsMonthlyData[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = monthsAgo(i);
      const key = toMonthKey(d);
      const b = prodBuckets.get(`${p.id}::${key}`);
      const prodCogs = cogsMap.get(p.id) ?? 0;

      const gs = round(b?.grossSales ?? 0);
      const ref = round(b?.refunds ?? 0);
      const nr = round(gs - ref);
      const tf = round(b?.totalFees ?? 0);
      const as2 = round(b?.adSpend ?? 0);
      const adSales2 = round(b?.adSales ?? 0);
      const us = b?.unitsSold ?? 0;
      const oc = b?.orderCount ?? 0;
      const tc = round(prodCogs * us);
      const np = round(nr - tf - tc - as2);

      prodMonthly.push({
        month: MONTH_NAMES[d.getUTCMonth()],
        grossSales: gs,
        netRevenue: nr,
        netProfit: np,
        unitsSold: us,
        orderCount: oc,
        adSpend: as2,
        acos: adSales2 > 0 ? round(safeDiv(as2, adSales2), 4) : 0,
        tacos: gs > 0 ? round(safeDiv(as2, gs), 4) : 0,
        netMarginPct: nr > 0 ? round(safeDiv(np, nr), 4) : 0,
        profitPerUnit: us > 0 ? round(safeDiv(np, us), 2) : 0,
      });
    }

    return {
      productId: p.id,
      title: p.title ?? p.asin,
      asin: p.asin,
      sku: p.sku ?? "",
      imageUrl: p.imageUrl ?? null,
      monthly: prodMonthly,
    };
  });

  return { monthly, products: productTrends };
}
