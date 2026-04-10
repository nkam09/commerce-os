import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round } from "@/lib/utils/math";
import { daysAgo, todayUtc } from "@/lib/utils/dates";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PeriodMetrics = {
  label: string;
  periodKey: string;
  dateRange: { from: string; to: string };
  isForecast?: boolean;

  // Top-line
  grossSales: number;
  refunds: number;
  refundCount: number;
  netRevenue: number;

  // Units & orders
  unitsSold: number;
  orderCount: number;

  // Fees breakdown
  referralFees: number;
  fbaFees: number;
  storageFees: number;
  awdStorageFees: number;
  returnProcessingFees: number;
  otherFees: number;
  totalFees: number;

  // Advertising
  adSpend: number;
  adSales: number;
  adImpressions: number;
  adClicks: number;
  acos: number | null;
  roas: number | null;
  tacos: number | null;
  cpc: number | null;
  ctr: number | null;

  // COGS & Profit
  totalCogs: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPct: number | null;
  netMarginPct: number | null;
  profitPerUnit: number | null;

  // Reimbursements
  reimbursements: number;

  // Indirect expenses
  indirectExpenses: Array<{ name: string; amount: number }>;
  indirectExpenseTotal: number;

  // ROI
  roi: number | null;
};

export type ProductRow = {
  id: string;
  asin: string;
  sku: string | null;
  title: string | null;
  imageUrl: string | null;
  status: string;

  // Sales
  grossSales: number;
  refunds: number;
  refundCount: number;
  netRevenue: number;
  unitsSold: number;
  orderCount: number;

  // Fees
  totalFees: number;

  // Ads
  adSpend: number;
  adSales: number;
  acos: number | null;
  tacos: number | null;

  // Profit
  totalCogs: number;
  netProfit: number;
  netMarginPct: number | null;
  profitPerUnit: number | null;

  // Inventory
  available: number;
  daysLeft: number | null;
};

export type DashboardTilesData = {
  periods: PeriodMetrics[];
  products: ProductRow[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
}

type PeriodDef = {
  label: string;
  key: string;
  from: Date;
  to: Date;
  isForecast?: boolean;
  forecastTotalDays?: number;
  forecastElapsedDays?: number;
};

export type TilesCombo = "default" | "days" | "weeks" | "months" | "quarters";

function buildPeriodDefs(combo: TilesCombo = "default"): PeriodDef[] {
  const now = todayUtc();
  const yesterday = daysAgo(1);
  const mtdStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const lastMonthStart = startOfMonth(lastMonthEnd);

  const forecastTotalDays = daysBetween(mtdStart, monthEnd);
  const forecastElapsedDays = daysBetween(mtdStart, now);

  switch (combo) {
    case "days":
      return [
        { label: "Today", key: "today", from: now, to: now },
        { label: "Yesterday", key: "yesterday", from: yesterday, to: yesterday },
        { label: "Last 7 Days", key: "last_7", from: daysAgo(6), to: now },
        { label: "Last 14 Days", key: "last_14", from: daysAgo(13), to: now },
        { label: "Last 30 Days", key: "last_30", from: daysAgo(29), to: now },
      ];

    case "weeks": {
      const dayOfWeek = now.getUTCDay(); // 0=Sun
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisWeekMon = new Date(now);
      thisWeekMon.setUTCDate(thisWeekMon.getUTCDate() + mondayOffset);
      const weeksResult: PeriodDef[] = [
        { label: "This Week", key: "this_week", from: thisWeekMon, to: now },
      ];
      for (let i = 1; i <= 3; i++) {
        const mon = new Date(thisWeekMon);
        mon.setUTCDate(mon.getUTCDate() - 7 * i);
        const sun = new Date(mon);
        sun.setUTCDate(sun.getUTCDate() + 6);
        weeksResult.push({
          label: i === 1 ? "Last Week" : `${i} Weeks Ago`,
          key: `week_${i}`,
          from: mon,
          to: sun,
        });
      }
      return weeksResult;
    }

    case "months": {
      const monthsResult: PeriodDef[] = [
        { label: "MTD", key: "mtd", from: mtdStart, to: now },
        { label: "Last Month", key: "last_month", from: lastMonthStart, to: lastMonthEnd },
      ];
      for (let i = 2; i <= 3; i++) {
        const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const mEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0));
        monthsResult.push({
          label: `${i} Months Ago`,
          key: `month_${i}`,
          from: mStart,
          to: mEnd,
        });
      }
      return monthsResult;
    }

    case "quarters": {
      const currentQ = Math.floor(now.getUTCMonth() / 3);
      const quartersResult: PeriodDef[] = [];
      for (let i = 0; i <= 2; i++) {
        const qIdx = currentQ - i;
        const year = now.getUTCFullYear() + Math.floor(qIdx / 4) * (qIdx < 0 ? 1 : 0);
        const adjustedQ = ((qIdx % 4) + 4) % 4;
        const qStart = new Date(Date.UTC(
          qIdx < 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(),
          adjustedQ * 3, 1
        ));
        const qEnd = i === 0 ? now : new Date(Date.UTC(qStart.getUTCFullYear(), qStart.getUTCMonth() + 3, 0));
        quartersResult.push({
          label: i === 0 ? "This Quarter" : i === 1 ? "Last Quarter" : `${i} Quarters Ago`,
          key: `quarter_${i}`,
          from: qStart,
          to: qEnd,
        });
      }
      return quartersResult;
    }

    default: // "default"
      return [
        { label: "Today", key: "today", from: now, to: now },
        { label: "Yesterday", key: "yesterday", from: yesterday, to: yesterday },
        { label: "MTD", key: "mtd", from: mtdStart, to: now },
        {
          label: "This Month Forecast",
          key: "forecast",
          from: mtdStart,
          to: now,
          isForecast: true,
          forecastTotalDays,
          forecastElapsedDays,
        },
        { label: "Last Month", key: "last_month", from: lastMonthStart, to: lastMonthEnd },
      ];
  }
}

