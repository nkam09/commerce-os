export interface ProductSettings {
  landedCogsPerUnit: number;
  freightPerUnit: number;
  prepPerUnit: number;
  overheadPerUnit: number;
  safetyStockDays: number;
  productionLeadDays: number;
  shippingLeadDays: number;
  receivingBufferDays: number;
  reorderCoverageDays: number;
  reorderMinQty?: number | null;
  reorderCasePack?: number | null;
  targetMargin?: number | null;
  targetAcos?: number | null;
  targetTacos?: number | null;
}

export interface DailySalesRow {
  date: Date;
  unitsSold: number;
  orderCount: number;
  grossSales: number;
  refundCount: number;
  refundAmount: number;
}

export interface DailyAdsRow {
  date: Date;
  spend: number;
  attributedSales: number;
  clicks: number;
  impressions: number;
  orders: number;
}

export interface DailyFeesRow {
  date: Date;
  referralFees: number;
  fbaFees: number;
  storageFees: number;
  returnProcessingFees: number;
  otherFees: number;
}

export interface InventoryState {
  available: number;
  reserved: number;
  inbound: number;
  awd: number;
}

export interface ProfitSummary {
  grossSales: number;
  unitsSold: number;
  orderCount: number;
  refundCount: number;
  refundAmount: number;
  adSpend: number;
  adSales: number;
  amazonFees: number;
  referralFees: number;
  fbaFees: number;
  storageFees: number;
  returnProcessingFees: number;
  otherFees: number;
  cogsTotal: number;
  overheadAllocated: number;
  grossProfit: number;
  operationalGrossProfit: number;
  netProfit: number;
  marginPercent: number | null;
  roiPercent: number | null;
  acos: number | null;
  tacos: number | null;
  cpc: number | null;
  conversionRate: number | null;
  refundRate: number | null;
  refundAmountRate: number | null;
  estimatedPayout: number;
  deltaVsPriorPeriod?: Record<string, number | null>;
}

export interface InventorySummary {
  available: number;
  reserved: number;
  inbound: number;
  awd: number;
  totalNetwork: number;
  sellableStock: number;
  velocity7: number;
  velocity30: number;
  velocity60: number;
  weightedVelocity: number;
  selectedVelocity: number;
  safetyStockUnits: number;
  reorderTriggerDays: number;
  daysLeft: number | null;
  projectedStockoutDate: Date | null;
  suggestedReorderDate: Date | null;
  reorderNow: boolean;
  targetCoverageUnits: number;
  suggestedReorderQty: number;
  reorderCashRequired: number;
  healthStatus: InventoryHealthStatus;
  healthLabel: string;
}

export type InventoryHealthStatus = "HEALTHY" | "REORDER_SOON" | "AT_RISK" | "STOCKOUT_RISK";

export interface CashForecastMonth {
  month: string;
  startingCash: number;
  totalInflows: number;
  totalOutflows: number;
  endingCash: number;
  cashFloorBreach: boolean;
  inflowBreakdown: Record<string, number>;
  outflowBreakdown: Record<string, number>;
}

export interface CashEvent {
  eventDate: Date;
  type: string;
  direction: "INFLOW" | "OUTFLOW";
  amount: number;
  description?: string;
}

export interface ProductPriorityScore {
  inventoryRisk: number;
  marginRisk: number;
  trendRisk: number;
  cashImpact: number;
  total: number;
}

const safe = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

const safeOrZero = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

