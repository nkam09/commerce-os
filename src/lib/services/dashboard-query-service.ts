import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round, calcReorder } from "@/lib/utils/math";
import { daysAgo, todayUtc } from "@/lib/utils/dates";

// ─── Overview Dashboard ───────────────────────────────────────────────────────

export type OverviewDashboard = {
  metrics: {
    grossSales30d: number;
    unitsSold30d: number;
    orderCount30d: number;
    adSpend30d: number;
    totalFees30d: number;
    netProfit30d: number;
    acos30d: number | null;
  };
  productSummary: {
    total: number;
    active: number;
    stockoutRisk: number;
  };
  recentInsights: {
    id: string;
    title: string;
    severity: string;
    type: string;
    createdAt: string;
  }[];
  productHealth: {
    id: string;
    asin: string;
    title: string | null;
    available: number;
    daysLeft: number | null;
    hasAlert: boolean;
  }[];
};

export async function getOverviewDashboard(userId: string): Promise<OverviewDashboard> {
  const start = daysAgo(30);
  const today = todayUtc();

  // Aggregate sales
  const salesAgg = await prisma.dailySale.aggregate({
    where: {
      product: { userId },
      date: { gte: start, lte: today },
    },
    _sum: {
      grossSales: true,
      unitsSold: true,
      orderCount: true,
      refundAmount: true,
    },
  });

  // Aggregate fees
  const feesAgg = await prisma.dailyFee.aggregate({
    where: {
      product: { userId },
      date: { gte: start, lte: today },
    },
    _sum: {
      referralFee: true,
      fbaFee: true,
      storageFee: true,
      awdStorageFee: true,
      returnProcessingFee: true,
      otherFees: true,
    },
  });

  // Aggregate ads
  const adsAgg = await prisma.dailyAd.aggregate({
    where: {
      product: { userId },
      date: { gte: start, lte: today },
    },
    _sum: {
      spend: true,
      attributedSales: true,
    },
  });

  const grossSales30d = toNum(salesAgg._sum.grossSales) - toNum(salesAgg._sum.refundAmount);
  const unitsSold30d = salesAgg._sum.unitsSold ?? 0;
  const orderCount30d = salesAgg._sum.orderCount ?? 0;
  const adSpend30d = toNum(adsAgg._sum.spend);
  const totalFees30d =
    toNum(feesAgg._sum.referralFee) +
    toNum(feesAgg._sum.fbaFee) +
    toNum(feesAgg._sum.storageFee) +
    toNum(feesAgg._sum.awdStorageFee) +
    toNum(feesAgg._sum.returnProcessingFee) +
    toNum(feesAgg._sum.otherFees);

  // Simple net profit: revenue - fees - ads (no COGS without product settings join)
  const netProfit30d = round(grossSales30d - totalFees30d - adSpend30d);
  const attrSales = toNum(adsAgg._sum.attributedSales);
  const acos30d = attrSales > 0 ? round(safeDiv(adSpend30d, attrSales), 4) : null;

  // Product counts
  const [totalProducts, activeProducts] = await Promise.all([
    prisma.product.count({ where: { userId, status: { not: "ARCHIVED" } } }),
    prisma.product.count({ where: { userId, status: "ACTIVE" } }),
  ]);

  // Open critical/warning insights
  const insights = await prisma.aIInsight.findMany({
    where: { userId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, severity: true, type: true, createdAt: true },
  });

  // Product health: latest inventory snapshot per product
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      asin: true,
      title: true,
      setting: {
        select: {
          safetyStockDays: true,
          productionLeadDays: true,
          shippingLeadDays: true,
          receivingBufferDays: true,
          reorderCoverageDays: true,
          reorderMinQty: true,
          reorderCasePack: true,
          landedCogs: true,
        },
      },
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
        select: { available: true, reserved: true, inbound: true },
      },
      _count: {
        select: { aiInsights: true },
      },
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  // Calculate avg daily sales per product over 30d for daysLeft
  const salesByProduct = await prisma.dailySale.groupBy({
    by: ["productId"],
    where: {
      product: { userId },
      date: { gte: start, lte: today },
    },
    _sum: { unitsSold: true },
  });
  const salesMap = new Map(salesByProduct.map((s) => [s.productId, (s._sum.unitsSold ?? 0) / 30]));

  let stockoutRisk = 0;
  const productHealth = products.map((p) => {
    const inv = p.inventorySnapshots[0];
    const avgDaily = salesMap.get(p.id) ?? 0;
    let daysLeft: number | null = null;
    if (inv && avgDaily > 0) {
      daysLeft = round(safeDiv(inv.available + inv.inbound, avgDaily), 1);
      if (daysLeft < (p.setting?.safetyStockDays ?? 30)) stockoutRisk++;
    }
    return {
      id: p.id,
      asin: p.asin,
      title: p.title,
      available: inv?.available ?? 0,
      daysLeft,
      hasAlert: p._count.aiInsights > 0,
    };
  });

  return {
    metrics: {
      grossSales30d: round(grossSales30d),
      unitsSold30d,
      orderCount30d,
      adSpend30d: round(adSpend30d),
      totalFees30d: round(totalFees30d),
      netProfit30d,
      acos30d,
    },
    productSummary: { total: totalProducts, active: activeProducts, stockoutRisk },
    recentInsights: insights.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
    })),
    productHealth,
  };
}

