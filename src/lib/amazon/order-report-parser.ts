/**
 * Order Report Parser
 *
 * Parses TSV output from the GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL
 * report into RawSaleRow[] for upsert into DailySale.
 *
 * Uses America/Los_Angeles (Pacific time) for date attribution to match
 * Sellerboard and Amazon Seller Central date boundaries.
 *
 * Skips Cancelled orders. All other statuses (Shipped, Unshipped, Pending, etc.)
 * are included because the flat file report provides real prices for all of them.
 */

import type { RawSaleRow } from "@/lib/amazon/order-payload-transformer";

// ─── Column name mappings ─────────────────────────────────────────────────────
// The report uses lowercase hyphenated column headers.

type ReportRow = Record<string, string>;

// ─── Pacific timezone date attribution ────────────────────────────────────────

/**
 * Converts an ISO date string to a UTC midnight Date representing the
 * calendar date in America/Los_Angeles.
 *
 * Example: "2026-04-07T02:30:00Z" → Pacific = Apr 6 → Date(2026-04-06T00:00:00Z)
 */
function toPacificDateOnly(isoString: string): Date {
  const pacificStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
  // en-CA gives YYYY-MM-DD
  const [y, m, d] = pacificStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseNumber(val: string | undefined): number {
  if (!val || val.trim() === "") return 0;
  const n = parseFloat(val.trim());
  return isNaN(n) ? 0 : n;
}

// ─── TSV parser ───────────────────────────────────────────────────────────────

/**
 * Parses a TSV string into an array of objects keyed by header column names.
 */
function parseTsv(tsv: string): ReportRow[] {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim());
  const rows: ReportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split("\t");
    const row: ReportRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export type ReportParseResult = {
  saleRows: RawSaleRow[];
  totalLines: number;
  skippedCancelled: number;
  latestPurchaseDate: string;
};

/**
 * Parses the flat file order report TSV into aggregated RawSaleRow[].
 *
 * Each line in the report is one order-item. We aggregate by
 * (asin, marketplaceCode, pacificDate) — same granularity as the
 * existing order-payload-transformer.
 *
 * @param tsv - Raw TSV string from the report document
 * @param marketplaceCode - Amazon marketplace ID (e.g. "ATVPDKIKX0DER")
 */
export function parseOrderReport(
  tsv: string,
  marketplaceCode: string
): ReportParseResult {
  const reportRows = parseTsv(tsv);
  const agg = new Map<string, RawSaleRow>();
  let skippedCancelled = 0;
  let latestPurchaseDate = "";

  for (const row of reportRows) {
    const orderStatus = row["order-status"] ?? "";

    // Skip cancelled orders
    if (orderStatus.toLowerCase() === "cancelled" || orderStatus.toLowerCase() === "canceled") {
      skippedCancelled++;
      continue;
    }

    const purchaseDate = row["purchase-date"] ?? "";
    const asin = row["asin"] ?? "";
    if (!asin || !purchaseDate) continue;

    const date = toPacificDateOnly(purchaseDate);
    const dateStr = dateToStr(date);
    const qty = Math.max(0, Math.round(parseNumber(row["quantity"])));
    const itemPrice = parseNumber(row["item-price"]);

    // Track latest purchase date for cursor advancement
    if (purchaseDate > latestPurchaseDate) {
      latestPurchaseDate = purchaseDate;
    }

    const key = `${asin}::${marketplaceCode}::${dateStr}`;

    if (!agg.has(key)) {
      agg.set(key, {
        asin,
        marketplaceCode,
        date,
        unitsSold: 0,
        orderCount: 0,
        grossSales: 0,
        refundCount: 0,
        refundAmount: 0,
      });
    }

    const saleRow = agg.get(key)!;
    saleRow.unitsSold += qty;
    saleRow.orderCount += 1;
    saleRow.grossSales += itemPrice;
  }

  return {
    saleRows: Array.from(agg.values()),
    totalLines: reportRows.length,
    skippedCancelled,
    latestPurchaseDate,
  };
}