// ─── Query logic ────────────────────────────────────────────────────────────

async function queryPeriodMetrics(
  userId: string,
  period: PeriodDef
): Promise<PeriodMetrics> {
  const [salesAgg, feesAgg, adsAgg, reimbAgg] = await Promise.all([
    prisma.dailySale.aggregate({
      where: { product: { userId }, date: { gte: period.from, lte: period.to } },
      _sum: { grossSales: true, unitsSold: true, orderCount: true, refundAmount: true, refundCount: true },
    }),
    prisma.dailyFee.aggregate({
      where: { product: { userId }, date: { gte: period.from, lte: period.to } },
      _sum: { referralFee: true, fbaFee: true, storageFee: true, awdStorageFee: true, returnProcessingFee: true, otherFees: true },
    }),
    prisma.dailyAd.aggregate({
      where: { product: { userId }, date: { gte: period.from, lte: period.to } },
      _sum: { spend: true, attributedSales: true, impressions: true, clicks: true },
    }),
    prisma.reimbursement.aggregate({
      where: { product: { userId }, reimburseDate: { gte: period.from, lte: period.to } },
      _sum: { amountTotal: true },
    }),
  ]);

  const grossSales = toNum(salesAgg._sum.grossSales);
  const refunds = toNum(salesAgg._sum.refundAmount);
  const refundCount = salesAgg._sum.refundCount ?? 0;
  const netRevenue = grossSales - refunds;
  const unitsSold = salesAgg._sum.unitsSold ?? 0;
  const orderCount = salesAgg._sum.orderCount ?? 0;

  const referralFees = toNum(feesAgg._sum.referralFee);
  const fbaFees = toNum(feesAgg._sum.fbaFee);
  const storageFees = toNum(feesAgg._sum.storageFee);
  const awdStorageFees = toNum(feesAgg._sum.awdStorageFee);
  const returnProcessingFees = toNum(feesAgg._sum.returnProcessingFee);
  const otherFees = toNum(feesAgg._sum.otherFees);
  const totalFees = referralFees + fbaFees + storageFees + awdStorageFees + returnProcessingFees + otherFees;

  const adSpend = toNum(adsAgg._sum.spend);
  const adSales = toNum(adsAgg._sum.attributedSales);
  const adImpressions = adsAgg._sum.impressions ?? 0;
  const adClicks = adsAgg._sum.clicks ?? 0;
  const reimbursements = toNum(reimbAgg._sum.amountTotal);

  // COGS: Sum product-level COGS * units
  const cogsData = await prisma.dailySale.groupBy({
    by: ["productId"],
    where: { product: { userId }, date: { gte: period.from, lte: period.to } },
    _sum: { unitsSold: true },
  });
  let totalCogs = 0;
  if (cogsData.length > 0) {
    const productIds = cogsData.map((c) => c.productId);
    const settings = await prisma.productSetting.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, landedCogs: true },
    });
    const cogsMap = new Map(settings.map((s) => [s.productId, toNum(s.landedCogs)]));
    totalCogs = cogsData.reduce((sum, c) => {
      const cogs = cogsMap.get(c.productId) ?? 0;
      return sum + cogs * (c._sum.unitsSold ?? 0);
    }, 0);
  }

  // ── Indirect expenses ────────────────────────────────────────────────────
  let indirectExpenseTotal = 0;
  const indirectExpenseItems: Array<{ name: string; amount: number }> = [];
  try {
    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        archivedAt: null,
        OR: [
          { frequency: "ONE_TIME", effectiveAt: { gte: period.from, lte: period.to } },
          { frequency: { not: "ONE_TIME" }, effectiveAt: { lte: period.to }, endsAt: null },
          { frequency: { not: "ONE_TIME" }, effectiveAt: { lte: period.to }, endsAt: { gte: period.from } },
        ],
      },
      select: { name: true, amount: true, frequency: true },
    });
    const windowDays = Math.max(1, daysBetween(period.from, period.to) + 1);
    for (const exp of expenses) {
      const amt = toNum(exp.amount);
      let periodAmt = amt;
      if (exp.frequency === "MONTHLY") periodAmt = round(amt * windowDays / 30);
      else if (exp.frequency === "WEEKLY") periodAmt = round(amt * windowDays / 7);
      else if (exp.frequency === "QUARTERLY") periodAmt = round(amt * windowDays / 90);
      else if (exp.frequency === "ANNUALLY") periodAmt = round(amt * windowDays / 365);
      indirectExpenseTotal += periodAmt;
      indirectExpenseItems.push({ name: exp.name, amount: round(periodAmt) });
    }
    indirectExpenseTotal = round(indirectExpenseTotal);
  } catch { /* expense table may not exist yet */ }

  const grossProfit = netRevenue - totalFees - totalCogs;
  const netProfit = grossProfit - adSpend + reimbursements - indirectExpenseTotal;

  // Apply forecast multiplier if needed
  const multiplier =
    period.isForecast && period.forecastElapsedDays && period.forecastTotalDays
      ? period.forecastTotalDays / period.forecastElapsedDays
      : 1;

  const scale = (v: number) => round(v * multiplier);

  return {
    label: period.label,
    periodKey: period.key,
    dateRange: {
      from: period.from.toISOString(),
      to: period.isForecast
        ? endOfMonth(period.from).toISOString()
        : period.to.toISOString(),
    },
    isForecast: period.isForecast,

    grossSales: scale(grossSales),
    refunds: scale(refunds),
    refundCount: Math.round(refundCount * multiplier),
    netRevenue: scale(netRevenue),
    unitsSold: Math.round(unitsSold * multiplier),
    orderCount: Math.round(orderCount * multiplier),

    referralFees: scale(referralFees),
    fbaFees: scale(fbaFees),
    storageFees: scale(storageFees),
    awdStorageFees: scale(awdStorageFees),
    returnProcessingFees: scale(returnProcessingFees),
    otherFees: scale(otherFees),
    totalFees: scale(totalFees),

    adSpend: scale(adSpend),
    adSales: scale(adSales),
    adImpressions: Math.round(adImpressions * multiplier),
    adClicks: Math.round(adClicks * multiplier),
    acos: adSales > 0 ? round(safeDiv(adSpend, adSales), 4) : null,
    roas: adSpend > 0 ? round(safeDiv(adSales, adSpend), 2) : null,
    tacos: grossSales > 0 ? round(safeDiv(adSpend, grossSales), 4) : null,
    cpc: adClicks > 0 ? round(safeDiv(adSpend, adClicks), 2) : null,
    ctr: adImpressions > 0 ? round(safeDiv(adClicks, adImpressions), 4) : null,

    totalCogs: scale(totalCogs),
    grossProfit: scale(grossProfit),
    netProfit: scale(netProfit),
    grossMarginPct: netRevenue > 0 ? round(safeDiv(grossProfit, netRevenue), 4) : null,
    netMarginPct: netRevenue > 0 ? round(safeDiv(netProfit, netRevenue), 4) : null,
    profitPerUnit: unitsSold > 0 ? round(safeDiv(netProfit, unitsSold), 2) : null,

    reimbursements: scale(reimbursements),

    indirectExpenses: indirectExpenseItems.map(e => ({ ...e, amount: round(e.amount * multiplier) })),
    indirectExpenseTotal: scale(indirectExpenseTotal),
    roi: totalCogs > 0 ? round(safeDiv(netProfit, totalCogs), 4) : null,
  };
}

