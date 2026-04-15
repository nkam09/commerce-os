import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round, calcProfit } from "@/lib/utils/math";
import { daysAgo } from "@/lib/utils/dates";

// ─── Products Management Types ───────────────────────────────────────────────

export type ProductManagementRow = {
  id: string;
  asin: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  price: number;
  fulfillment: string;
  tags: string[];
  cogs: number;
  unsellableReturnsPct: number;
  shippingProfile: string;
  profitPerUnit: number;
};

export type ProductsPageData = {
  products: ProductManagementRow[];
};

// ─── Service ────────────────────────────────────────────────────────────────

export async function getProductsPageData(
  userId: string,
  brand?: string
): Promise<ProductsPageData> {
  const thirtyDaysAgo = daysAgo(30);

  // Fetch active products with settings, latest inventory, and 30-day aggregates
  const products = await prisma.product.findMany({
    where: { userId, status: "ACTIVE", ...(brand ? { brand } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      asin: true,
      sku: true,
      title: true,
      imageUrl: true,
      setting: {
        select: {
          landedCogs: true,
          freightCost: true,
          prepCost: true,
          overheadCost: true,
        },
      },
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
        select: { available: true },
      },
      dailySales: {
        where: { date: { gte: thirtyDaysAgo } },
        select: {
          unitsSold: true,
          grossSales: true,
          refundCount: true,
          refundAmount: true,
        },
      },
      dailyFees: {
        where: { date: { gte: thirtyDaysAgo } },
        select: {
          referralFee: true,
          fbaFee: true,
          storageFee: true,
          awdStorageFee: true,
          returnProcessingFee: true,
          otherFees: true,
          reimbursement: true,
        },
      },
      dailyAds: {
        where: { date: { gte: thirtyDaysAgo } },
        select: { spend: true },
      },
    },
  });

  const rows: ProductManagementRow[] = products.map((p) => {
    // Aggregate 30-day sales
    const totalUnits = p.dailySales.reduce((s, d) => s + d.unitsSold, 0);
    const totalGross = p.dailySales.reduce((s, d) => s + toNum(d.grossSales), 0);
    const totalRefunds = p.dailySales.reduce((s, d) => s + d.refundCount, 0);
    const totalRefundAmt = p.dailySales.reduce((s, d) => s + toNum(d.refundAmount), 0);

    // Aggregate 30-day fees
    const totalReferral = p.dailyFees.reduce((s, d) => s + toNum(d.referralFee), 0);
    const totalFba = p.dailyFees.reduce((s, d) => s + toNum(d.fbaFee), 0);
    const totalStorage = p.dailyFees.reduce((s, d) => s + toNum(d.storageFee), 0);
    const totalAwdStorage = p.dailyFees.reduce((s, d) => s + toNum(d.awdStorageFee), 0);
    const totalOtherFees = p.dailyFees.reduce(
      (s, d) => s + toNum(d.returnProcessingFee) + toNum(d.otherFees),
      0
    );
    const totalReimbursement = p.dailyFees.reduce((s, d) => s + toNum(d.reimbursement), 0);

    // Aggregate 30-day ad spend
    const totalAdSpend = p.dailyAds.reduce((s, d) => s + toNum(d.spend), 0);

    // COGS from product settings
    const landedCogs = p.setting ? toNum(p.setting.landedCogs) : 0;
    const freightCost = p.setting ? toNum(p.setting.freightCost) : 0;
    const prepCost = p.setting ? toNum(p.setting.prepCost) : 0;
    const overheadCost = p.setting ? toNum(p.setting.overheadCost) : 0;
    const fullCogs = landedCogs + freightCost + prepCost + overheadCost;

    // Calculate profit using the shared calcProfit utility
    const profit = calcProfit({
      grossSales: totalGross,
      refundAmount: totalRefundAmt,
      referralFee: totalReferral,
      fbaFee: totalFba,
      storageFee: totalStorage,
      awdStorageFee: totalAwdStorage,
      otherFees: totalOtherFees,
      reimbursement: totalReimbursement,
      adSpend: totalAdSpend,
      landedCogs: fullCogs,
      unitsSold: totalUnits,
    });

    // Derive price from avg sale price (gross / units), fallback 0
    const avgPrice = round(safeDiv(totalGross, totalUnits), 2);

    // Unsellable returns % = refunds / units sold
    const unsellableReturnsPct = round(safeDiv(totalRefunds, totalUnits), 4);

    // Fulfillment: FBA if there are any fbaFees, else FBM
    const isFba = totalFba > 0;
    const fulfillment = isFba ? "FBA" : "FBM";

    // Tags: fulfillment type
    const tags: string[] = [fulfillment];

    return {
      id: p.id,
      asin: p.asin,
      sku: p.sku ?? "",
      title: p.title ?? "Untitled Product",
      imageUrl: p.imageUrl,
      price: avgPrice,
      fulfillment,
      tags,
      cogs: round(fullCogs, 2),
      unsellableReturnsPct,
      shippingProfile: "Default",
      profitPerUnit: profit.profitPerUnit,
    };
  });

  return { products: rows };
}

/** Synchronous fallback — returns empty until async data loads */
export function getProductsPageDataSync(): ProductsPageData {
  return { products: [] };
}