const ceilToCasePack = (qty: number, casePack: number): number =>
  Math.ceil(qty / casePack) * casePack;

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const monthKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export function computeProfitSummary(
  sales: DailySalesRow[],
  ads: DailyAdsRow[],
  fees: DailyFeesRow[],
  settings: ProductSettings,
  priorSales?: DailySalesRow[],
  priorAds?: DailyAdsRow[],
  priorFees?: DailyFeesRow[]
): ProfitSummary {
  const grossSales   = sales.reduce((s, r) => s + r.grossSales, 0);
  const unitsSold    = sales.reduce((s, r) => s + r.unitsSold, 0);
  const orderCount   = sales.reduce((s, r) => s + r.orderCount, 0);
  const refundCount  = sales.reduce((s, r) => s + r.refundCount, 0);
  const refundAmount = sales.reduce((s, r) => s + r.refundAmount, 0);

  const adSpend  = ads.reduce((s, r) => s + r.spend, 0);
  const adSales  = ads.reduce((s, r) => s + r.attributedSales, 0);
  const clicks   = ads.reduce((s, r) => s + r.clicks, 0);
  const adOrders = ads.reduce((s, r) => s + r.orders, 0);

  const referralFees         = fees.reduce((s, r) => s + r.referralFees, 0);
  const fbaFees              = fees.reduce((s, r) => s + r.fbaFees, 0);
  const storageFees          = fees.reduce((s, r) => s + r.storageFees, 0);
  const returnProcessingFees = fees.reduce((s, r) => s + r.returnProcessingFees, 0);
  const otherFees            = fees.reduce((s, r) => s + r.otherFees, 0);
  const amazonFees           = referralFees + fbaFees + storageFees + returnProcessingFees + otherFees;

  const cogsTotal         = unitsSold * settings.landedCogsPerUnit;
  const overheadAllocated = unitsSold * settings.overheadPerUnit;

  const grossProfit            = grossSales - refundAmount - adSpend;
  const operationalGrossProfit = grossProfit - amazonFees;
  const netProfit              = grossSales - refundAmount - adSpend - amazonFees - cogsTotal - overheadAllocated;

  const marginPercent    = safe(netProfit, grossSales);
  const roiPercent       = safe(netProfit, cogsTotal);
  const acos             = safe(adSpend, adSales);
  const tacos            = safe(adSpend, grossSales);
  const cpc              = safe(adSpend, clicks);
  const conversionRate   = safe(adOrders, clicks);
  const refundRate       = safe(refundCount, unitsSold);
  const refundAmountRate = safe(refundAmount, grossSales);
  const estimatedPayout  = grossSales - amazonFees - refundAmount;

  let deltaVsPriorPeriod: Record<string, number | null> | undefined;
  if (priorSales && priorAds && priorFees) {
    const prior = computeProfitSummary(priorSales, priorAds, priorFees, settings);
    const pctChange = (curr: number, prev: number): number | null =>
      prev === 0 ? null : (curr - prev) / prev;
    deltaVsPriorPeriod = {
      grossSales:    pctChange(grossSales, prior.grossSales),
      netProfit:     pctChange(netProfit, prior.netProfit),
      adSpend:       pctChange(adSpend, prior.adSpend),
      marginPercent: marginPercent != null && prior.marginPercent != null
        ? marginPercent - prior.marginPercent : null,
    };
  }

  return {
    grossSales, unitsSold, orderCount, refundCount, refundAmount,
    adSpend, adSales, amazonFees, referralFees, fbaFees, storageFees,
    returnProcessingFees, otherFees, cogsTotal, overheadAllocated,
    grossProfit, operationalGrossProfit, netProfit,
    marginPercent, roiPercent, acos, tacos, cpc,
    conversionRate, refundRate, refundAmountRate,
    estimatedPayout, deltaVsPriorPeriod,
  };
}

