/**
 * Inventory Normalization Service
 *
 * Resolves ASIN + marketplaceCode → internal productId + marketplaceId,
 * then upserts InventorySnapshot records.
 *
 * InventorySnapshot has no unique constraint in the schema.
 * Strategy: find existing snapshot for (productId, marketplaceId, snapshotDate)
 * and update it, or create a new one. Uses findFirst + upsert-like logic.
 *
 * TODO: Consider adding a unique constraint to InventorySnapshot on
 *       (productId, marketplaceId, snapshotDate) to simplify upsert live.
 */

import { prisma } from "@/lib/db/prisma";
import type { RawInventoryRow } from "@/lib/amazon/inventory-payload-transformer";
import type { LookupMaps } from "@/lib/sync/sales-normalization-service";

export type SkippedInventoryRow = {
  asin: string;
  fnSku: string | null;
  sku: string | null;
};

export type InventoryNormResult = {
  written: number;
  updated: number;
  skippedUnknownAsin: number;
  skippedRows: SkippedInventoryRow[];       // one entry per skipped row (not deduplicated by ASIN)
  skippedUnknownMarketplace: number;
};

/**
 * Upserts inventory snapshots.
 * If a snapshot for the same (productId, marketplaceId, snapshotDate) exists,
 * updates it. Otherwise creates a new one.
 *
 * TODO: Validate that one snapshot per day per product is the correct
 *       granularity for the inventory planner's reorder calculations.
 */
export async function normalizeInventoryRows(
  rows: RawInventoryRow[],
  maps: LookupMaps
): Promise<InventoryNormResult> {
  let written = 0;
  let updated = 0;
  let skippedUnknownAsin = 0;
  let skippedUnknownMarketplace = 0;
  const skippedRows: SkippedInventoryRow[] = [];

  for (const row of rows) {
    let productId = maps.asinToProductId.get(row.asin);
if (!productId && row.sku) {
  productId = maps.skuToProductId.get(row.sku);
}
if (!productId) {
  skippedUnknownAsin++;
  skippedRows.push({ asin: row.asin, fnSku: row.fnSku, sku: row.sku });
  continue;
}

    const marketplaceId = maps.codeToMarketplaceId.get(row.marketplaceCode);
    if (!marketplaceId) { skippedUnknownMarketplace++; continue; }

    const existing = await prisma.inventorySnapshot.findFirst({
      where: { productId, marketplaceId, snapshotDate: row.snapshotDate },
      select: { id: true },
    });

    const data = {
      available: row.available,
      reserved: row.reserved,
      inbound: row.inbound,
      awd: row.awd,
      warehouse: row.warehouse,
    };

    if (existing) {
      await prisma.inventorySnapshot.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    } else {
      await prisma.inventorySnapshot.create({
        data: {
          productId,
          marketplaceId,
          snapshotDate: row.snapshotDate,
          ...data,
        },
      });
      written++;
    }
  }

  return { written, updated, skippedUnknownAsin, skippedRows, skippedUnknownMarketplace };
}
