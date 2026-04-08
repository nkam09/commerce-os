/**
 * Ads Normalization Service
 *
 * Resolves ASIN → internal productId, then writes DailyAd records.
 *
 * DailyAd has no unique constraint in the schema (no @@unique on
 * productId + marketplaceId + date + campaignName). Strategy: delete
 * all existing DailyAd rows for the covered date range, then insert fresh.
 * This ensures idempotent re-runs.
 *
 * TODO: Consider adding a unique constraint to DailyAd to enable upsert.
 *       The current delete+insert approach is safe but not atomic.
 *       Wrap in a Prisma transaction to improve consistency.
 */

import { prisma } from "@/lib/db/prisma";
import type { RawAdRow } from "@/lib/amazon/ads-report-transformer";
import type { LookupMaps } from "@/lib/sync/sales-normalization-service";

export type AdsNormResult = {
  deleted: number;
  written: number;
  skippedUnknownAsin: number;
  skippedUnknownMarketplace: number;
};

/**
 * Replaces DailyAd records for the given date range with fresh data.
 *
 * dateRange: the inclusive date range covered by the report.
 * All existing DailyAd records for known products + marketplace in this
 * range are deleted before insertion.
 */
export async function normalizeAdRows(
  rows: RawAdRow[],
  maps: LookupMaps,
  dateRange: { from: Date; to: Date }
): Promise<AdsNormResult> {
  let skippedUnknownAsin = 0;
  let skippedUnknownMarketplace = 0;

  // Resolve all rows to internal IDs first, collecting valid rows only
  type ResolvedRow = RawAdRow & { productId: string; marketplaceId: string };
  const resolved: ResolvedRow[] = [];

  for (const row of rows) {
    const productId = maps.asinToProductId.get(row.asin);
    if (!productId) { skippedUnknownAsin++; continue; }

    const marketplaceId = maps.codeToMarketplaceId.get(row.marketplaceCode);
    if (!marketplaceId) { skippedUnknownMarketplace++; continue; }

    resolved.push({ ...row, productId, marketplaceId });
  }

  if (resolved.length === 0) {
    return { deleted: 0, written: 0, skippedUnknownAsin, skippedUnknownMarketplace };
  }

  // Delete existing rows for the date range across known products
  const productIds = [...new Set(resolved.map((r) => r.productId))];
  const marketplaceIds = [...new Set(resolved.map((r) => r.marketplaceId))];

  // TODO: Consider wrapping delete + createMany in prisma.$transaction live.
  const { count: deleted } = await prisma.dailyAd.deleteMany({
    where: {
      productId: { in: productIds },
      marketplaceId: { in: marketplaceIds },
      date: { gte: dateRange.from, lte: dateRange.to },
    },
  });

  await prisma.dailyAd.createMany({
    data: resolved.map((row) => ({
      productId: row.productId,
      marketplaceId: row.marketplaceId,
      date: row.date,
      campaignName: row.campaignName,
      spend: row.spend,
      attributedSales: row.attributedSales,
      clicks: row.clicks,
      impressions: row.impressions,
      orders: row.orders,
      acos: row.acos,
      roas: row.roas,
      cpc: row.cpc,
    })),
    skipDuplicates: false,
  });

  return {
    deleted,
    written: resolved.length,
    skippedUnknownAsin,
    skippedUnknownMarketplace,
  };
}
