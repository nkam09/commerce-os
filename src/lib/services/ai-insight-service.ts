import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round } from "@/lib/utils/math";
import { daysAgo, todayUtc, daysBetween } from "@/lib/utils/dates";

// ─── AI Insight Service ────────────────────────────────────────────────────
//
// Fetches 30 days of real data, sends it to Claude for analysis,
// and falls back to a template when the API key is missing or the call fails.

// ─── In-memory cache ───────────────────────────────────────────────────────

const insightCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Formatting helpers ────────────────────────────────────────────────────

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

// ─── Types ─────────────────────────────────────────────────────────────────

type ProductInsight = {
  title: string;
  asin: string;
  grossSales: number;
  netProfit: number;
  adSpend: number;
  acos: number | null;
  daysLeft: number | null;
};

// ─── Data fetching (shared by all insight types) ───────────────────────────

async function fetchInsightData(userId: string, brand?: string) {
  const start = daysAgo(29);
  const today = todayUtc();

  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" }, ...(brand ? { brand } : {}) },
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

  if (products.length === 0) return null;

  const productIds = products.map((p) => p.id);

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
        reimbursement: true,
      },
    }),
    prisma.dailyAd.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { spend: true, attributedSales: true },
    }),
    prisma.reimbursement.aggregate({
      where: { product: { userId, ...(brand ? { brand } : {}) }, reimburseDate: { gte: start, lte: today } },
      _sum: { amountTotal: true },
    }),
  ]);

  const salesMap = new Map(salesByProduct.map((s) => [s.productId, s._sum]));
  const feesMap = new Map(feesByProduct.map((f) => [f.productId, f._sum]));
  const adsMap = new Map(adsByProduct.map((a) => [a.productId, a._sum]));
  const totalReimbursements = toNum(reimbAgg._sum.amountTotal);

  // Indirect expenses (pro-rated to 30-day window)
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

  // Compute per-product metrics
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
      toNum(fees?.otherFees) -
      toNum(fees?.reimbursement);

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

    // Use short distinguishing name
    let title = p.asin;
    if (p.title) {
      const packMatch = p.title.match(/(\d+)\s*Pack/i);
      const sizeMatch = p.title.match(/(\d+)\s*Bowl/i);
      if (packMatch) {
        title = `${packMatch[1]}-Pack Bowl Covers`;
      } else if (sizeMatch) {
        title = `${sizeMatch[1]} Bowl Covers`;
      } else if (p.title.length > 40) {
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

  const totalNetProfit = round(
    totalGrossSales - totalRefunds - totalFees - totalCogs - totalAdSpend + totalReimbursements - indirectExpenseTotal
  );
  const tacos = totalGrossSales > 0 ? round(safeDiv(totalAdSpend, totalGrossSales) * 100, 1) : null;

  const activeRows = rows.filter((r) => r.grossSales > 0);
  const topByProfit = activeRows.length > 0
    ? activeRows.reduce((best, r) => (r.netProfit > best.netProfit ? r : best))
    : null;
  const withAcos = activeRows.filter((r) => r.acos !== null && r.adSpend > 10);
  const worstAcos = withAcos.length > 0
    ? withAcos.reduce((worst, r) => ((r.acos ?? 0) > (worst.acos ?? 0) ? r : worst))
    : null;
  const lowStock = rows
    .filter((r) => r.daysLeft !== null && r.daysLeft < 30 && r.daysLeft >= 0)
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

  return {
    totalGrossSales: round(totalGrossSales),
    totalRefunds: round(totalRefunds),
    totalFees: round(totalFees),
    totalCogs: round(totalCogs),
    totalAdSpend: round(totalAdSpend),
    totalReimbursements: round(totalReimbursements),
    indirectExpenseTotal: round(indirectExpenseTotal),
    totalNetProfit,
    tacos,
    rows,
    topByProfit,
    worstAcos,
    lowStock,
  };
}

// ─── Template fallback ─────────────────────────────────────────────────────

function buildTemplateFallback(data: {
  totalNetProfit: number;
  tacos: number | null;
  totalGrossSales: number;
  topByProfit: ProductInsight | null;
  worstAcos: ProductInsight | null;
  lowStock: ProductInsight[];
}): string {
  const parts: string[] = [];

  if (data.totalGrossSales > 0) {
    let profitLine = `Your 30-day net profit is ${fmtCurrency(data.totalNetProfit)}`;
    if (data.tacos !== null) {
      profitLine += ` with ${fmtPct(data.tacos)} TACOS`;
    }
    profitLine += ".";
    parts.push(profitLine);
  } else {
    parts.push("No sales recorded in the last 30 days.");
  }

  if (data.topByProfit && data.topByProfit.netProfit > 0) {
    parts.push(`Top performer: ${data.topByProfit.title} at ${fmtCurrency(data.topByProfit.netProfit)} profit.`);
  }

  if (data.worstAcos && (data.worstAcos.acos ?? 0) > 40) {
    parts.push(`${data.worstAcos.title} has high ACOS at ${fmtPct(data.worstAcos.acos ?? 0)}.`);
  }

  for (const ls of data.lowStock.slice(0, 2)) {
    const days = Math.round(ls.daysLeft ?? 0);
    if (days <= 0) {
      parts.push(`${ls.title} is out of stock — reorder immediately.`);
    } else {
      parts.push(`${ls.title} has only ${days} days of stock remaining — consider reordering.`);
    }
  }

  return parts.join(" ");
}

// ─── Claude API call ───────────────────────────────────────────────────────

async function callClaude(
  dataSummary: object,
  systemPrompt: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `${systemPrompt}\n\nData:\n${JSON.stringify(dataSummary, null, 2)}`,
      }],
    });

    const text = response.content[0];
    if (text.type === "text" && text.text.trim()) {
      return text.text.trim();
    }
    return null;
  } catch (error) {
    console.error("[ai-insight] Claude API error:", error);
    return null;
  }
}

