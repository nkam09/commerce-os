/**
 * Inventory Payload Transformer
 *
 * Transforms SP API inventory summaries into RawInventoryRow output.
 * Captures the snapshot as of today (job run date).
 *
 * This module is pure: no DB access. Normalization (ASIN → productId)
 * happens in InventoryNormalizationService.
 *
 * TODO: Validate all inventoryDetails field names and nesting against live
 *       FBA Inventory v1 API responses. The nested structure is complex and
 *       field presence is conditional on item state.
 */

import type { SpInventorySummary } from "@/lib/amazon/sp-api-client";

// ─── Output Types ─────────────────────────────────────────────────────────────

export type RawInventoryRow = {
  asin: string;
  fnSku: string | null;
  sku: string | null;
  marketplaceCode: string; // Amazon marketplace ID
  snapshotDate: Date;      // UTC date only — date the job ran
  available: number;       // fulfillableQuantity
  reserved: number;        // totalReservedQuantity
  inbound: number;         // inboundWorkingQuantity + inboundShippedQuantity + inboundReceivingQuantity
  awd: number;             // AWD quantity if present (not in standard FBA inventory API)
  warehouse: number;       // unfulfillableQuantity (held at FC, not available)
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function safeInt(n?: number | null): number {
  if (n == null || isNaN(n)) return 0;
  return Math.max(0, Math.round(n));
}

// ─── Main transformer ─────────────────────────────────────────────────────────

/**
 * Transforms a list of SP API inventory summaries into snapshot rows.
 *
 * snapshotDate is set to today (UTC) at job run time.
 *
 * TODO: Validate inventoryDetails nesting structure live.
 * TODO: Confirm inbound breakdown fields (Working/Shipped/Receiving) live.
 * TODO: AWD (Amazon Warehousing and Distribution) is a separate API.
 *       The `awd` field will remain 0 until that API is integrated.
 */
export function transformInventorySummariesToRows(
  summaries: SpInventorySummary[],
  marketplaceCode: string,
  snapshotDate?: Date
): RawInventoryRow[] {
  const date = toUtcDateOnly(snapshotDate ?? new Date());

  return summaries
    .filter((s) => !!s.asin)
    .map((s): RawInventoryRow => {
      const details = s.inventoryDetails;
      const reserved = details?.reservedQuantity;
      const inboundWorking = safeInt(details?.inboundWorkingQuantity);
      const inboundShipped = safeInt(details?.inboundShippedQuantity);
      const inboundReceiving = safeInt(details?.inboundReceivingQuantity);
      const unfulfillable = safeInt(
        details?.unfulfillableQuantity?.totalUnfulfillableQuantity
      );

      return {
        asin: s.asin,
        fnSku: s.fnSku ?? null,
        sku: s.sellerSku ?? null,
        marketplaceCode,
        snapshotDate: date,
        available: safeInt(details?.fulfillableQuantity),
        reserved: safeInt(reserved?.totalReservedQuantity),
        inbound: inboundWorking + inboundShipped + inboundReceiving,
        awd: 0, // TODO: Integrate AWD API when available.
        warehouse: unfulfillable,
      };
    });
}