export function computeInventorySummary(
  inventory: InventoryState,
  sales7: DailySalesRow[],
  sales30: DailySalesRow[],
  sales60: DailySalesRow[],
  settings: ProductSettings,
  today: Date = new Date(),
  velocityOverride?: "7d" | "30d" | "weighted"
): InventorySummary {
  const velocity7  = safeOrZero(sales7.reduce((s, r) => s + r.unitsSold, 0), 7);
  const velocity30 = safeOrZero(sales30.reduce((s, r) => s + r.unitsSold, 0), 30);
  const velocity60 = safeOrZero(sales60.reduce((s, r) => s + r.unitsSold, 0), 60);
  const weightedVelocity = (velocity7 * 0.5) + (velocity30 * 0.3) + (velocity60 * 0.2);

  const selectedVelocity = velocityOverride === "7d"      ? velocity7
                         : velocityOverride === "weighted" ? weightedVelocity
                         : velocity30;

  const sellableStock    = inventory.available;
  const totalNetwork     = inventory.available + inventory.reserved + inventory.inbound + inventory.awd;
  const safetyStockUnits = selectedVelocity * settings.safetyStockDays;

  const reorderTriggerDays =
    settings.productionLeadDays +
    settings.shippingLeadDays +
    settings.receivingBufferDays +
    settings.safetyStockDays;

  const daysLeft               = selectedVelocity === 0 ? null : sellableStock / selectedVelocity;
  const projectedStockoutDate  = daysLeft != null ? addDays(today, daysLeft) : null;
  const suggestedReorderDate   = projectedStockoutDate ? addDays(projectedStockoutDate, -reorderTriggerDays) : null;
  const reorderNow             = suggestedReorderDate != null && suggestedReorderDate <= today;

  const targetCoverageUnits  = selectedVelocity * settings.reorderCoverageDays;
  let suggestedReorderQty    = Math.max(0, targetCoverageUnits + safetyStockUnits - sellableStock - inventory.inbound);

  if (settings.reorderMinQty) suggestedReorderQty = Math.max(suggestedReorderQty, settings.reorderMinQty);
  if (settings.reorderCasePack && settings.reorderCasePack > 0) {
    suggestedReorderQty = ceilToCasePack(suggestedReorderQty, settings.reorderCasePack);
  }

  const reorderCashRequired = suggestedReorderQty * settings.landedCogsPerUnit;

  let healthStatus: InventoryHealthStatus;
  let healthLabel: string;

  if (daysLeft == null) {
    healthStatus = "HEALTHY"; healthLabel = "No Sales Data";
  } else if (daysLeft <= 14) {
    healthStatus = "STOCKOUT_RISK"; healthLabel = "Stockout Risk";
  } else if (daysLeft <= reorderTriggerDays) {
    healthStatus = "AT_RISK"; healthLabel = "At Risk — Reorder Now";
  } else if (daysLeft <= reorderTriggerDays + 14) {
    healthStatus = "REORDER_SOON"; healthLabel = "Reorder Soon";
  } else {
    healthStatus = "HEALTHY"; healthLabel = "Healthy";
  }

  return {
    available: inventory.available, reserved: inventory.reserved,
    inbound: inventory.inbound, awd: inventory.awd,
    totalNetwork, sellableStock, velocity7, velocity30, velocity60,
    weightedVelocity, selectedVelocity, safetyStockUnits, reorderTriggerDays,
    daysLeft, projectedStockoutDate, suggestedReorderDate, reorderNow,
    targetCoverageUnits, suggestedReorderQty, reorderCashRequired,
    healthStatus, healthLabel,
  };
}

export function computeCashForecast(
  startingCash: number,
  events: CashEvent[],
  cashFloor: number,
  months: number = 6,
  today: Date = new Date()
): CashForecastMonth[] {
  const result: CashForecastMonth[] = [];
  let runningCash = startingCash;

  for (let m = 0; m < months; m++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const key       = monthKey(monthDate);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + m + 1, 1);

    const monthEvents = events.filter(e => e.eventDate >= monthDate && e.eventDate < nextMonth);

    const inflowBreakdown:  Record<string, number> = {};
    const outflowBreakdown: Record<string, number> = {};
    let totalInflows  = 0;
    let totalOutflows = 0;

    for (const ev of monthEvents) {
      if (ev.direction === "INFLOW") {
        totalInflows += ev.amount;
        inflowBreakdown[ev.type] = (inflowBreakdown[ev.type] ?? 0) + ev.amount;
      } else {
        totalOutflows += ev.amount;
        outflowBreakdown[ev.type] = (outflowBreakdown[ev.type] ?? 0) + ev.amount;
      }
    }

    const endingCash      = runningCash + totalInflows - totalOutflows;
    const cashFloorBreach = endingCash < cashFloor;

    result.push({ month: key, startingCash: runningCash, totalInflows, totalOutflows, endingCash, cashFloorBreach, inflowBreakdown, outflowBreakdown });
    runningCash = endingCash;
  }

  return result;
}