// ─── Dashboard insight ─────────────────────────────────────────────────────

export async function getDashboardInsight(userId: string, brand?: string): Promise<string> {
  const cacheKey = `dashboard:${userId}:${brand ?? "all"}`;
  const cached = insightCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.text;
  }

  const data = await fetchInsightData(userId, brand);
  if (!data) {
    return "No active products found. Add products and sync your Amazon data to see AI insights.";
  }

  const dataSummary = {
    period: "Last 30 days",
    totals: {
      grossSales: data.totalGrossSales,
      refunds: data.totalRefunds,
      amazonFees: data.totalFees,
      cogs: data.totalCogs,
      adSpend: data.totalAdSpend,
      reimbursements: data.totalReimbursements,
      indirectExpenses: data.indirectExpenseTotal,
      netProfit: data.totalNetProfit,
      tacos: data.tacos,
    },
    products: data.rows.map(r => ({
      name: r.title,
      asin: r.asin,
      grossSales: r.grossSales,
      netProfit: r.netProfit,
      adSpend: r.adSpend,
      acos: r.acos,
      daysOfStockLeft: r.daysLeft,
    })),
  };

  const prompt = `You are an Amazon FBA business analyst. Analyze this seller's last 30 days of performance data and provide 2-3 actionable insights in a single paragraph. Be specific with numbers. Focus on what matters most: profitability issues, inventory risks, advertising efficiency, or growth opportunities. Keep it concise — this appears as a banner at the top of their dashboard.

Rules:
- Maximum 2-3 sentences
- Lead with the most important insight
- Use specific numbers from the data
- If a product is low on stock (<30 days), flag it urgently
- If ACOS is above 40% on any product, flag it
- Don't repeat obvious facts — provide analysis and recommendations
- Don't use bullet points — write as a flowing paragraph
- Reference products by their short name, not ASIN`;

  const result = await callClaude(dataSummary, prompt);
  const text = result ?? buildTemplateFallback(data);

  insightCache.set(cacheKey, { text, timestamp: Date.now() });
  return text;
}

// ─── Products page insight ─────────────────────────────────────────────────

