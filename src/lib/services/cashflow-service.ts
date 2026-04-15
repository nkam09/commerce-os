// ─── Cashflow Service ─────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import { toNum, round, safeDiv } from "@/lib/utils/math";
import { daysAgo, todayUtc, toISODate, daysBetween } from "@/lib/utils/dates";

// ─── Types (unchanged) ──────────────────────────────────────────────────────

export type CashPositionCard = {
  label: string;
  value: number;
  subItems: { label: string; value: number | string }[];
};

export type TimelinePoint = {
  date: string; // ISO date
  cashIn: number;
  cashOut: number;
  netBalance: number;
  events: { type: "payout" | "expense" | "inventory"; label: string; amount: number }[];
};

export type SettlementRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "paid" | "pending" | "projected";
  grossSales: number;
  refunds: number;
  amazonFees: number;
  adSpend: number;
  otherDeductions: number;
  netPayout: number;
  paymentDate: string | null;
  daysUntilPayout: number | null;
};

export type ScenarioInputs = {
  dailyAdSpend: number;
  monthlyRevenueGrowth: number;
  acosTarget: number;
  nextInventoryOrderAmount: number;
  inventoryOrderDate: string;
  additionalOrders: { amount: number; date: string }[];
  monthlyIndirectExpenses: number;
  oneTimeExpense: number;
  revenuePauseDays: number;
  amazonReservePct: number;
};

export type ScenarioOutputs = {
  daysToBreakeven: number;
  minimumCashNeeded: number;
  cashPositiveDate: string;
  ninetyDayEndingBalance: number;
  inventoryRoi: number;
};

export type SavedScenario = {
  id: string;
  name: string;
  inputs: ScenarioInputs;
  outputs: ScenarioOutputs;
};

export type MonthlyCashflow = {
  month: string; // "Jan 2026"
  isProjected: boolean;
  revenue: number;
  amazonFees: number;
  adSpend: number;
  cogs: number;
  refunds: number;
  indirectExpenses: number;
  netCashFlow: number;
  cumulativeBalance: number;
};

export type CashflowPageData = {
  positionCards: CashPositionCard[];
  timeline: TimelinePoint[];
  settlements: SettlementRow[];
  defaultInputs: ScenarioInputs;
  savedScenarios: SavedScenario[];
  monthlyCashflow: MonthlyCashflow[];
};

// ─── Scenario Calculator (unchanged — pure math) ────────────────────────────

