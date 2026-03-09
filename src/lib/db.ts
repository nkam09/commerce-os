/**
 * Commerce OS — Database Service Layer
 * All data access goes through here. Never query Prisma directly from API routes.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import {
  computeProfitSummary,
  computeInventorySummary,
  computeCashForecast,
  runInventoryRules,
  runProfitRules,
  runCashRules,
  getDateRange,
  DEFAULT_RULES_CONFIG,
  type ProfitSummary,
  type InventorySummary,
  type ProductSettings,
  type CashEvent,
} from "./formula-engine";

const prisma = new PrismaClient();
export default prisma;

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

export async function getProducts(userId: string) {
  return prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    include: { settings: true },
    orderBy: { title: "asc" },
  });
}

export async function upsertProduct(
  userId: string,
  data: { asin: string; sku: string; title?: string; brand?: string }
) {
  const existing = await prisma.product.findUnique({
    where: { userId_asin: { userId, asin: data.asin } },
  });

  // Don't overwrite SKU if it was manually set (i.e. doesn't look auto-generated)
  const isAutoSku = !existing || existing.sku.startsWith("Amazon.Found.") || existing.sku === data.asin;
  const skuToUse  = isAutoSku ? data.sku : existing.sku;

  return prisma.product.upsert({
    where:  { userId_asin: { userId, asin: data.asin } },
    create: { userId, ...data, sku: skuToUse },
    update: {
      sku:   skuToUse,
      title: data.title ?? undefined,
      brand: data.brand ?? undefined,
    },
  });
}

export async function updateProductSettings(
  productId: string,
  data: Partial<Omit<ProductSettings, never>>
) {
  return prisma.productSettings.upsert({
    where: { productId },
    create: { productId, ...data },
    update: data,
  });
}

// ─── DAILY FACTS ─────────────────────────────────────────────────────────────

export async function upsertDailySales(
  productId: string,
  marketplaceId: string,
  date: Date,
  data: Partial<Prisma.DailySalesCreateInput>
) {
  const key = { productId_marketplaceId_date: { productId, marketplaceId, date } };
  return prisma.dailySales.upsert({
    where: key,
    create: { productId, marketplaceId, date, ...data } as Prisma.DailySalesCreateInput,
    update: data,
  });
}

export async function upsertDailyAds(
  campaignId: string,
  marketplaceId: string,
  date: Date,
  data: Partial<Prisma.DailyAdsCreateInput>
) {
  return prisma.dailyAds.upsert({
    where: { campaignId_marketplaceId_date: { campaignId, marketplaceId, date } },
    create: { campaignId, marketplaceId, date, ...data } as Prisma.DailyAdsCreateInput,
    update: data,
  });
}

export async function upsertDailyFees(
  productId: string,
  marketplaceId: string,
  date: Date,
  data: Partial<Prisma.DailyFeesCreateInput>
) {
  return prisma.dailyFees.upsert({
    where: { productId_marketplaceId_date: { productId, marketplaceId, date } },
    create: { productId, marketplaceId, date, ...data } as Prisma.DailyFeesCreateInput,
    update: data,
  });
}

// ─── PROFIT QUERIES ──────────────────────────────────────────────────────────

type Period = "TODAY" | "YESTERDAY" | "7D" | "30D" | "MTD" | "LAST_MONTH" | "60D";

export async function getProductProfitSummary(
  productId: string,
  marketplaceId: string,
  period: Period
): Promise<ProfitSummary | null> {
  const { start, end } = getDateRange(period);

  const [salesRows, adsRows, feesRows, product] = await Promise.all([
    prisma.dailySales.findMany({ where: { productId, marketplaceId, date: { gte: start, lte: end } } }),
    prisma.dailyAds.findMany({ where: { productId, marketplaceId, date: { gte: start, lte: end } } }),
    prisma.dailyFees.findMany({ where: { productId, marketplaceId, date: { gte: start, lte: end } } }),
    prisma.product.findUnique({ where: { id: productId }, include: { settings: true } }),
  ]);

  if (!product?.settings) return null;

  return computeProfitSummary(salesRows, adsRows, feesRows, product.settings);
}

export async function getAllProductsProfitSummary(
  userId: string,
  marketplaceId: string,
  period: Period
) {
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    include: { settings: true },
  });

  const { start, end } = getDateRange(period);

  const results = await Promise.all(
    products.map(async (product) => {
      if (!product.settings) return { product, summary: null };

      const [sales, ads, fees] = await Promise.all([
        prisma.dailySales.findMany({ where: { productId: product.id, marketplaceId, date: { gte: start, lte: end } } }),
        prisma.dailyAds.findMany({ where: { productId: product.id, marketplaceId, date: { gte: start, lte: end } } }),
        prisma.dailyFees.findMany({ where: { productId: product.id, marketplaceId, date: { gte: start, lte: end } } }),
      ]);

      const summary = computeProfitSummary(sales, ads, fees, product.settings);
      return { product, summary };
    })
  );

  return results;
}

// ─── INVENTORY QUERIES ────────────────────────────────────────────────────────

export async function getLatestInventorySnapshot(productId: string, marketplaceId: string) {
  return prisma.inventorySnapshot.findFirst({
    where: { productId, marketplaceId },
    orderBy: { snapshotAt: "desc" },
  });
}

export async function appendInventorySnapshot(
  productId: string,
  marketplaceId: string,
  data: { available: number; reserved: number; inbound: number; awd?: number; warehouse?: string }
) {
  return prisma.inventorySnapshot.create({
    data: { productId, marketplaceId, ...data },
  });
}

export async function getProductInventorySummary(
  productId: string,
  marketplaceId: string
): Promise<InventorySummary | null> {
  const today = new Date();
  const d60   = new Date(today); d60.setDate(today.getDate() - 59);
  const d30   = new Date(today); d30.setDate(today.getDate() - 29);
  const d7    = new Date(today); d7.setDate(today.getDate() - 6);

  const [snap, product, sales60, sales30, sales7] = await Promise.all([
    getLatestInventorySnapshot(productId, marketplaceId),
    prisma.product.findUnique({ where: { id: productId }, include: { settings: true } }),
    prisma.dailySales.findMany({ where: { productId, marketplaceId, date: { gte: d60 } } }),
    prisma.dailySales.findMany({ where: { productId, marketplaceId, date: { gte: d30 } } }),
    prisma.dailySales.findMany({ where: { productId, marketplaceId, date: { gte: d7 } } }),
  ]);

  if (!snap || !product?.settings) return null;

  return computeInventorySummary(
    { available: snap.available, reserved: snap.reserved, inbound: snap.inbound, awd: snap.awd },
    sales7,
    sales30,
    sales60,
    product.settings,
    today
  );
}

// ─── CASH FLOW ────────────────────────────────────────────────────────────────

export async function getCashForecast(userId: string, startingCash: number, months: number = 6) {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const cashFloor = settings?.cashFloor ?? DEFAULT_RULES_CONFIG.cashFloor;

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today so we don't miss today's events
  const end   = new Date(today);
  end.setMonth(today.getMonth() + months);

  const dbEvents = await prisma.cashEvent.findMany({
    where: { userId, eventDate: { gte: today, lte: end } },
    orderBy: { eventDate: "asc" },
  });

  const events: CashEvent[] = dbEvents.map(e => ({
    eventDate: e.eventDate,
    type: e.type,
    direction: e.direction as "INFLOW" | "OUTFLOW",
    amount: e.amount,
    description: e.notes ?? undefined,
  }));

  return computeCashForecast(startingCash, events, cashFloor, months, today);
}

// ─── OVERVIEW DASHBOARD ──────────────────────────────────────────────────────

export async function getOverviewDashboard(
  userId: string,
  marketplaceId: string,
  period: Period = "MTD"
) {
  const [productProfits, alerts, aiInsights, poCount, openReimbursements] = await Promise.all([
    getAllProductsProfitSummary(userId, marketplaceId, period),
    getActiveAlerts(userId, marketplaceId),
    prisma.aiInsight.findMany({
      where: { userId, status: "OPEN" },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 5,
    }),
    prisma.purchaseOrder.count({ where: { userId, status: { in: ["DRAFT", "APPROVED", "IN_PRODUCTION", "SHIPPED"] } } }),
    prisma.reimbursement.count({ where: { userId, status: { in: ["OPEN", "SUBMITTED", "FOLLOW_UP"] } } }),
  ]);

  const totals = productProfits.reduce(
    (acc, { summary }) => {
      if (!summary) return acc;
      return {
        grossSales:  acc.grossSales  + summary.grossSales,
        netProfit:   acc.netProfit   + summary.netProfit,
        adSpend:     acc.adSpend     + summary.adSpend,
        amazonFees:  acc.amazonFees  + summary.amazonFees,
        cogsTotal:   acc.cogsTotal   + summary.cogsTotal,
        unitsSold:   acc.unitsSold   + summary.unitsSold,
      };
    },
    { grossSales: 0, netProfit: 0, adSpend: 0, amazonFees: 0, cogsTotal: 0, unitsSold: 0 }
  );

  const avgMargin = totals.grossSales > 0 ? totals.netProfit / totals.grossSales : null;

  return {
    period,
    totals,
    avgMargin,
    products: productProfits,
    alerts,
    aiInsights,
    openPoCount: poCount,
    openReimbursementCount: openReimbursements,
  };
}

// ─── ALERTS (RULES ENGINE) ───────────────────────────────────────────────────

export async function getActiveAlerts(userId: string, marketplaceId: string) {
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    include: { settings: true },
  });

  const allAlerts = [];

  for (const product of products) {
    if (!product.settings) continue;

    const [inv, profit30] = await Promise.all([
      getProductInventorySummary(product.id, marketplaceId),
      getProductProfitSummary(product.id, marketplaceId, "30D"),
    ]);

    const name = product.title ?? product.sku;

    if (inv) {
      allAlerts.push(...runInventoryRules(product.id, name, inv));
    }
    if (profit30) {
      allAlerts.push(...runProfitRules(product.id, name, profit30, product.settings));
    }
  }

  return allAlerts;
}

// ─── PURCHASE ORDERS ─────────────────────────────────────────────────────────

export async function getPurchaseOrders(userId: string) {
  return prisma.purchaseOrder.findMany({
    where: { userId },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPurchaseOrder(
  userId: string,
  data: Prisma.PurchaseOrderCreateInput,
  items: Array<{ productId: string; qtyUnits: number; unitCost: number }>
) {
  return prisma.purchaseOrder.create({
    data: {
      ...data,
      user: { connect: { id: userId } },
      items: {
        create: items.map(item => ({
          ...item,
          totalCost: item.qtyUnits * item.unitCost,
          product: { connect: { id: item.productId } },
        })),
      },
    },
    include: { items: { include: { product: true } } },
  });
}

// ─── SHIPMENTS ────────────────────────────────────────────────────────────────

export async function getShipments(userId: string) {
  return prisma.shipment.findMany({
    where: { userId },
    include: { items: { include: { product: true } }, purchaseOrder: true },
    orderBy: { createdAt: "desc" },
  });
}

// ─── REIMBURSEMENTS ──────────────────────────────────────────────────────────

export async function getReimbursements(userId: string) {
  const items = await prisma.reimbursement.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { openedAt: "desc" },
  });

  // Add priority score to each
  const today = new Date();
  return items.map(r => ({
    ...r,
    priorityScore: computeReimbursementPriority(r, today),
  }));
}

function computeReimbursementPriority(
  r: { amountEstimated: number; amountRecovered: number; openedAt: Date; status: string },
  today: Date
) {
  const outstanding = r.amountEstimated - r.amountRecovered;
  const agingDays   = Math.floor((today.getTime() - r.openedAt.getTime()) / 86400000);
  const statusBonus = r.status === "FOLLOW_UP" ? 20 : r.status === "OPEN" ? 10 : r.status === "SUBMITTED" ? 5 : 0;
  return Math.round(outstanding * 0.6 + agingDays * 0.3 + statusBonus);
}

// ─── EXPENSES ────────────────────────────────────────────────────────────────

export async function getExpenses(userId: string) {
  return prisma.expense.findMany({
    where: { userId },
    orderBy: { category: "asc" },
  });
}

export function computeMonthlyExpenseTotal(
  expenses: Array<{ amount: number; frequency: string }>
) {
  return expenses.reduce((sum, e) => {
    switch (e.frequency) {
      case "MONTHLY":  return sum + e.amount;
      case "WEEKLY":   return sum + e.amount * 4.33;
      case "YEARLY":   return sum + e.amount / 12;
      case "ONE_TIME": return sum;
      default:         return sum;
    }
  }, 0);
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

export async function getProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    include: { tasks: true },
    orderBy: { createdAt: "desc" },
  });
}

// ─── AI INSIGHTS ─────────────────────────────────────────────────────────────

export async function persistInsights(
  userId: string,
  insights: Array<{
    scope: string;
    insightType: string;
    severity: string;
    title: string;
    body: string;
    actionText?: string;
    productId?: string;
  }>
) {
  return prisma.aiInsight.createMany({
    data: insights.map(i => ({
      userId,
      scope:       i.scope       as any,
      insightType: i.insightType as any,
      severity:    i.severity    as any,
      title:       i.title,
      body:        i.body,
      actionText:  i.actionText,
      productId:   i.productId,
    })),
  });
}

export async function getAiInsights(userId: string) {
  return prisma.aiInsight.findMany({
    where: { userId, status: "OPEN" },
    include: { product: true },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
  });
}
