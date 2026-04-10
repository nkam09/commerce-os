/**
 * Sales Normalization Service
 *
 * Resolves ASIN + marketplaceCode → internal productId + marketplaceId,
 * then upserts DailySale records.
 *
 * Unknown ASINs (not yet in the products table) are skipped and counted.
 * To add new products discovered during sync, use syncCatalogJob first.
 */
import { prisma } from "@/lib/db/prisma";
import type { RawSaleRow } from "@/lib/amazon/order-payload-transformer";

export type LookupMaps = {
  asinToProductId: Map<string, string>;
  skuToProductId: Map<string, string>;   // seller SKU → productId fallback
  codeToMarketplaceId: Map<string, string>;
};

/**
 * Load lookup maps for a user in one query each.
 * Call once per job run, then reuse.
 */
export async function loadLookupMaps(userId: string): Promise<LookupMaps> {
  const [products, marketplaces] = await Promise.all([
    prisma.product.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      select: { id: true, asin: true, sku: true },
    }),
    prisma.marketplace.findMany({
      where: { userId },
      select: { id: true, code: true },
    }),
  ]);

  const skuToProductId = new Map<string, string>();
  for (const p of products) {
    if (p.sku) skuToProductId.set(p.sku, p.id);
  }

  return {
    asinToProductId: new Map(products.map((p) => [p.asin, p.id])),
    skuToProductId,
    codeToMarketplaceId: new Map(marketplaces.map((m) => [m.code, m.id])),
  };
}

export type SalesNormResult = {
  written: number;
  skippedUnknownAsin: number;
  skippedAsins: string[];
  skippedUnknownMarketplace: number;
};

/**
 * Upserts a batch of RawSaleRow into DailySale.
 * Unique key: (productId, marketplaceId, date).
 *
 * TODO: Confirm replace vs increment semantics for re-runs live.
 */
export async function normalizeSaleRows(
  rows: RawSaleRow[],
  maps: LookupMaps
): Promise<SalesNormResult> {
  let written = 0;
  let skippedUnknownAsin = 0;
  let skippedUnknownMarketplace = 0;
  const skippedAsinSet = new Set<string>();

  for (const row of rows) {
    const productId = maps.asinToProductId.get(row.asin);
    if (!productId) {
      skippedUnknownAsin++;
      skippedAsinSet.add(row.asin);
      continue;
    }

    const marketplaceId = maps.codeToMarketplaceId.get(row.marketplaceCode);
    if (!marketplaceId) { skippedUnknownMarketplace++; continue; }

    await prisma.dailySale.upsert({
      where: {
        productId_marketplaceId_date: {
          productId,
          marketplaceId,
          date: row.date,
        },
      },
      create: {
        productId,
        marketplaceId,
        date: row.date,
        unitsSold: row.unitsSold,
        orderCount: row.orderCount,
        grossSales: row.grossSales,
        // Settlement-owned fields: seeded to 0 on create, never overwritten on update
        refundCount: 0,
        refundAmount: 0,
        promoAmount: 0,
        refundCommission: 0,
        refundedReferralFee: 0,
      },
      update: {
        // Only order-owned fields are overwritten here.
        // Settlement-owned fields (refundCount, refundAmount, promoAmount,
        // refundCommission, refundedReferralFee) are written exclusively by
        // sync-settlement-refunds-job and must not be touched.
        unitsSold: row.unitsSold,
        orderCount: row.orderCount,
        grossSales: row.grossSales,
      },
    });

    written++;
  }

  return {
    written,
    skippedUnknownAsin,
    skippedAsins: Array.from(skippedAsinSet),
    skippedUnknownMarketplace,
  };
}