export async function getProductsInsight(userId: string, brand?: string): Promise<string> {
  const cacheKey = `products:${userId}:${brand ?? "all"}`;
  const cached = insightCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.text;
  }

  const data = await fetchInsightData(userId, brand);
  if (!data) return "No active products found.";

  const dataSummary = {
    period: "Last 30 days",
    products: data.rows.map(r => ({
      name: r.title,
      asin: r.asin,
      grossSales: r.grossSales,
      netProfit: r.netProfit,
      adSpend: r.adSpend,
      acos: r.acos,
      daysOfStockLeft: r.daysLeft,
    })),
    totals: {
      netProfit: data.totalNetProfit,
      grossSales: data.totalGrossSales,
    },
  };

  const prompt = `You are an Amazon FBA product analyst. Analyze the product performance data and provide a concise insight about product health — which products are most profitable, which need COGS optimization, and any pricing or margin concerns.

Rules:
- Maximum 2-3 sentences in a flowing paragraph
- Focus on per-product profitability and cost structure
- Reference products by their short name, not ASIN
- Be specific with numbers`;

  const result = await callClaude(dataSummary, prompt);
  const text = result ?? `${data.rows.length} products tracked. Net profit: ${fmtCurrency(data.totalNetProfit)} over 30 days.${data.topByProfit ? ` Top performer: ${data.topByProfit.title}.` : ""}`;

  insightCache.set(cacheKey, { text, timestamp: Date.now() });
  return text;
}

// ─── Inventory insight ─────────────────────────────────────────────────────

export async function getInventoryInsight(userId: string, brand?: string): Promise<string> {
  const cacheKey = `inventory:${userId}:${brand ?? "all"}`;
  const cached = insightCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.text;
  }

  const data = await fetchInsightData(userId, brand);
  if (!data) return "No active products found.";

  const dataSummary = {
    period: "Last 30 days",
    products: data.rows.map(r => ({
      name: r.title,
      grossSales: r.grossSales,
      daysOfStockLeft: r.daysLeft,
    })),
    lowStockProducts: data.lowStock.map(r => ({
      name: r.title,
      daysLeft: r.daysLeft,
    })),
  };

  const prompt = `You are an Amazon FBA inventory analyst. Analyze the inventory levels and provide a concise insight about stock health — which products are at risk of stockout, which have excess inventory, and recommended reorder actions.

Rules:
- Maximum 2-3 sentences in a flowing paragraph
- Flag any products with <30 days of stock urgently
- If products are out of stock (0 days), emphasize immediate action
- Reference products by their short name
- Be specific with day counts`;

  const result = await callClaude(dataSummary, prompt);
  const lowCount = data.lowStock.length;
  const text = result ?? `${lowCount} product${lowCount !== 1 ? "s have" : " has"} less than 30 days of stock remaining.${data.lowStock[0] ? ` ${data.lowStock[0].title} (${data.lowStock[0].daysLeft}d) needs immediate reorder attention.` : ""}`;

  insightCache.set(cacheKey, { text, timestamp: Date.now() });
  return text;
}

// ─── Cashflow insight ──────────────────────────────────────────────────────

export async function getCashflowInsight(userId: string, brand?: string): Promise<string> {
  const cacheKey = `cashflow:${userId}:${brand ?? "all"}`;
  const cached = insightCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.text;
  }

  const data = await fetchInsightData(userId, brand);
  if (!data) return "No data available for cashflow analysis.";

  const dataSummary = {
    period: "Last 30 days",
    totals: {
      grossSales: data.totalGrossSales,
      refunds: data.totalRefunds,
      amazonFees: data.totalFees,
      cogs: data.totalCogs,
      adSpend: data.totalAdSpend,
      reimbursements: data.totalReimbursements,
      indirectExpenses: data.indirectExpenseTotal,
      netProfit: data.totalNetProfit,
    },
  };

  const prompt = `You are an Amazon FBA financial analyst. Analyze the cashflow data and provide a concise insight about cash position — net cash flow trend, biggest cash drains, and recommendations for improving cash flow.

Rules:
- Maximum 2-3 sentences in a flowing paragraph
- Focus on cash in vs cash out
- Highlight the biggest cost categories (fees, ads, COGS)
- Be specific with dollar amounts
- Suggest one actionable improvement`;

  const cashIn = round(data.totalGrossSales - data.totalRefunds);
  const cashOut = round(data.totalFees + data.totalAdSpend + data.indirectExpenseTotal);
  const result = await callClaude(dataSummary, prompt);
  const text = result ?? `30-day cash in: ${fmtCurrency(cashIn)}. Cash out: ${fmtCurrency(cashOut)} (fees ${fmtCurrency(data.totalFees)}, ads ${fmtCurrency(data.totalAdSpend)}, expenses ${fmtCurrency(data.indirectExpenseTotal)}). Net: ${fmtCurrency(data.totalNetProfit)}.`;

  insightCache.set(cacheKey, { text, timestamp: Date.now() });
  return text;
}
