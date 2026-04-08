/**
 * Inventory Report Parser
 *
 * Parses the TSV output of GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA report
 * into RawInventoryRow[] matching the shape from inventory-payload-transformer.ts.
 *
 * Report columns:
 *   sku, fnsku, asin, product-name, condition, your-price,
 *   mfn-listing-exists, mfn-fulfillable-quantity, afn-listing-exists,
 *   afn-warehouse-quantity, afn-fulfillable-quantity, afn-unsellable-quantity,
 *   afn-reserved-quantity, afn-total-quantity, per-unit-volume,
 *   afn-inbound-working-quantity, afn-inbound-shipped-quantity,
 *   afn-inbound-receiving-quantity, afn-researching-quantity,
 *   afn-reserved-future-supply, afn-future-supply-buyable
 */

import type { RawInventoryRow } from "@/lib/amazon/inventory-payload-transformer";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeInt(v: string | undefined): number {
  if (!v || v === "" || v === "--") return 0;
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : Math.max(0, n);
}

function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse the TSV report content into RawInventoryRow[].
 * First line is the header row.
 */
export function parseInventoryReport(
  tsvContent: string,
  marketplaceCode: string,
  snapshotDate?: Date
): RawInventoryRow[] {
  const date = toUtcDateOnly(snapshotDate ?? new Date());
  const lines = tsvContent.trim().split("\n");

  if (lines.length < 2) {
    console.log("[inventory-report-parser] report has no data rows");
    return [];
  }

  // Parse header to get column indices (Amazon may reorder columns)
  const headerLine = lines[0].replace(/\r$/, "");
  const headers = headerLine.split("\t").map((h) => h.trim().toLowerCase());

  const colIndex = (name: string): number => {
    const idx = headers.indexOf(name);
    return idx;
  };

  const iSku = colIndex("sku");
  const iFnsku = colIndex("fnsku");
  const iAsin = colIndex("asin");
  const iAfnFulfillable = colIndex("afn-fulfillable-quantity");
  const iAfnReserved = colIndex("afn-reserved-quantity");
  const iAfnInboundWorking = colIndex("afn-inbound-working-quantity");
  const iAfnInboundShipped = colIndex("afn-inbound-shipped-quantity");
  const iAfnInboundReceiving = colIndex("afn-inbound-receiving-quantity");
  const iAfnUnsellable = colIndex("afn-unsellable-quantity");

  console.log(`[inventory-report-parser] headers: ${headers.join(", ")}`);
  console.log(`[inventory-report-parser] column indices: asin=${iAsin} fulfillable=${iAfnFulfillable} reserved=${iAfnReserved} unsellable=${iAfnUnsellable}`);

  const rows: RawInventoryRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (!line.trim()) continue;

    const cols = line.split("\t");
    const asin = iAsin >= 0 ? cols[iAsin]?.trim() : undefined;
    if (!asin) continue;

    const inboundWorking = iAfnInboundWorking >= 0 ? safeInt(cols[iAfnInboundWorking]) : 0;
    const inboundShipped = iAfnInboundShipped >= 0 ? safeInt(cols[iAfnInboundShipped]) : 0;
    const inboundReceiving = iAfnInboundReceiving >= 0 ? safeInt(cols[iAfnInboundReceiving]) : 0;

    rows.push({
      asin,
      fnSku: iFnsku >= 0 ? cols[iFnsku]?.trim() || null : null,
      sku: iSku >= 0 ? cols[iSku]?.trim() || null : null,
      marketplaceCode,
      snapshotDate: date,
      available: iAfnFulfillable >= 0 ? safeInt(cols[iAfnFulfillable]) : 0,
      reserved: iAfnReserved >= 0 ? safeInt(cols[iAfnReserved]) : 0,
      inbound: inboundWorking + inboundShipped + inboundReceiving,
      awd: 0,
      warehouse: iAfnUnsellable >= 0 ? safeInt(cols[iAfnUnsellable]) : 0,
    });
  }

  console.log(`[inventory-report-parser] parsed ${rows.length} inventory rows from ${lines.length - 1} data lines`);

  // Log first row for field name validation
  if (rows.length > 0) {
    console.log(`[inventory-report-parser] FIRST ROW: ${JSON.stringify(rows[0])}`);
  }

  return rows;
}