export async function queryProductRows(
  userId: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<ProductRow[]> {
  const start = dateFrom ?? daysAgo(30);
  const today = dateTo ?? todayUtc();

  // Get products with settings and latest inventory
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      asin: true,
      sku: true,
      title: true,
      imageUrl: true,
      status: true,
      setting: { select: { landedCogs: true } },
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
        select: { available: true, inbound: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (products.length === 0) return [];

  const productIds = products.map((p) => p.id);

  // Batch query all 30d aggregates
  const [salesByProduct, feesByProduct, adsByProduct] = await Promise.all([
    prisma.dailySale.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { grossSales: true, unitsSold: true, orderCount: true, refundAmount: true, refundCount: true },
    }),
    prisma.dailyFee.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { referralFee: true, fbaFee: true, storageFee: true, awdStorageFee: true, returnProcessingFee: true, otherFees: true },
    }),
    prisma.dailyAd.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { spend: true, attributedSales: true },
    }),
  ]);

  const salesMap = new Map(salesByProduct.map((s) => [s.productId, s._sum]));
  const feesMap = new Map(feesByProduct.map((f) => [f.productId, f._sum]));
  const adsMap = new Map(adsByProduct.map((a) => [a.productId, a._sum]));

  return products.map((p) => {
    const sales = salesMap.get(p.id);
    const fees = feesMap.get(p.id);
    const ads = adsMap.get(p.id);
    const inv = p.inventorySnapshots[0];
    const landedCogs = toNum(p.setting?.landedCogs);

    const grossSales = toNum(sales?.grossSales);
    const refunds = toNum(sales?.refundAmount);
    const refundCount = sales?.refundCount ?? 0;
    const netRevenue = grossSales - refunds;
    const unitsSold = sales?.unitsSold ?? 0;
    const orderCount = sales?.orderCount ?? 0;

    const totalFees =
      toNum(fees?.referralFee) +
      toNum(fees?.fbaFee) +
      toNum(fees?.storageFee) +
      toNum(fees?.awdStorageFee) +
      toNum(fees?.returnProcessingFee) +
      toNum(fees?.otherFees);

    const adSpend = toNum(ads?.spend);
    const adSales = toNum(ads?.attributedSales);
    const totalCogs = landedCogs * unitsSold;
    const netProfit = netRevenue - totalFees - totalCogs - adSpend;

    const rangeDays = Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1);
    const avgDaily = unitsSold / rangeDays;
    const available = inv?.available ?? 0;
    const daysLeft = avgDaily > 0 ? round(safeDiv(available + (inv?.inbound ?? 0), avgDaily), 1) : null;

    return {
      id: p.id,
      asin: p.asin,
      sku: p.sku,
      title: p.title,
      imageUrl: p.imageUrl,
      status: p.status,
      grossSales: round(grossSales),
      refunds: round(refunds),
      refundCount,
      netRevenue: round(netRevenue),
      unitsSold,
      orderCount,
      totalFees: round(totalFees),
      adSpend: round(adSpend),
      adSales: round(adSales),
      acos: adSales > 0 ? round(safeDiv(adSpend, adSales), 4) : null,
      tacos: grossSales > 0 ? round(safeDiv(adSpend, grossSales), 4) : null,
      totalCogs: round(totalCogs),
      netProfit: round(netProfit),
      netMarginPct: netRevenue > 0 ? round(safeDiv(netProfit, netRevenue), 4) : null,
      profitPerUnit: unitsSold > 0 ? round(safeDiv(netProfit, unitsSold), 2) : null,
      available,
      daysLeft,
    };
  });
}

// ─── Public ─────────────────────────────────────────────────────────────────

export async function getDashboardTilesData(userId: string, combo: TilesCombo = "default"): Promise<DashboardTilesData> {
  const periodDefs = buildPeriodDefs(combo);
  console.log(`[tiles-service] combo=${combo}, periods=${periodDefs.map(p => p.label).join(", ")}`);

  const [periods, products] = await Promise.all([
    Promise.all(periodDefs.map((pd) => queryPeriodMetrics(userId, pd))),
    queryProductRows(userId),
  ]);

  return { periods, products };
}

/**
 * Query a single custom date range period.
 * Used by the tiles API when from/to params are provided.
 */
export async function queryCustomPeriod(
  userId: string,
  from: Date,
  to: Date,
  label: string
): Promise<PeriodMetrics> {
  const periodDef: PeriodDef = {
    label,
    key: "custom",
    from,
    to,
  };
  console.log(`[tiles-service] custom period: ${label} (${from.toISOString().slice(0,10)} to ${to.toISOString().slice(0,10)})`);
  return queryPeriodMetrics(userId, periodDef);
}