export function calculateScenarioOutputs(inputs: ScenarioInputs): ScenarioOutputs {
  const dailyRevenue = (inputs.dailyAdSpend / (inputs.acosTarget / 100)) * 1.6;
  const dailyGrowthFactor = 1 + inputs.monthlyRevenueGrowth / 100 / 30;
  const totalInventory =
    inputs.nextInventoryOrderAmount +
    inputs.additionalOrders.reduce((s, o) => s + o.amount, 0);

  let balance = 8245;
  let minBalance = balance;
  let breakevenDay = 0;
  let foundBreakeven = false;

  const baseDate = todayUtc();

  for (let day = 1; day <= 90; day++) {
    const growthMul = Math.pow(dailyGrowthFactor, day);
    const isPaused = day <= inputs.revenuePauseDays;
    const dayRevenue = isPaused ? 0 : dailyRevenue * growthMul;
    const dayAdSpend = isPaused ? 0 : inputs.dailyAdSpend;
    const dayFees = dayRevenue * 0.15;
    const dayCogs = dayRevenue * 0.22;
    const dayReserve = dayRevenue * (inputs.amazonReservePct / 100);
    const dailyIndirect = inputs.monthlyIndirectExpenses / 30;

    let dayExpense = 0;
    if (day === 1) dayExpense += inputs.oneTimeExpense;

    const invOrderDate = new Date(inputs.inventoryOrderDate);
    const invDay = Math.round(
      (invOrderDate.getTime() - baseDate.getTime()) / 86400000
    );
    if (day === Math.max(1, invDay)) {
      dayExpense += inputs.nextInventoryOrderAmount;
    }
    for (const ao of inputs.additionalOrders) {
      const aoDate = new Date(ao.date);
      const aoDay = Math.round(
        (aoDate.getTime() - baseDate.getTime()) / 86400000
      );
      if (day === Math.max(1, aoDay)) {
        dayExpense += ao.amount;
      }
    }

    const cashIn = dayRevenue - dayReserve;
    const cashOut = dayAdSpend + dayFees + dayCogs + dailyIndirect + dayExpense;
    balance += cashIn - cashOut;

    if (balance < minBalance) minBalance = balance;
    if (!foundBreakeven && balance > 8245) {
      breakevenDay = day;
      foundBreakeven = true;
    }
  }

  const cashPositiveDate = new Date(baseDate);
  cashPositiveDate.setDate(
    cashPositiveDate.getDate() + (foundBreakeven ? breakevenDay : 90)
  );

  const inventoryRoi =
    totalInventory > 0
      ? ((balance - 8245 + totalInventory) / totalInventory) * 100
      : 0;

  return {
    daysToBreakeven: foundBreakeven ? breakevenDay : 90,
    minimumCashNeeded: Math.max(0, -minBalance + 500),
    cashPositiveDate: cashPositiveDate.toISOString().slice(0, 10),
    ninetyDayEndingBalance: Math.round(balance),
    inventoryRoi: Math.round(inventoryRoi * 10) / 10,
  };
}

// ─── Internal aggregation helpers ────────────────────────────────────────────

type DailyAggregate = {
  date: string;
  grossSales: number;
  refunds: number;
  totalFees: number;
  adSpend: number;
};

async function getDailyAggregates(
  userId: string,
  start: Date,
  end: Date,
  brand?: string
): Promise<DailyAggregate[]> {
  // Get user's product IDs for filtering
  const products = await prisma.product.findMany({
    where: { userId, ...(brand ? { brand } : {}) },
    select: { id: true },
  });
  const productIds = products.map((p) => p.id);

  if (productIds.length === 0) {
    return [];
  }

  // Fetch sales, fees, ads in parallel
  const [sales, fees, ads] = await Promise.all([
    prisma.dailySale.findMany({
      where: { productId: { in: productIds }, date: { gte: start, lte: end } },
      select: { date: true, grossSales: true, refundAmount: true },
    }),
    prisma.dailyFee.findMany({
      where: { productId: { in: productIds }, date: { gte: start, lte: end } },
      select: { date: true, referralFee: true, fbaFee: true, storageFee: true, awdStorageFee: true, returnProcessingFee: true, otherFees: true, reimbursement: true },
    }),
    prisma.dailyAd.findMany({
      where: { productId: { in: productIds }, date: { gte: start, lte: end } },
      select: { date: true, spend: true },
    }),
  ]);

  // Aggregate by date
  const map = new Map<string, DailyAggregate>();

  function getOrCreate(d: Date): DailyAggregate {
    const key = toISODate(d);
    let agg = map.get(key);
    if (!agg) {
      agg = { date: key, grossSales: 0, refunds: 0, totalFees: 0, adSpend: 0 };
      map.set(key, agg);
    }
    return agg;
  }

  for (const s of sales) {
    const agg = getOrCreate(s.date);
    agg.grossSales += toNum(s.grossSales);
    agg.refunds += toNum(s.refundAmount);
  }

  for (const f of fees) {
    const agg = getOrCreate(f.date);
    agg.totalFees +=
      toNum(f.referralFee) +
      toNum(f.fbaFee) +
      toNum(f.storageFee) +
      toNum(f.awdStorageFee) +
      toNum(f.returnProcessingFee) +
      toNum(f.otherFees) -
      toNum(f.reimbursement);
  }

  for (const a of ads) {
    const agg = getOrCreate(a.date);
    agg.adSpend += toNum(a.spend);
  }

  // Sort by date ascending
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function getMonthlyExpensesTotal(userId: string): Promise<number> {
  const rows = await prisma.expense.findMany({
    where: { userId, archivedAt: null, frequency: "MONTHLY" },
    select: { name: true, amount: true },
  });
  // Deduplicate by name — only count each monthly expense once
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!seen.has(r.name)) {
      seen.set(r.name, toNum(r.amount));
    }
  }
  let total = 0;
  for (const v of seen.values()) total += v;
  return round(total, 2);
}

