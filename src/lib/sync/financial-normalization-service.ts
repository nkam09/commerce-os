/**
 * Financial Normalization Service
 *
 * Resolves ASIN + marketplaceCode → internal productId + marketplaceId,
 * then upserts DailyFee records.
 *
 * Resolution order per row:
 *   1. asin → asinToProductId
 *   2. sku  → skuToProductId  (fallback for events where SP API omits ASIN)
 *
 * Events with asin=UNKNOWN and no sku are skipped.
 */

import { prisma } from "@/lib/db/prisma";
import type { RawFeeRow } from "@/lib/amazon/financial-events-transformer";
import type { LookupMaps } from "@/lib/sync/sales-normalization-service";

export type SkippedFeeRow = {
  asin: string;
  sku?: string | null;
  marketplaceCode: string;
  date: string;
};

export type FinancialNormResult = {
  written: number;
  skippedUnknownAsin: number;
  skippedRows: SkippedFeeRow[];
  skippedUnknownMarketplace: number;
};

/**
 * Upserts a batch of RawFeeRow into DailyFee.
 * Unique key: (productId, marketplaceId, date).
 *
 * TODO: Confirm replace vs increment semantics for re-runs live.
 */
export async function normalizeFeeRows(
  rows: RawFeeRow[],
  maps: LookupMaps
): Promise<FinancialNormResult> {
  let written = 0;
  let skippedUnknownAsin = 0;
  let skippedUnknownMarketplace = 0;
  const skippedRows: SkippedFeeRow[] = [];

  for (const row of rows) {
    // Resolve productId: try ASIN first, then SKU fallback
    let productId: string | undefined;

    if (row.asin && row.asin !== "UNKNOWN") {
      productId = maps.asinToProductId.get(row.asin);
    }

    if (!productId && row.sku) {
      productId = maps.skuToProductId.get(row.sku);
    }

    if (!productId) {
      skippedUnknownAsin++;
      skippedRows.push({
        asin: row.asin,
        sku: row.sku ?? null,
        marketplaceCode: row.marketplaceCode,
        date: row.date.toISOString().slice(0, 10),
      });
      continue;
    }

    const marketplaceId = maps.codeToMarketplaceId.get(row.marketplaceCode);
    if (!marketplaceId) { skippedUnknownMarketplace++; continue; }

    await prisma.dailyFee.upsert({
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
        referralFee: row.referralFee,
        fbaFee: row.fbaFee,
        storageFee: row.storageFee,
        returnProcessingFee: row.returnProcessingFee,
        otherFees: row.otherFees,
      },
      update: {
        referralFee: row.referralFee,
        fbaFee: row.fbaFee,
        storageFee: row.storageFee,
        returnProcessingFee: row.returnProcessingFee,
        otherFees: row.otherFees,
      },
    });

    written++;
  }

  return { written, skippedUnknownAsin, skippedRows, skippedUnknownMarketplace };
}