export function checkPoAffordability(
  currentCash: number,
  proposedDeposit: number,
  proposedFreightReserve: number,
  cashFloor: number,
  otherScheduledOutflows: number = 0
): { canAfford: boolean; projectedCashAfterPo: number; margin: number } {
  const projectedCashAfterPo = currentCash - proposedDeposit - proposedFreightReserve - otherScheduledOutflows;
  const canAfford = projectedCashAfterPo >= cashFloor;
  const margin    = projectedCashAfterPo - cashFloor;
  return { canAfford, projectedCashAfterPo, margin };
}

export function computeReimbursementPriorityScore(
  amountEstimated: number,
  amountRecovered: number,
  openedAt: Date,
  status: "OPEN" | "SUBMITTED" | "FOLLOW_UP" | "CLOSED",
  today: Date = new Date()
): number {
  const outstanding = amountEstimated - amountRecovered;
  const agingDays   = Math.floor((today.getTime() - openedAt.getTime()) / 86400000);
  const statusBonus = status === "FOLLOW_UP" ? 20 : status === "OPEN" ? 10 : status === "SUBMITTED" ? 5 : 0;
  return Math.round(outstanding * 0.6 + agingDays * 0.3 + statusBonus);
}

export interface Alert {
  scope: "INVENTORY" | "PROFIT" | "CASH" | "OPS";
  severity: "LOW" | "MEDIUM" | "HIGH";
  productId?: string;
  title: string;
  body: string;
  action?: string;
}

export interface RulesConfig {
  reorderWarningBufferDays: number;
  stockoutCriticalDays: number;
  velocitySpikeThreshold: number;
  marginDropThresholdPoints: number;
  refundRateAlertThreshold: number;
  acosAboveTargetBuffer: number;
  cashFloor: number;
  highCashImpactPercentOfCash: number;
  reimbursementFollowUpDays: number;
  reimbursementHighValueThreshold: number;
}

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  reorderWarningBufferDays: 14,
  stockoutCriticalDays: 14,
  velocitySpikeThreshold: 0.20,
  marginDropThresholdPoints: 0.05,
  refundRateAlertThreshold: 0.03,
  acosAboveTargetBuffer: 0.10,
  cashFloor: 20000,
  highCashImpactPercentOfCash: 0.25,
  reimbursementFollowUpDays: 7,
  reimbursementHighValueThreshold: 100,
};

export function runInventoryRules(
  productId: string,
  productName: string,
  inv: InventorySummary,
  config: RulesConfig = DEFAULT_RULES_CONFIG
): Alert[] {
  const alerts: Alert[] = [];

  if (inv.daysLeft != null && inv.daysLeft <= config.stockoutCriticalDays) {
    alerts.push({
      scope: "INVENTORY", severity: "HIGH", productId,
      title: `${productName} — Stockout Imminent`,
      body: `Only ${inv.daysLeft.toFixed(0)} days of stock remain at current velocity (${inv.selectedVelocity.toFixed(1)} units/day).`,
      action: "Create Purchase Order",
    });
  } else if (inv.reorderNow) {
    alerts.push({
      scope: "INVENTORY", severity: "HIGH", productId,
      title: `${productName} — Reorder Now`,
      body: `Reorder trigger date has passed. Days left (${inv.daysLeft?.toFixed(0)}) is below the ${inv.reorderTriggerDays}-day lead time.`,
      action: "Create Purchase Order",
    });
  } else if (inv.healthStatus === "REORDER_SOON") {
    alerts.push({
      scope: "INVENTORY", severity: "MEDIUM", productId,
      title: `${productName} — Reorder Soon`,
      body: `Days left: ${inv.daysLeft?.toFixed(0)}. Suggested reorder date: ${inv.suggestedReorderDate?.toDateString()}.`,
      action: "Review Inventory",
    });
  }

  if (inv.velocity7 > 0 && inv.velocity30 > 0) {
    const spike = (inv.velocity7 - inv.velocity30) / inv.velocity30;
    if (spike >= config.velocitySpikeThreshold) {
      alerts.push({
        scope: "INVENTORY", severity: "MEDIUM", productId,
        title: `${productName} — Velocity Accelerating`,
        body: `7-day velocity (${inv.velocity7.toFixed(1)}) is ${(spike * 100).toFixed(0)}% above 30-day velocity (${inv.velocity30.toFixed(1)}).`,
        action: "Adjust Reorder Quantity",
      });
    }
  }

  return alerts;
}