// ─── Position Cards ──────────────────────────────────────────────────────────

async function buildPositionCards(
  userId: string,
  brand?: string
): Promise<CashPositionCard[]> {
  const thirtyDaysAgo = daysAgo(30);
  const sixtyDaysAgo = daysAgo(60);
  const today = todayUtc();

  const [current, previous] = await Promise.all([
    getDailyAggregates(userId, thirtyDaysAgo, today, brand),
    getDailyAggregates(userId, sixtyDaysAgo, thirtyDaysAgo, brand),
  ]);

  const monthlyExpenses = await getMonthlyExpensesTotal(userId);

  const totalSales = current.reduce((s, d) => s + d.grossSales, 0);
  const totalRefunds = current.reduce((s, d) => s + d.refunds, 0);
  const totalFees = current.reduce((s, d) => s + d.totalFees, 0);
  const totalAdSpend = current.reduce((s, d) => s + d.adSpend, 0);

  const cashIn = round(totalSales - totalRefunds, 2);
  const cashOut = round(totalFees + totalAdSpend + monthlyExpenses, 2);
  const netCashFlow = round(cashIn - cashOut, 2);

  // Previous period for comparison
  const prevSales = previous.reduce((s, d) => s + d.grossSales, 0);
  const prevRefunds = previous.reduce((s, d) => s + d.refunds, 0);
  const prevFees = previous.reduce((s, d) => s + d.totalFees, 0);
  const prevAdSpend = previous.reduce((s, d) => s + d.adSpend, 0);
  const prevNet = (prevSales - prevRefunds) - (prevFees + prevAdSpend + monthlyExpenses);
  const changePct = safeDiv(netCashFlow - prevNet, Math.abs(prevNet) || 1) * 100;

  // Runway estimate: if cashOut > 0 and net is negative, days until zero
  const dailyCashOut = safeDiv(cashOut, 30);
  const runwayDays = netCashFlow >= 0
    ? 999
    : Math.max(0, Math.round(safeDiv(cashIn, dailyCashOut)));

  const runwayLabel = runwayDays >= 999 ? "Healthy" : `${runwayDays} days`;

  return [
    {
      label: "Current Balance",
      value: round(cashIn, 2), // approximation: net receivable
      subItems: [
        { label: "Amazon payouts (30d)", value: round(totalSales, 2) },
        { label: "Refunds (30d)", value: round(-totalRefunds, 2) },
      ],
    },
    {
      label: "30-Day Cash In",
      value: round(cashIn, 2),
      subItems: [
        { label: "Gross sales", value: round(totalSales, 2) },
        { label: "Refunds", value: round(-totalRefunds, 2) },
      ],
    },
    {
      label: "30-Day Cash Out",
      value: round(cashOut, 2),
      subItems: [
        { label: "Amazon fees", value: round(totalFees, 2) },
        { label: "Ad spend", value: round(totalAdSpend, 2) },
        { label: "Expenses", value: round(monthlyExpenses, 2) },
      ],
    },
    {
      label: "Net Cash Flow",
      value: round(netCashFlow, 2),
      subItems: [
        { label: "vs. last 30d", value: `${changePct >= 0 ? "+" : ""}${round(changePct, 1)}%` },
        { label: "Runway", value: runwayLabel },
      ],
    },
  ];
}

// ─── Timeline (90 days) ──────────────────────────────────────────────────────