// ─── Inventory Dashboard ──────────────────────────────────────────────────────

export type InventoryRow = {
  id: string;
  asin: string;
  title: string | null;
  available: number;
  reserved: number;
  inbound: number;
  awd: number;
  daysLeft: number | null;
  reorderPoint: number | null;
  suggestedQty: number | null;
  reorderCashNeeded: number | null;
  isUnderReorderPoint: boolean;
  isStockoutRisk: boolean;
  healthLabel: "ok" | "watch" | "reorder" | "stockout";
};

export type InventoryDashboard = {
  rows: InventoryRow[];
  summary: {
    totalSkus: number;
    reorderNeeded: number;
    stockoutRisk: number;
    totalReorderCash: number;
  };
};

export async function getInventoryDashboard(userId: string): Promise<InventoryDashboard> {
  const start = daysAgo(30);
  const today = todayUtc();

  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      asin: true,
      title: true,
      setting: {
        select: {
          safetyStockDays: true,
          productionLeadDays: true,
          shippingLeadDays: true,
          receivingBufferDays: true,
          reorderCoverageDays: true,
          reorderMinQty: true,
          reorderCasePack: true,
          landedCogs: true,
        },
      },
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const salesByProduct = await prisma.dailySale.groupBy({
    by: ["productId"],
    where: {
      product: { userId },
      date: { gte: start, lte: today },
    },
    _sum: { unitsSold: true },
  });
  const salesMap = new Map(salesByProduct.map((s) => [s.productId, (s._sum.unitsSold ?? 0) / 30]));

  let reorderNeeded = 0;
  let stockoutRisk = 0;
  let totalReorderCash = 0;

  const rows: InventoryRow[] = products.map((p) => {
    const inv = p.inventorySnapshots[0];
    const avgDaily = salesMap.get(p.id) ?? 0;
    const s = p.setting;

    const available = inv?.available ?? 0;
    const reserved = inv?.reserved ?? 0;
    const inbound = inv?.inbound ?? 0;
    const awd = inv?.awd ?? 0;

    let daysLeft: number | null = null;
    let reorderPoint: number | null = null;
    let suggestedQty: number | null = null;
    let reorderCashNeeded: number | null = null;
    let isUnderReorderPoint = false;
    let isStockoutRisk = false;

    if (s && avgDaily > 0) {
      const result = calcReorder({
        available,
        inbound,
        avgDailySales: avgDaily,
        productionLeadDays: s.productionLeadDays ?? 45,
        shippingLeadDays: s.shippingLeadDays ?? 21,
        receivingBufferDays: s.receivingBufferDays ?? 7,
        safetyStockDays: s.safetyStockDays ?? 30,
        reorderCoverageDays: s.reorderCoverageDays ?? 90,
        reorderMinQty: s.reorderMinQty ?? 100,
        reorderCasePack: s.reorderCasePack ?? 1,
        landedCogs: toNum(s.landedCogs),
      });
      daysLeft = result.daysLeft;
      reorderPoint = result.reorderPoint;
      suggestedQty = result.suggestedQty;
      reorderCashNeeded = result.reorderCashNeeded;
      isUnderReorderPoint = result.isUnderReorderPoint;
      isStockoutRisk = result.isStockoutRisk;
    } else if (avgDaily > 0) {
      daysLeft = round(safeDiv(available + inbound, avgDaily), 1);
      isStockoutRisk = daysLeft < 30;
    }

    if (isStockoutRisk) stockoutRisk++;
    if (isUnderReorderPoint) {
      reorderNeeded++;
      totalReorderCash += reorderCashNeeded ?? 0;
    }

    const healthLabel: InventoryRow["healthLabel"] = isStockoutRisk
      ? "stockout"
      : isUnderReorderPoint
      ? "reorder"
      : daysLeft !== null && daysLeft < 45
      ? "watch"
      : "ok";

    return {
      id: p.id,
      asin: p.asin,
      title: p.title,
      available,
      reserved,
      inbound,
      awd,
      daysLeft,
      reorderPoint,
      suggestedQty,
      reorderCashNeeded,
      isUnderReorderPoint,
      isStockoutRisk,
      healthLabel,
    };
  });

  return {
    rows,
    summary: {
      totalSkus: products.length,
      reorderNeeded,
      stockoutRisk,
      totalReorderCash: round(totalReorderCash),
    },
  };
}

