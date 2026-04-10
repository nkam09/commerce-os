import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round, calcReorder } from "@/lib/utils/math";
import { daysAgo, todayUtc } from "@/lib/utils/dates";

export type ProductDrawerPayload = {
  identity: {
    id: string;
    asin: string;
    sku: string | null;
    fnsku: string | null;
    title: string | null;
    brand: string | null;
    category: string | null;
    imageUrl: string | null;
    status: string;
  };
  summaryCards: {
    grossSales30d: number;
    unitsSold30d: number;
    adSpend30d: number;
    acos30d: number | null;
    totalFees30d: number;
    netProfit30d: number;
  };
  inventory: {
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
  } | null;
  profitBlock: {
    landedCogs: number | null;
    avgReferralFee: number | null;
    avgFbaFee: number | null;
    estimatedNetMarginPct: number | null;
  };
  alerts: {
    id: string;
    title: string;
    severity: string;
    type: string;
  }[];
  aiBlock: {
    hasInsights: boolean;
    openCount: number;
    latestTitle: string | null;
  };
};

export async function getProductDrawer(
  userId: string,
  productId: string
): Promise<ProductDrawerPayload | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, userId },
    include: {
      setting: true,
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
      },
      aiInsights: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, severity: true, type: true },
      },
    },
  });

  if (!product) return null;

  const start = daysAgo(30);
  const today = todayUtc();

  const [salesAgg, feesAgg, adsAgg] = await Promise.all([
    prisma.dailySale.aggregate({
      where: { productId, date: { gte: start, lte: today } },
      _sum: { grossSales: true, unitsSold: true, refundAmount: true },
    }),
    prisma.dailyFee.aggregate({
      where: { productId, date: { gte: start, lte: today } },
      _sum: { referralFee: true, fbaFee: true, storageFee: true, awdStorageFee: true, returnProcessingFee: true, otherFees: true },
    }),
    prisma.dailyAd.aggregate({
      where: { productId, date: { gte: start, lte: today } },
      _sum: { spend: true, attributedSales: true },
    }),
  ]);

  const grossSales30d = toNum(salesAgg._sum.grossSales) - toNum(salesAgg._sum.refundAmount);
  const unitsSold30d = salesAgg._sum.unitsSold ?? 0;
  const adSpend30d = toNum(adsAgg._sum.spend);
  const attrSales = toNum(adsAgg._sum.attributedSales);
  const acos30d = attrSales > 0 ? round(safeDiv(adSpend30d, attrSales), 4) : null;
  const totalFees30d =
    toNum(feesAgg._sum.referralFee) +
    toNum(feesAgg._sum.fbaFee) +
    toNum(feesAgg._sum.storageFee) +
    toNum(feesAgg._sum.awdStorageFee) +
    toNum(feesAgg._sum.returnProcessingFee) +
    toNum(feesAgg._sum.otherFees);
  const netProfit30d = round(grossSales30d - totalFees30d - adSpend30d);

  // Inventory block
  const inv = product.inventorySnapshots[0];
  const s = product.setting;
  const avgDaily = unitsSold30d > 0 ? unitsSold30d / 30 : 0;
  let inventoryBlock: ProductDrawerPayload["inventory"] = null;

  if (inv) {
    let daysLeft: number | null = null;
    let reorderPoint: number | null = null;
    let suggestedQty: number | null = null;
    let reorderCashNeeded: number | null = null;
    let isUnderReorderPoint = false;
    let isStockoutRisk = false;

    if (s && avgDaily > 0) {
      const result = calcReorder({
        available: inv.available,
        inbound: inv.inbound,
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
      daysLeft = round(safeDiv(inv.available + inv.inbound, avgDaily), 1);
      isStockoutRisk = daysLeft < 30;
    }

    inventoryBlock = {
      available: inv.available,
      reserved: inv.reserved,
      inbound: inv.inbound,
      awd: inv.awd,
      daysLeft,
      reorderPoint,
      suggestedQty,
      reorderCashNeeded,
      isUnderReorderPoint,
      isStockoutRisk,
    };
  }

  // Profit block from settings + fee data
  const avgDays = 30;
  const avgReferralFee =
    unitsSold30d > 0 ? round(safeDiv(toNum(feesAgg._sum.referralFee), unitsSold30d), 4) : null;
  const avgFbaFee =
    unitsSold30d > 0 ? round(safeDiv(toNum(feesAgg._sum.fbaFee), unitsSold30d), 4) : null;
  const landedCogs = s ? toNum(s.landedCogs) || null : null;
  let estimatedNetMarginPct: number | null = null;
  if (grossSales30d > 0) {
    estimatedNetMarginPct = round(safeDiv(netProfit30d, grossSales30d), 4);
  }

  void avgDays; // suppress unused warning

  return {
    identity: {
      id: product.id,
      asin: product.asin,
      sku: product.sku,
      fnsku: product.fnsku,
      title: product.title,
      brand: product.brand,
      category: product.category,
      imageUrl: product.imageUrl,
      status: product.status,
    },
    summaryCards: {
      grossSales30d: round(grossSales30d),
      unitsSold30d,
      adSpend30d: round(adSpend30d),
      acos30d,
      totalFees30d: round(totalFees30d),
      netProfit30d,
    },
    inventory: inventoryBlock,
    profitBlock: {
      landedCogs,
      avgReferralFee,
      avgFbaFee,
      estimatedNetMarginPct,
    },
    alerts: product.aiInsights,
    aiBlock: {
      hasInsights: product.aiInsights.length > 0,
      openCount: product.aiInsights.length,
      latestTitle: product.aiInsights[0]?.title ?? null,
    },
  };
}