async function buildTimeline(userId: string, brand?: string): Promise<TimelinePoint[]> {
  const start = daysAgo(89);
  const end = todayUtc();
  const dailyData = await getDailyAggregates(userId, start, end, brand);

  const monthlyExpenses = await getMonthlyExpensesTotal(userId);
  const dailyExpenseAlloc = round(monthlyExpenses / 30, 2);

  // Build lookup
  const lookup = new Map<string, DailyAggregate>();
  for (const d of dailyData) lookup.set(d.date, d);

  const timeline: TimelinePoint[] = [];
  let runningBalance = 0;

  for (let i = 0; i < 90; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = toISODate(d);
    const agg = lookup.get(dateStr);

    const cashIn = agg ? round(agg.grossSales - agg.refunds, 2) : 0;
    const cashOut = agg
      ? round(agg.totalFees + agg.adSpend + dailyExpenseAlloc, 2)
      : round(dailyExpenseAlloc, 2);

    runningBalance += cashIn - cashOut;

    const events: TimelinePoint["events"] = [];

    // Mark ~biweekly payout events
    if (i > 0 && i % 14 === 0 && cashIn > 0) {
      events.push({ type: "payout", label: "Amazon payout", amount: round(cashIn, 2) });
    }
    // Mark 1st-of-month expense events
    if (d.getUTCDate() === 1) {
      events.push({ type: "expense", label: "Monthly expenses", amount: round(monthlyExpenses, 2) });
    }

    timeline.push({
      date: dateStr,
      cashIn,
      cashOut,
      netBalance: round(runningBalance, 2),
      events,
    });
  }

  return timeline;
}

// ─── Settlements ─────────────────────────────────────────────────────────────

async function buildSettlements(userId: string): Promise<SettlementRow[]> {
  // First try reading from the settlements table
  const dbSettlements = await prisma.settlement.findMany({
    where: { userId },
    orderBy: { periodEnd: "desc" },
    take: 12,
  });

  const today = todayUtc();

  if (dbSettlements.length > 0) {
    return dbSettlements.map((s) => {
      const daysUntil = s.paymentDate
        ? daysBetween(today, s.paymentDate)
        : null;
      return {
        id: s.id,
        periodStart: toISODate(s.periodStart),
        periodEnd: toISODate(s.periodEnd),
        status: s.status as "paid" | "pending" | "projected",
        grossSales: round(s.grossSales, 2),
        refunds: round(s.refunds, 2),
        amazonFees: round(s.amazonFees, 2),
        adSpend: round(s.adSpend, 2),
        otherDeductions: round(s.otherDeductions, 2),
        netPayout: round(s.netPayout, 2),
        paymentDate: s.paymentDate ? toISODate(s.paymentDate) : null,
        daysUntilPayout: s.status === "paid" ? null : daysUntil,
      };
    });
  }

  // Fallback: derive settlements from daily_sales grouped in ~14 day periods
  const start = daysAgo(168); // ~12 periods of 14 days
  const dailyData = await getDailyAggregates(userId, start, today);

  if (dailyData.length === 0) return [];

  const settlements: SettlementRow[] = [];
  const periodDays = 14;

  // Work backwards from today
  const endDate = today;

  for (let p = 0; p < 12; p++) {
    const periodEnd = new Date(endDate);
    periodEnd.setUTCDate(periodEnd.getUTCDate() - p * periodDays);
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - (periodDays - 1));

    const peStr = toISODate(periodEnd);
    const psStr = toISODate(periodStart);

    // Filter daily data for this period
    const periodData = dailyData.filter(
      (d) => d.date >= psStr && d.date <= peStr
    );

    const grossSales = periodData.reduce((s, d) => s + d.grossSales, 0);
    const refunds = periodData.reduce((s, d) => s + d.refunds, 0);
    const amazonFees = periodData.reduce((s, d) => s + d.totalFees, 0);
    const adSpend = periodData.reduce((s, d) => s + d.adSpend, 0);
    const otherDeductions = 0;
    const netPayout = grossSales - refunds - amazonFees - adSpend - otherDeductions;

    // Determine status based on how far in the past
    let status: "paid" | "pending" | "projected";
    let paymentDate: string | null = null;
    let daysUntilPayout: number | null = null;

    const payDate = new Date(periodEnd);
    payDate.setUTCDate(payDate.getUTCDate() + 5); // Amazon typically pays ~5 days after period end

    if (p >= 4) {
      status = "paid";
      paymentDate = toISODate(payDate);
    } else if (p >= 1) {
      status = "projected";
      paymentDate = toISODate(payDate);
      daysUntilPayout = daysBetween(today, payDate);
    } else {
      status = "pending";
      paymentDate = toISODate(payDate);
      daysUntilPayout = daysBetween(today, payDate);
    }

    settlements.push({
      id: `stl-${p}`,
      periodStart: psStr,
      periodEnd: peStr,
      status,
      grossSales: round(grossSales, 2),
      refunds: round(refunds, 2),
      amazonFees: round(amazonFees, 2),
      adSpend: round(adSpend, 2),
      otherDeductions: round(otherDeductions, 2),
      netPayout: round(netPayout, 2),
      paymentDate,
      daysUntilPayout,
    });
  }

  return settlements;
}