// ─── Cash Flow Dashboard ──────────────────────────────────────────────────────

export type CashFlowDashboard = {
  metrics: {
    estimatedCashInflow30d: number;
    scheduledOutflow30d: number;
    pendingPoBalance: number;
    monthlyExpenseBurn: number;
  };
  purchaseOrders: {
    id: string;
    poNumber: string | null;
    supplier: string;
    status: string;
    totalAmount: number;
    balanceDue: number;
    expectedEta: string | null;
  }[];
  upcomingExpenses: {
    id: string;
    name: string;
    amount: number;
    frequency: string;
    effectiveAt: string;
  }[];
};

export async function getCashFlowDashboard(userId: string): Promise<CashFlowDashboard> {
  const start = daysAgo(30);
  const today = todayUtc();

  // Estimate cash inflow from recent gross sales
  const salesAgg = await prisma.dailySale.aggregate({
    where: {
      product: { userId },
      date: { gte: start, lte: today },
    },
    _sum: { grossSales: true, refundAmount: true },
  });
  const estimatedCashInflow30d = round(
    toNum(salesAgg._sum.grossSales) - toNum(salesAgg._sum.refundAmount)
  );

  // Open POs with balance due
  const openPOs = await prisma.purchaseOrder.findMany({
    where: {
      userId,
      archivedAt: null,
      status: { notIn: ["RECEIVED", "CANCELLED", "ARCHIVED"] },
    },
    orderBy: { expectedEta: "asc" },
    select: {
      id: true,
      poNumber: true,
      supplier: true,
      status: true,
      totalAmount: true,
      balanceDue: true,
      expectedEta: true,
    },
  });

  const pendingPoBalance = openPOs.reduce((sum, po) => sum + toNum(po.balanceDue), 0);

  // Active expenses for burn rate
  const expenses = await prisma.expense.findMany({
    where: { userId, archivedAt: null },
    select: { id: true, name: true, amount: true, frequency: true, effectiveAt: true },
    orderBy: { effectiveAt: "asc" },
  });

  // Normalise to monthly equivalent
  const freqToMonthly: Record<string, number> = {
    ONE_TIME: 0,
    WEEKLY: 4.33,
    MONTHLY: 1,
    QUARTERLY: 1 / 3,
    ANNUALLY: 1 / 12,
  };
  const monthlyExpenseBurn = round(
    expenses.reduce((sum, e) => sum + toNum(e.amount) * (freqToMonthly[e.frequency] ?? 1), 0)
  );

  const scheduledOutflow30d = round(pendingPoBalance + monthlyExpenseBurn);

  return {
    metrics: {
      estimatedCashInflow30d,
      scheduledOutflow30d,
      pendingPoBalance: round(pendingPoBalance),
      monthlyExpenseBurn,
    },
    purchaseOrders: openPOs.map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      supplier: po.supplier,
      status: po.status,
      totalAmount: toNum(po.totalAmount),
      balanceDue: toNum(po.balanceDue),
      expectedEta: po.expectedEta?.toISOString() ?? null,
    })),
    upcomingExpenses: expenses.map((e) => ({
      id: e.id,
      name: e.name,
      amount: toNum(e.amount),
      frequency: e.frequency,
      effectiveAt: e.effectiveAt.toISOString(),
    })),
  };
}
