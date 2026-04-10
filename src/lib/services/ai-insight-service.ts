import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round } from "@/lib/utils/math";
import { daysAgo, todayUtc, daysBetween } from "@/lib/utils/dates";

// ─── AI Insight Service ────────────────────────────────────────────────────
//
// Builds a natural-language summary of the last 30 days of real performance
// data, suitable for the dashboard AI Insight banner.

function fmtCurrency(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1000) {
    return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

type ProductInsight = {
  title: string;
  asin: string;
  grossSales: number;
  netProfit: number;
  adSpend: number;
  acos: number | null;
  daysLeft: number | null;
};

export async function getDashboardInsight(userId: string): Promise<string> {
  const start = daysAgo(29);
  const today = todayUtc();

  // ── Fetch products with settings + latest inventory ────────────────────
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      asin: true,
      title: true,
      setting: { select: { landedCogs: true } },
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
        select: { available: true, inbound: true },
      },
    },
  });

  if (products.length === 0) {
    return "No active products found. Add products and sync your Amazon data to see AI insights.";
  }

  const productIds = products.map((p) => p.id);

  // ── Batch query 30-day aggregates ──────────────────────────────────────
  const [salesByProduct, feesByProduct, adsByProduct, reimbAgg] = await Promise.all([
    prisma.dailySale.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { grossSales: true, unitsSold: true, refundAmount: true },
    }),
    prisma.dailyFee.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: {
        referralFee: true,
        fbaFee: true,
        storageFee: true,
        awdStorageFee: true,
        returnProcessingFee: true,
        otherFees: true,
      },
    }),
    prisma.dailyAd.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { spend: true, attributedSales: true },
    }),
    prisma.reimbursement.aggregate({
      where: { product: { userId }, reimburseDate: { gte: start, lte: today } },
      _sum: { amountTotal: true },
    }),
  ]);

  const salesMap = new Map(salesByProduct.map((s) => [s.productId, s._sum]));
  const feesMap = new Map(feesByProduct.map((f) => [f.productId, f._sum]));
  const adsMap = new Map(adsByProduct.map((a) => [a.productId, a._sum]));
  const totalReimbursements = toNum(reimbAgg._sum.amountTotal);

  // ── Indirect expenses (pro-rated to 30-day window) ─────────────────────
  let indirectExpenseTotal = 0;
  try {
    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        archivedAt: null,
        OR: [
          { frequency: "ONE_TIME", effectiveAt: { gte: start, lte: today } },
          { frequency: { not: "ONE_TIME" }, effectiveAt: { lte: today }, endsAt: null },
          { frequency: { not: "ONE_TIME" }, effectiveAt: { lte: today }, endsAt: { gte: start } },
        ],
      },
      select: { amount: true, frequency: true },
    });
    const windowDays = Math.max(1, daysBetween(start, today) + 1);
    for (const exp of expenses) {
      const amt = toNum(exp.amount);
      let periodAmt = amt;
      if (exp.frequency === "MONTHLY") periodAmt = round(amt * windowDays / 30);
      else if (exp.frequency === "WEEKLY") periodAmt = round(amt * windowDays / 7);
      else if (exp.frequency === "QUARTERLY") periodAmt = round(amt * windowDays / 90);
      else if (exp.frequency === "ANNUALLY") periodAmt = round(amt * windowDays / 365);
      indirectExpenseTotal += periodAmt;
    }
    indirectExpenseTotal = round(indirectExpenseTotal);
  } catch { /* expense table may not exist yet */ }

  // ── Compute per-product metrics ────────────────────────────────────────
  const rangeDays = Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1);

  let totalGrossSales = 0;
  let totalRefunds = 0;
  let totalFees = 0;
  let totalAdSpend = 0;
  let totalCogs = 0;

  const rows: ProductInsight[] = products.map((p) => {
    const sales = salesMap.get(p.id);
    const fees = feesMap.get(p.id);
    const ads = adsMap.get(p.id);
    const inv = p.inventorySnapshots[0];
    const landedCogs = toNum(p.setting?.landedCogs);

    const grossSales = toNum(sales?.grossSales);
    const refunds = toNum(sales?.refundAmount);
    const unitsSold = sales?.unitsSold ?? 0;

    const feesTotal =
      toNum(fees?.referralFee) +
      toNum(fees?.fbaFee) +
      toNum(fees?.storageFee) +
      toNum(fees?.awdStorageFee) +
      toNum(fees?.returnProcessingFee) +
      toNum(fees?.otherFees);

    const adSpend = toNum(ads?.spend);
    const adSales = toNum(ads?.attributedSales);
    const cogs = landedCogs * unitsSold;
    const grossProfit = grossSales - refunds - feesTotal - cogs;
    const netProfit = grossProfit - adSpend;

    totalGrossSales += grossSales;
    totalRefunds += refunds;
    totalFees += feesTotal;
    totalAdSpend += adSpend;
    totalCogs += cogs;

    const avgDaily = unitsSold / rangeDays;
    const available = (inv?.available ?? 0) + (inv?.inbound ?? 0);
    const daysLeft = avgDaily > 0 ? round(safeDiv(available, avgDaily), 0) : null;

    // Use short distinguishing name — extract pack size or use ASIN
    let title = p.asin;
    if (p.title) {
      const packMatch = p.title.match(/(\d+)\s*Pack/i);
      const sizeMatch = p.title.match(/(\d+)\s*Bowl/i);
      if (packMatch) {
        title = `${packMatch[1]}-Pack Bowl Covers`;
      } else if (sizeMatch) {
        title = `${sizeMatch[1]} Bowl Covers`;
      } else if (p.title.length > 40) {
        // Truncate at last word boundary before 40 chars
        title = p.title.substring(0, 40).replace(/\s+\S*$/, "...");
      } else {
        title = p.title;
      }
    }

    return {
      title,
      asin: p.asin,
      grossSales,
      netProfit: round(netProfit),
      adSpend: round(adSpend),
      acos: adSales > 0 ? round(safeDiv(adSpend, adSales) * 100, 1) : null,
      daysLeft,
    };
  });

  // ── Aggregate totals (matches dashboard-tiles-service formula) ──────────
  // grossProfit = netRevenue - totalFees - totalCogs
  // netProfit   = grossProfit - adSpend + reimbursements - indirectExpenseTotal
  const totalNetProfit = round(
    totalGrossSales - totalRefunds - totalFees - totalCogs - totalAdSpend + totalReimbursements - indirectExpenseTotal
  );
  const tacos = totalGrossSales > 0 ? round(safeDiv(totalAdSpend, totalGrossSales) * 100, 1) : null;

  // ── Pick highlights ────────────────────────────────────────────────────
  // Only consider products with meaningful sales
  const activeRows = rows.filter((r) => r.grossSales > 0);

  // Top performer by profit
  const topByProfit = activeRows.length > 0
    ? activeRows.reduce((best, r) => (r.netProfit > best.netProfit ? r : best))
    : null;

  // Worst performer: highest ACOS among products with ad spend
  const withAcos = activeRows.filter((r) => r.acos !== null && r.adSpend > 10);
  const worstAcos = withAcos.length > 0
    ? withAcos.reduce((worst, r) => ((r.acos ?? 0) > (worst.acos ?? 0) ? r : worst))
    : null;

  // Low stock: products with <30 days of stock
  const lowStock = rows.filter((r) => r.daysLeft !== null && r.daysLeft < 30 && r.daysLeft >= 0);
  // Sort by most urgent first
  lowStock.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

  // ── Build natural language ─────────────────────────────────────────────
  const parts: string[] = [];

  // Net profit + TACOS
  if (totalGrossSales > 0) {
    let profitLine = `Your 30-day net profit is ${fmtCurrency(totalNetProfit)}`;
    if (tacos !== null) {
      profitLine += ` with ${fmtPct(tacos)} TACOS`;
    }
    profitLine += ".";
    parts.push(profitLine);
  } else {
    parts.push("No sales recorded in the last 30 days.");
  }

  // Top performer
  if (topByProfit && topByProfit.netProfit > 0) {
    parts.push(`Top performer: ${topByProfit.title} at ${fmtCurrency(topByProfit.netProfit)} profit.`);
  }

  // High ACOS warning (only if it's actually bad — above 40%)
  if (worstAcos && (worstAcos.acos ?? 0) > 40) {
    parts.push(`${worstAcos.title} has high ACOS at ${fmtPct(worstAcos.acos ?? 0)}.`);
  }

  // Low stock warnings (show up to 2)
  for (const ls of lowStock.slice(0, 2)) {
    const days = Math.round(ls.daysLeft ?? 0);
    if (days <= 0) {
      parts.push(`${ls.title} is out of stock — reorder immediately.`);
    } else {
      parts.push(`${ls.title} has only ${days} days of stock remaining — consider reordering.`);
    }
  }

  return parts.join(" ");
}
