/**
 * Fee Calculation Service
 *
 * Calculates DailyFee rows from order data using hardcoded per-unit rates.
 *
 * This REPLACES sync-finances attribution. sync-finances attributed fees by
 * settlement posting date (wrong), not order date. Per-unit rates verified
 * against Sellerboard match exactly for every product × date combination.
 *
 * Rates come from Amazon's fee calculator for each product's
 * dimensions/weight and category.
 *
 * ALWAYS overwrites referralFee and fbaFee for every (productId, marketplaceId,
 * date) combination with sales. Does NOT touch storageFee, awdStorageFee,
 * otherFees, returnProcessingFee, or reimbursement — those come from the
 * settlement report sync.
 */

import { prisma } from "@/lib/db/prisma";

/**
 * Hardcoded per-unit fee rates by ASIN.
 * Verified against Sellerboard for every April day.
 */
const FEE_RATES: Record<string, { fba: number; referral: number }> = {
  "B07XYBW774": { fba: 5.33, referral: 3.45 }, // LS-F7X1-BY3D, $22.99
  "B0B27GRHFR": { fba: 4.20, referral: 2.25 }, // V7-IMUQ-04E5, $14.99
  "B0D7NNL4BL": { fba: 2.91, referral: 1.35 }, // KS-BW20L,     $8.99
};

/** Default rates when ASIN is not in the known map */
const DEFAULT_RATES = { fba: 4.0, referral: 2.0 };

// ─── Main calculation function ───────────────────────────────────────────────

/**
 * Calculates and writes daily_fees rows (fbaFee + referralFee only) for
 * every product × date that has sales in the window.
 *
 * ALWAYS overwrites these two columns. Never skips. Never touches
 * storageFee / awdStorageFee / otherFees / returnProcessingFee / reimbursement
 * — those come from settlement reports.
 *
 * @param userId - Internal user ID
 * @param fromDate - Start date for calculation window
 */
export async function estimateRecentFees(
  userId: string,
  fromDate: Date
): Promise<{ estimated: number; skipped: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const startDate = new Date(fromDate);
  startDate.setUTCHours(0, 0, 0, 0);

  // Get all daily sales in the calculation window, include product ASIN
  const salesInWindow = await prisma.dailySale.findMany({
    where: {
      product: { userId },
      date: { gte: startDate, lte: today },
      unitsSold: { gt: 0 },
    },
    select: {
      productId: true,
      marketplaceId: true,
      date: true,
      unitsSold: true,
      product: { select: { asin: true } },
    },
  });

  if (salesInWindow.length === 0) {
    console.log("[fee-calc] no sales in window, nothing to calculate");
    return { estimated: 0, skipped: 0 };
  }

  let calculated = 0;

  for (const sale of salesInWindow) {
    const asin = sale.product?.asin ?? "";
    const rates = FEE_RATES[asin] ?? DEFAULT_RATES;

    const fbaFee = Math.round(rates.fba * sale.unitsSold * 100) / 100;
    const referralFee = Math.round(rates.referral * sale.unitsSold * 100) / 100;

    await prisma.dailyFee.upsert({
      where: {
        productId_marketplaceId_date: {
          productId: sale.productId,
          marketplaceId: sale.marketplaceId,
          date: sale.date,
        },
      },
      create: {
        productId: sale.productId,
        marketplaceId: sale.marketplaceId,
        date: sale.date,
        referralFee,
        fbaFee,
        storageFee: 0,
        awdStorageFee: 0,
        returnProcessingFee: 0,
        otherFees: 0,
        reimbursement: 0,
      },
      // ONLY overwrite fba + referral — settlement-sourced columns are preserved
      update: {
        referralFee,
        fbaFee,
      },
    });

    const dateStr = sale.date.toISOString().slice(0, 10);
    console.log(
      `[fee-calc] ${dateStr} ${asin}: ref=$${referralFee.toFixed(2)} fba=$${fbaFee.toFixed(2)} (${sale.unitsSold} units)`
    );

    calculated++;
  }

  return { estimated: calculated, skipped: 0 };
}
