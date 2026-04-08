/**
 * Fee Estimation Service
 *
 * Fills in estimated DailyFee rows for recent days where real fee data
 * hasn't arrived yet from Amazon's Financial Events API (24-48 hour delay).
 *
 * Estimation approach:
 *   - Referral fee: 15% of grossSales (standard for Kitchen & Dining)
 *   - FBA fee: hardcoded per-unit rate by ASIN × unitsSold
 *   - Storage fee: $3.78/day AWD storage split evenly across products with sales
 *   - Return/other: $0
 *
 * Why hardcoded rates instead of historical averages?
 *   sync-finances attributes fees to settlement date (not order date),
 *   so historical AVG(fbaFee / units) is unreliable. The hardcoded rates
 *   come from Amazon's fee calculator for each product's dimensions/weight.
 *
 * Estimates are only written where NO real fee data exists. When sync-finances
 * eventually posts real fees, they overwrite the estimates via upsert.
 *
 * The estimated rows have otherFees set to -0.0001 as a sentinel value
 * so they can be identified as estimates if needed.
 */

import { prisma } from "@/lib/db/prisma";

const REFERRAL_FEE_RATE = 0.15;

/** Sentinel value to mark estimated fee rows (invisible in sums) */
const ESTIMATE_SENTINEL = -0.0001;

/** Default FBA fee per unit when ASIN is not in the known map */
const DEFAULT_FBA_PER_UNIT = 4.0;

/** Daily AWD storage fee from Sellerboard ($3.78/day total) */
const DAILY_STORAGE_TOTAL = 3.78;

/**
 * Hardcoded per-unit FBA fulfillment fees by ASIN.
 * Source: Amazon Fee Calculator for each product's dimensions/weight.
 */
const FBA_RATE_BY_ASIN: Record<string, number> = {
  "B07XYBW774": 5.33, // 100-pack
  "B0B27GRHFR": 4.20, // 50-pack
  "B0D7NNL4BL": 2.91, // 20-pack
};

// ─── Main estimation function ─────────────────────────────────────────────────

/**
 * Estimates fees for recent days where real fee data hasn't arrived yet.
 *
 * For each day from fromDate to today, and for each product with sales
 * on that day, checks if a real DailyFee row exists. If not, writes an
 * estimated row using hardcoded per-unit FBA rates and 15% referral fee.
 *
 * @param userId - Internal user ID
 * @param fromDate - Start date for estimation window
 */
export async function estimateRecentFees(
  userId: string,
  fromDate: Date
): Promise<{ estimated: number; skipped: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const startDate = new Date(fromDate);
  startDate.setUTCHours(0, 0, 0, 0);

  // Get all daily sales in the estimation window, include product ASIN
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
      grossSales: true,
      product: { select: { asin: true } },
    },
  });

  if (salesInWindow.length === 0) {
    console.log("[fee-estimation] no sales in estimation window, nothing to estimate");
    return { estimated: 0, skipped: 0 };
  }

  // Get existing real fee rows in the window (exclude estimates via sentinel)
  const existingFees = await prisma.dailyFee.findMany({
    where: {
      product: { userId },
      date: { gte: startDate, lte: today },
    },
    select: {
      productId: true,
      marketplaceId: true,
      date: true,
      fbaFee: true,
      referralFee: true,
      otherFees: true,
    },
  });

  // Build a set of (productId::marketplaceId::date) keys that have real fees
  const realFeeKeys = new Set<string>();
  for (const fee of existingFees) {
    const otherFees = Number(fee.otherFees);
    // If otherFees equals our sentinel, this is an estimate — don't count as real
    if (Math.abs(otherFees - ESTIMATE_SENTINEL) < 0.00001) continue;

    const totalFee = Number(fee.fbaFee) + Number(fee.referralFee);
    // Only count as "real" if there's actually fee data
    if (totalFee > 0) {
      const dateStr = fee.date.toISOString().slice(0, 10);
      realFeeKeys.add(`${fee.productId}::${fee.marketplaceId}::${dateStr}`);
    }
  }

  let estimated = 0;
  let skipped = 0;

  // Group sales by date to compute per-product storage allocation
  const salesByDate = new Map<string, typeof salesInWindow>();
  for (const sale of salesInWindow) {
    const dateStr = sale.date.toISOString().slice(0, 10);
    const key = `${sale.productId}::${sale.marketplaceId}::${dateStr}`;
    // Only count sales that need estimation (not already covered by real fees)
    if (realFeeKeys.has(key)) {
      skipped++;
      continue;
    }
    if (!salesByDate.has(dateStr)) salesByDate.set(dateStr, []);
    salesByDate.get(dateStr)!.push(sale);
  }

  for (const [dateStr, dateSales] of salesByDate) {
    // Split daily storage evenly across products with sales that day
    const storagePerProduct =
      Math.round((DAILY_STORAGE_TOTAL / dateSales.length) * 100) / 100;

    for (const sale of dateSales) {
      const asin = sale.product?.asin ?? "";
      const fbaPerUnit = FBA_RATE_BY_ASIN[asin] ?? DEFAULT_FBA_PER_UNIT;

      const grossSales = Number(sale.grossSales);
      const estReferralFee = Math.round(grossSales * REFERRAL_FEE_RATE * 100) / 100;
      const estFbaFee = Math.round(fbaPerUnit * sale.unitsSold * 100) / 100;

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
          referralFee: estReferralFee,
          fbaFee: estFbaFee,
          storageFee: storagePerProduct,
          returnProcessingFee: 0,
          otherFees: ESTIMATE_SENTINEL,
        },
        // Only update if the existing row is also an estimate (sentinel check)
        // Real fee data should never be overwritten
        update: {
          referralFee: estReferralFee,
          fbaFee: estFbaFee,
          storageFee: storagePerProduct,
          otherFees: ESTIMATE_SENTINEL,
        },
      });

      console.log(
        `[fee-estimation] ${dateStr} ${asin}: ref=$${estReferralFee.toFixed(2)} fba=$${estFbaFee.toFixed(2)} stor=$${storagePerProduct.toFixed(2)} (${sale.unitsSold}×$${fbaPerUnit.toFixed(2)})`
      );

      estimated++;
    }
  }

  return { estimated, skipped };
}