export function runProfitRules(
  productId: string,
  productName: string,
  profit: ProfitSummary,
  settings: ProductSettings,
  config: RulesConfig = DEFAULT_RULES_CONFIG
): Alert[] {
  const alerts: Alert[] = [];

  if (settings.targetMargin != null && profit.marginPercent != null) {
    if (profit.marginPercent < settings.targetMargin) {
      alerts.push({
        scope: "PROFIT", severity: "MEDIUM", productId,
        title: `${productName} — Margin Below Target`,
        body: `Current margin: ${(profit.marginPercent * 100).toFixed(1)}%. Target: ${(settings.targetMargin * 100).toFixed(1)}%.`,
      });
    }
  }

  if (profit.refundRate != null && profit.refundRate > config.refundRateAlertThreshold) {
    alerts.push({
      scope: "PROFIT", severity: "MEDIUM", productId,
      title: `${productName} — High Refund Rate`,
      body: `Refund rate: ${(profit.refundRate * 100).toFixed(1)}% (threshold: ${(config.refundRateAlertThreshold * 100).toFixed(1)}%).`,
    });
  }

  if (settings.targetAcos != null && profit.acos != null) {
    if (profit.acos - settings.targetAcos > config.acosAboveTargetBuffer) {
      alerts.push({
        scope: "PROFIT", severity: "MEDIUM", productId,
        title: `${productName} — ACoS Above Target`,
        body: `ACoS: ${(profit.acos * 100).toFixed(1)}%. Target: ${(settings.targetAcos * 100).toFixed(1)}%.`,
        action: "Review PPC Campaigns",
      });
    }
  }

  if (profit.netProfit < 0) {
    alerts.push({
      scope: "PROFIT", severity: "HIGH", productId,
      title: `${productName} — Negative Net Profit`,
      body: `Net loss: $${Math.abs(profit.netProfit).toFixed(2)}. This SKU is losing money.`,
    });
  }

  return alerts;
}

export function runCashRules(
  forecast: CashForecastMonth[],
  config: RulesConfig = DEFAULT_RULES_CONFIG
): Alert[] {
  const alerts: Alert[] = [];
  const breaches = forecast.filter(m => m.cashFloorBreach);

  if (breaches.length > 0) {
    alerts.push({
      scope: "CASH", severity: "HIGH",
      title: `Cash Floor Breach Projected — ${breaches[0].month}`,
      body: `Ending cash in ${breaches[0].month} ($${breaches[0].endingCash.toFixed(0)}) falls below your $${config.cashFloor.toLocaleString()} floor.`,
      action: "Review Cash Flow",
    });
  }

  return alerts;
}

export function getDateRange(
  period: "TODAY" | "YESTERDAY" | "7D" | "30D" | "MTD" | "LAST_MONTH" | "60D",
  today: Date = new Date()
): { start: Date; end: Date } {
  const start = new Date(today);
  const end   = new Date(today);
  end.setHours(23, 59, 59, 999);

  switch (period) {
    case "TODAY":      start.setHours(0, 0, 0, 0); break;
    case "YESTERDAY":  start.setDate(today.getDate() - 1); start.setHours(0, 0, 0, 0); end.setDate(today.getDate() - 1); break;
    case "7D":         start.setDate(today.getDate() - 6); start.setHours(0, 0, 0, 0); break;
    case "30D":        start.setDate(today.getDate() - 29); start.setHours(0, 0, 0, 0); break;
    case "60D":        start.setDate(today.getDate() - 59); start.setHours(0, 0, 0, 0); break;
    case "MTD":        start.setDate(1); start.setHours(0, 0, 0, 0); break;
    case "LAST_MONTH": start.setMonth(today.getMonth() - 1, 1); start.setHours(0, 0, 0, 0); end.setDate(0); break;
  }

  return { start, end };
}