// ─── Default Scenario Inputs (derived from real data) ────────────────────────

async function buildDefaultInputs(userId: string, brand?: string): Promise<ScenarioInputs> {
  const thirtyDaysAgo = daysAgo(30);
  const today = todayUtc();
  const dailyData = await getDailyAggregates(userId, thirtyDaysAgo, today, brand);
  const monthlyExpenses = await getMonthlyExpensesTotal(userId);

  const totalAdSpend = dailyData.reduce((s, d) => s + d.adSpend, 0);
  const totalSales = dailyData.reduce((s, d) => s + d.grossSales, 0);
  const numDays = Math.max(dailyData.length, 1);

  const dailyAdSpend = round(totalAdSpend / numDays, 0);
  const acosTarget = totalSales > 0 ? round((totalAdSpend / totalSales) * 100, 0) : 24;

  return {
    dailyAdSpend: dailyAdSpend || 165,
    monthlyRevenueGrowth: 8,
    acosTarget: acosTarget || 24,
    nextInventoryOrderAmount: 2500,
    inventoryOrderDate: toISODate(
      new Date(today.getTime() + 25 * 86400000)
    ),
    additionalOrders: [],
    monthlyIndirectExpenses: monthlyExpenses || 850,
    oneTimeExpense: 0,
    revenuePauseDays: 0,
    amazonReservePct: 3,
  };
}

// ─── Saved Scenarios ─────────────────────────────────────────────────────────

async function buildSavedScenarios(userId: string): Promise<SavedScenario[]> {
  const rows = await prisma.cashflowScenario.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    inputs: r.inputs as unknown as ScenarioInputs,
    outputs: r.outputs as unknown as ScenarioOutputs,
  }));
}

// ─── Monthly Cashflow ────────────────────────────────────────────────────────

