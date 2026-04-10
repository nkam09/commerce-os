import { Prisma } from "@prisma/client";

// ─── Safe arithmetic on Prisma Decimals / numbers ────────────────────────────

export function toNum(val: Prisma.Decimal | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  return parseFloat(val.toString());
}

export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0 || isNaN(denominator)) return fallback;
  return numerator / denominator;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ─── Profit calculations ──────────────────────────────────────────────────────

export type ProfitInputs = {
  grossSales: number;
  refundAmount: number;
  referralFee: number;
  fbaFee: number;
  storageFee: number;
  awdStorageFee: number;
  otherFees: number;
  reimbursement?: number;
  adSpend: number;
  landedCogs: number;
  unitsSold: number;
};

export type ProfitResult = {
  netRevenue: number;
  totalFees: number;
  totalCogs: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
  profitPerUnit: number;
};

export function calcProfit(inputs: ProfitInputs): ProfitResult {
  const netRevenue = inputs.grossSales - inputs.refundAmount;
  const totalFees =
    inputs.referralFee +
    inputs.fbaFee +
    inputs.storageFee +
    inputs.awdStorageFee +
    inputs.otherFees -
    (inputs.reimbursement ?? 0);
  const totalCogs = inputs.landedCogs * inputs.unitsSold;
  const grossProfit = netRevenue - totalFees - totalCogs;
  const netProfit = grossProfit - inputs.adSpend;
  const grossMarginPct = round(safeDiv(grossProfit, netRevenue), 4);
  const netMarginPct = round(safeDiv(netProfit, netRevenue), 4);
  const profitPerUnit = round(safeDiv(netProfit, inputs.unitsSold), 2);

  return {
    netRevenue: round(netRevenue),
    totalFees: round(totalFees),
    totalCogs: round(totalCogs),
    grossProfit: round(grossProfit),
    netProfit: round(netProfit),
    grossMarginPct,
    netMarginPct,
    profitPerUnit,
  };
}

// ─── Inventory / reorder calculations ────────────────────────────────────────

export type ReorderInputs = {
  available: number;
  inbound: number;
  avgDailySales: number;
  productionLeadDays: number;
  shippingLeadDays: number;
  receivingBufferDays: number;
  safetyStockDays: number;
  reorderCoverageDays: number;
  reorderMinQty: number;
  reorderCasePack: number;
  landedCogs: number;
};

export type ReorderResult = {
  daysLeft: number;
  reorderPoint: number;
  suggestedQty: number;
  reorderCashNeeded: number;
  isUnderReorderPoint: boolean;
  isStockoutRisk: boolean;
};

export function calcReorder(inputs: ReorderInputs): ReorderResult {
  const {
    available,
    inbound,
    avgDailySales,
    productionLeadDays,
    shippingLeadDays,
    receivingBufferDays,
    safetyStockDays,
    reorderCoverageDays,
    reorderMinQty,
    reorderCasePack,
    landedCogs,
  } = inputs;

  const totalLeadDays = productionLeadDays + shippingLeadDays + receivingBufferDays;
  const daysLeft = avgDailySales > 0 ? round(safeDiv(available + inbound, avgDailySales), 1) : 999;
  const reorderPoint = round((totalLeadDays + safetyStockDays) * avgDailySales, 0);
  const rawQty = Math.max(reorderMinQty, reorderCoverageDays * avgDailySales);
  const packsNeeded = Math.ceil(rawQty / reorderCasePack);
  const suggestedQty = packsNeeded * reorderCasePack;
  const reorderCashNeeded = round(suggestedQty * landedCogs, 2);
  const isUnderReorderPoint = (available + inbound) <= reorderPoint;
  const isStockoutRisk = daysLeft <= safetyStockDays;

  return {
    daysLeft,
    reorderPoint,
    suggestedQty,
    reorderCashNeeded,
    isUnderReorderPoint,
    isStockoutRisk,
  };
}

// ─── ACOS / TACOS ─────────────────────────────────────────────────────────────

export function calcAcos(spend: number, attributedSales: number): number | null {
  if (attributedSales <= 0) return null;
  return round(safeDiv(spend, attributedSales), 4);
}

export function calcTacos(adSpend: number, totalSales: number): number | null {
  if (totalSales <= 0) return null;
  return round(safeDiv(adSpend, totalSales), 4);
}
