import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round } from "@/lib/utils/math";
import { todayUtc } from "@/lib/utils/dates";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PLMonthData = {
  revenue: number;
  cogs: number;
  adSpend: number;
  shipping: number;
  refunds: number;
  otherExpenses: number;
};

export type PLProductData = {
  name: string;
  months: Record<string, PLMonthData>;
};

export type PLViewData = {
  months: string[]; // e.g. ["Oct 2025", "Nov 2025", ...]
  products: PLProductData[];
};

// ─── Granularity-based types (Bug 1) ────────────────────────────────────

export type PLGranularity = "daily" | "weekly" | "monthly";

export type PLColumnMetrics = {
  sales: number;
  units: number;
  refundCount: number;
  promo: number;
  advertisingCost: number;
  refundCost: number;
  amazonFees: number;
  costOfGoods: number;
  grossProfit: number;
  indirectExpenses: number;
  netProfit: number;
  estimatedPayout: number;
  realAcos: number | null;
  tacos: number | null;
  refundPct: number | null;
  margin: number | null;
  roi: number | null;
};

export type PLColumn = {
  key: string;
  label: string;
  metrics: PLColumnMetrics;
};

export type PLColumnsResponse = {
  granularity: PLGranularity;
  columns: PLColumn[];
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

function toMonthLabel(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ─── Query ──────────────────────────────────────────────────────────────────

export async function getPLViewData(userId: string): Promise<PLViewData> {
  const today = todayUtc();
  const start = monthsAgo(5); // 6 months

  // Build month labels
  const months: string[] = [];
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = monthsAgo(i);
    months.push(toMonthLabel(d));
    monthKeys.push(toMonthKey(d));
  }

  // Get all active products
  const productList = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: { id: true, title: true, asin: true },
    orderBy: { createdAt: "desc" },
  });

  if (productList.length === 0) {
    return { months, products: [] };
  }

  const productIds = productList.map((p) => p.id);

  // Get COGS settings
  const cogsSettings = await prisma.productSetting.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, landedCogs: true },
  });
  const cogsMap = new Map(cogsSettings.map((s) => [s.productId, toNum(s.landedCogs)]));

  // Fetch daily data grouped by productId and date
  const [salesData, feesData, adsData] = await Promise.all([
    prisma.dailySale.groupBy({
      by: ["productId", "date"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { grossSales: true, unitsSold: true, refundAmount: true },
    }),
    prisma.dailyFee.groupBy({
      by: ["productId", "date"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { referralFee: true, fbaFee: true, storageFee: true, returnProcessingFee: true, otherFees: true },
    }),
    prisma.dailyAd.groupBy({
      by: ["productId", "date"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { spend: true },
    }),
  ]);

  // Build per-product per-month buckets
  type Bucket = {
    grossSales: number;
    refunds: number;
    unitsSold: number;
    referralFees: number;
    fbaFees: number;
    storageFees: number;
    returnFees: number;
    otherFees: number;
    adSpend: number;
  };

  const productMonthBuckets = new Map<string, Map<string, Bucket>>();

  function getBucket(productId: string, monthKey: string): Bucket {
    if (!productMonthBuckets.has(productId)) {
      productMonthBuckets.set(productId, new Map());
    }
    const pm = productMonthBuckets.get(productId)!;
    if (!pm.has(monthKey)) {
      pm.set(monthKey, {
        grossSales: 0, refunds: 0, unitsSold: 0,
        referralFees: 0, fbaFees: 0, storageFees: 0, returnFees: 0, otherFees: 0,
        adSpend: 0,
      });
    }
    return pm.get(monthKey)!;
  }

  for (const row of salesData) {
    const mk = toMonthKey(row.date);
    if (!monthKeys.includes(mk)) continue;
    const b = getBucket(row.productId, mk);
    b.grossSales += toNum(row._sum.grossSales);
    b.refunds += toNum(row._sum.refundAmount);
    b.unitsSold += row._sum.unitsSold ?? 0;
  }

  for (const row of feesData) {
    const mk = toMonthKey(row.date);
    if (!monthKeys.includes(mk)) continue;
    const b = getBucket(row.productId, mk);
    b.referralFees += toNum(row._sum.referralFee);
    b.fbaFees += toNum(row._sum.fbaFee);
    b.storageFees += toNum(row._sum.storageFee);
    b.returnFees += toNum(row._sum.returnProcessingFee);
    b.otherFees += toNum(row._sum.otherFees);
  }

  for (const row of adsData) {
    const mk = toMonthKey(row.date);
    if (!monthKeys.includes(mk)) continue;
    const b = getBucket(row.productId, mk);
    b.adSpend += toNum(row._sum.spend);
  }

  // Build product P&L data
  const products: PLProductData[] = productList.map((p) => {
    const pm = productMonthBuckets.get(p.id);
    const monthsData: Record<string, PLMonthData> = {};

    for (let i = 0; i < months.length; i++) {
      const mk = monthKeys[i];
      const label = months[i];
      const b = pm?.get(mk);
      const landedCogs = cogsMap.get(p.id) ?? 0;
      const unitsSold = b?.unitsSold ?? 0;

      monthsData[label] = {
        revenue: round(b?.grossSales ?? 0),
        cogs: round(landedCogs * unitsSold),
        adSpend: round(b?.adSpend ?? 0),
        shipping: round((b?.fbaFees ?? 0) + (b?.storageFees ?? 0)),
        refunds: round(b?.refunds ?? 0),
        otherExpenses: round((b?.referralFees ?? 0) + (b?.returnFees ?? 0) + (b?.otherFees ?? 0)),
      };
    }

    return {
      name: p.title ?? p.asin,
      months: monthsData,
    };
  });

  // Sort by total revenue descending
  products.sort((a, b) => {
    const aRev = Object.values(a.months).reduce((s, m) => s + m.revenue, 0);
    const bRev = Object.values(b.months).reduce((s, m) => s + m.revenue, 0);
    return bRev - aRev;
  });

  return { months, products };
}

// ─── Granularity-based P&L query (Bug 1) ────────────────────────────────

function toDayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // "2026-03-25"
}

function toDayLabel(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`; // "Mar 25"
}

function toWeekKey(d: Date): string {
  // ISO week: get Monday of the week
  const mon = new Date(d);
  const day = mon.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  mon.setUTCDate(mon.getUTCDate() + diff);
  return toDayKey(mon);
}

function toWeekLabel(mondayStr: string): string {
  const mon = new Date(mondayStr + "T00:00:00Z");
  const sun = new Date(mon);
  sun.setUTCDate(sun.getUTCDate() + 6);
  return `${MONTH_NAMES[mon.getUTCMonth()]} ${mon.getUTCDate()}-${sun.getUTCDate()}`;
}

type RawBucket = {
  grossSales: number;
  refunds: number;
  unitsSold: number;
  refundCount: number;
  referralFees: number;
  fbaFees: number;
  storageFees: number;
  returnFees: number;
  otherFees: number;
  adSpend: number;
  adSales: number;
  cogs: number;
};

function emptyBucket(): RawBucket {
  return {
    grossSales: 0, refunds: 0, unitsSold: 0, refundCount: 0,
    referralFees: 0, fbaFees: 0, storageFees: 0, returnFees: 0, otherFees: 0,
    adSpend: 0, adSales: 0, cogs: 0,
  };
}

function bucketToMetrics(b: RawBucket, dailyIndirectExpenses: number, days: number): PLColumnMetrics {
  const amazonFees = round(b.referralFees + b.fbaFees + b.storageFees + b.returnFees + b.otherFees);
  const grossProfit = round(b.grossSales - b.refunds - amazonFees - b.cogs - b.adSpend);
  const indirectExpenses = round(dailyIndirectExpenses * days);
  const netProfit = round(grossProfit - indirectExpenses);
  const estimatedPayout = round(b.grossSales - amazonFees - b.adSpend);

  return {
    sales: round(b.grossSales),
    units: b.unitsSold,
    refundCount: b.refundCount,
    promo: 0,
    advertisingCost: round(b.adSpend),
    refundCost: round(b.refunds),
    amazonFees,
    costOfGoods: round(b.cogs),
    grossProfit,
    indirectExpenses,
    netProfit,
    estimatedPayout,
    realAcos: b.adSales > 0 ? round(safeDiv(b.adSpend, b.adSales) * 100, 1) : null,
    tacos: b.grossSales > 0 ? round(safeDiv(b.adSpend, b.grossSales) * 100, 1) : null,
    refundPct: b.grossSales > 0 ? round(safeDiv(b.refunds, b.grossSales) * 100, 1) : null,
    margin: b.grossSales > 0 ? round(safeDiv(netProfit, b.grossSales) * 100, 1) : null,
    roi: b.cogs > 0 ? round(safeDiv(netProfit, b.cogs) * 100, 1) : null,
  };
}

export async function getPLColumnsData(
  userId: string,
  granularity: PLGranularity = "monthly",
  fromStr?: string,
  toStr?: string,
): Promise<PLColumnsResponse> {
  const today = fromStr && toStr ? new Date(toStr + "T23:59:59Z") : todayUtc();
  let start: Date;

  if (fromStr) {
    start = new Date(fromStr + "T00:00:00Z");
  } else if (granularity === "daily") {
    start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 29); // last 30 days
  } else if (granularity === "weekly") {
    start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 83); // ~12 weeks
  } else {
    start = monthsAgo(5); // 6 months
  }

  const productList = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: { id: true },
  });

  if (productList.length === 0) {
    return { granularity, columns: [] };
  }

  const productIds = productList.map((p) => p.id);

  // COGS
  const cogsSettings = await prisma.productSetting.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, landedCogs: true },
  });
  const cogsMap = new Map(cogsSettings.map((s) => [s.productId, toNum(s.landedCogs)]));

  // Fetch raw daily data (NOT grouped by month — we'll bucket ourselves)
  const [salesData, feesData, adsData] = await Promise.all([
    prisma.dailySale.groupBy({
      by: ["productId", "date"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { grossSales: true, unitsSold: true, refundAmount: true, refundCount: true },
    }),
    prisma.dailyFee.groupBy({
      by: ["productId", "date"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { referralFee: true, fbaFee: true, storageFee: true, returnProcessingFee: true, otherFees: true },
    }),
    prisma.dailyAd.groupBy({
      by: ["productId", "date"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { spend: true, attributedSales: true },
    }),
  ]);

  // Indirect expenses (monthly total, prorated to daily)
  const expenses = await prisma.expense.findMany({
    where: { userId, archivedAt: null },
  });
  const monthlyExpenseTotal = expenses.reduce((sum, e) => {
    const freq = (e.frequency as string)?.toLowerCase() ?? "monthly";
    const amt = toNum(e.amount);
    if (freq === "monthly" || freq === "one_time") return sum + amt;
    if (freq === "weekly") return sum + amt * 4.33;
    if (freq === "quarterly") return sum + amt / 3;
    if (freq === "annually") return sum + amt / 12;
    return sum + amt;
  }, 0);
  const dailyIndirectExpenses = monthlyExpenseTotal / 30;

  // Determine bucket key function
  const toBucketKey = granularity === "daily"
    ? (d: Date) => toDayKey(d)
    : granularity === "weekly"
    ? (d: Date) => toWeekKey(d)
    : (d: Date) => toMonthKey(d);

  // Aggregate into buckets
  const buckets = new Map<string, RawBucket>();
  const getBucket = (key: string) => {
    if (!buckets.has(key)) buckets.set(key, emptyBucket());
    return buckets.get(key)!;
  };

  for (const row of salesData) {
    const key = toBucketKey(row.date);
    const b = getBucket(key);
    b.grossSales += toNum(row._sum.grossSales);
    b.refunds += toNum(row._sum.refundAmount);
    b.unitsSold += row._sum.unitsSold ?? 0;
    b.refundCount += row._sum.refundCount ?? 0;
    b.cogs += (cogsMap.get(row.productId) ?? 0) * (row._sum.unitsSold ?? 0);
  }

  for (const row of feesData) {
    const key = toBucketKey(row.date);
    const b = getBucket(key);
    b.referralFees += toNum(row._sum.referralFee);
    b.fbaFees += toNum(row._sum.fbaFee);
    b.storageFees += toNum(row._sum.storageFee);
    b.returnFees += toNum(row._sum.returnProcessingFee);
    b.otherFees += toNum(row._sum.otherFees);
  }

  for (const row of adsData) {
    const key = toBucketKey(row.date);
    const b = getBucket(key);
    b.adSpend += toNum(row._sum.spend);
    b.adSales += toNum(row._sum.attributedSales);
  }

  // Build ordered columns (most recent first)
  const sortedKeys = [...buckets.keys()].sort().reverse();

  const columns: PLColumn[] = sortedKeys.map((key) => {
    const b = buckets.get(key)!;
    let label: string;
    let days: number;

    if (granularity === "daily") {
      label = toDayLabel(new Date(key + "T00:00:00Z"));
      days = 1;
    } else if (granularity === "weekly") {
      label = toWeekLabel(key);
      days = 7;
    } else {
      const d = new Date(key + "-01T00:00:00Z");
      label = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`.toUpperCase();
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    }

    return { key, label, metrics: bucketToMetrics(b, dailyIndirectExpenses, days) };
  });

  console.log(`[pl-service] granularity=${granularity}, columns=${columns.length}, first=${columns[0]?.label}`);
  return { granularity, columns };
}