async function buildMonthlyCashflow(userId: string, brand?: string): Promise<MonthlyCashflow[]> {
  const today = todayUtc();
  const currentMonth = today.getUTCMonth();
  const currentYear = today.getUTCFullYear();

  // Build 6 months: 3 past + current month + 2 projected
  const months: MonthlyCashflow[] = [];
  let cumBalance = 0;
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const monthlyExpenses = await getMonthlyExpensesTotal(userId);

  for (let offset = -3; offset <= 2; offset++) {
    let m = currentMonth + offset;
    let y = currentYear;
    if (m < 0) { m += 12; y -= 1; }
    if (m > 11) { m -= 12; y += 1; }

    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd = new Date(Date.UTC(y, m + 1, 0)); // last day of month
    const isProjected = offset > 0;
    const label = `${monthNames[m]} ${y}`;

    if (!isProjected) {
      // Use real data
      const dailyData = await getDailyAggregates(userId, monthStart, monthEnd, brand);

      const revenue = dailyData.reduce((s, d) => s + d.grossSales, 0);
      const refunds = dailyData.reduce((s, d) => s + d.refunds, 0);
      const amazonFees = dailyData.reduce((s, d) => s + d.totalFees, 0);
      const adSpend = dailyData.reduce((s, d) => s + d.adSpend, 0);
      const cogs = round(revenue * 0.22, 2); // estimated COGS at ~22%
      const indirectExpenses = monthlyExpenses;

      const netCashFlow = round(
        revenue - amazonFees - adSpend - cogs - refunds - indirectExpenses,
        2
      );
      cumBalance += netCashFlow;

      months.push({
        month: label,
        isProjected: false,
        revenue: round(revenue, 2),
        amazonFees: round(amazonFees, 2),
        adSpend: round(adSpend, 2),
        cogs: round(cogs, 2),
        refunds: round(refunds, 2),
        indirectExpenses: round(indirectExpenses, 2),
        netCashFlow,
        cumulativeBalance: round(cumBalance, 2),
      });
    } else {
      // Project forward using last known month's averages with ~6% growth
      const lastMonth = months[months.length - 1];
      const growthFactor = 1.06;
      const revenue = round(lastMonth.revenue * growthFactor, 2);
      const amazonFees = round(revenue * safeDiv(lastMonth.amazonFees, lastMonth.revenue || 1), 2);
      const adSpend = round(lastMonth.adSpend * growthFactor, 2);
      const cogs = round(revenue * 0.22, 2);
      const refunds = round(revenue * safeDiv(lastMonth.refunds, lastMonth.revenue || 1), 2);
      const indirectExpenses = monthlyExpenses;
      const netCashFlow = round(
        revenue - amazonFees - adSpend - cogs - refunds - indirectExpenses,
        2
      );
      cumBalance += netCashFlow;

      months.push({
        month: label,
        isProjected: true,
        revenue,
        amazonFees,
        adSpend,
        cogs,
        refunds,
        indirectExpenses: round(indirectExpenses, 2),
        netCashFlow,
        cumulativeBalance: round(cumBalance, 2),
      });
    }
  }

  return months;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function getCashflowPageData(
  userId: string,
  brand?: string
): Promise<CashflowPageData> {
  const [
    positionCards,
    timeline,
    settlements,
    defaultInputs,
    savedScenarios,
    monthlyCashflow,
  ] = await Promise.all([
    buildPositionCards(userId, brand),
    buildTimeline(userId, brand),
    buildSettlements(userId),
    buildDefaultInputs(userId, brand),
    buildSavedScenarios(userId),
    buildMonthlyCashflow(userId, brand),
  ]);

  return {
    positionCards,
    timeline,
    settlements,
    defaultInputs,
    savedScenarios,
    monthlyCashflow,
  };
}

// Sync fallback — returns empty shell; callers should prefer async version
export function getCashflowPageDataSync(): CashflowPageData {
  return {
    positionCards: [
      { label: "Current Balance", value: 0, subItems: [] },
      { label: "30-Day Cash In", value: 0, subItems: [] },
      { label: "30-Day Cash Out", value: 0, subItems: [] },
      { label: "Net Cash Flow", value: 0, subItems: [] },
    ],
    timeline: [],
    settlements: [],
    defaultInputs: {
      dailyAdSpend: 165,
      monthlyRevenueGrowth: 8,
      acosTarget: 24,
      nextInventoryOrderAmount: 2500,
      inventoryOrderDate: new Date(Date.now() + 25 * 86400000)
        .toISOString()
        .slice(0, 10),
      additionalOrders: [],
      monthlyIndirectExpenses: 850,
      oneTimeExpense: 0,
      revenuePauseDays: 0,
      amazonReservePct: 3,
    },
    savedScenarios: [],
    monthlyCashflow: [],
  };
}
