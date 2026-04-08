/**
 * Return Report Parser
 *
 * Parses TSV output from the GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA
 * report into RawReturnRow[] for upsert into DailySale.refundCount/refundAmount.
 *
 * Uses America/Los_Angeles (Pacific time) for date attribution to match
 * Sellerboard and Amazon Seller Central date boundaries.
 *
 * The return report does NOT include refund amounts — only quantities.
 * Amounts are estimated later in the sync job using historical unit prices.
 *
 * Columns of interest:
 *   return-date, order-id, sku, asin, quantity, fulfillment-center-id,
 *   detailed-disposition, reason, status, license-plate-number, customer-comments
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportRow = Record<string, string>;

export type RawReturnRow = {
  asin: string;
  sku: string;
  marketplaceCode: string;
  date: Date;
  refundCount: number;
  refundAmount: number; // always 0 from this report — estimated later
};

export type ReturnParseResult = {
  returnRows: RawReturnRow[];
  totalLines: number;
  skippedNoAsin: number;
  latestReturnDate: string;
};

// ─── Pacific timezone date attribution ──────────────────────────────────────

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

// ─── TSV parser ──────────────────────────────────────────────────────────────

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

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parses the FBA customer returns report TSV into aggregated RawReturnRow[].
 *
 * Each line in the report is one return item. We aggregate by
 * (asin, marketplaceCode, pacificDate) — same granularity as DailySale.
 *
 * @param tsv - Raw TSV string from the report document
 * @param marketplaceCode - Amazon marketplace ID (e.g. "ATVPDKIKX0DER")
 */
export function parseReturnReport(
  tsv: string,
  marketplaceCode: string
): ReturnParseResult {
  const reportRows = parseTsv(tsv);
  const agg = new Map<string, RawReturnRow>();
  let skippedNoAsin = 0;
  let latestReturnDate = "";

  for (const row of reportRows) {
    const returnDate = row["return-date"] ?? "";
    const asin = row["asin"] ?? "";
    const sku = row["sku"] ?? "";
    if (!asin || !returnDate) {
      skippedNoAsin++;
      continue;
    }

    const date = toPacificDateOnly(returnDate);
    const dateStr = dateToStr(date);
    const qty = Math.max(0, Math.round(parseNumber(row["quantity"])));

    // Track latest return date for cursor advancement
    if (returnDate > latestReturnDate) {
      latestReturnDate = returnDate;
    }

    const key = `${asin}::${marketplaceCode}::${dateStr}`;

    if (!agg.has(key)) {
      agg.set(key, {
        asin,
        sku,
        marketplaceCode,
        date,
        refundCount: 0,
        refundAmount: 0, // will be estimated in sync job
      });
    }

    const returnRow = agg.get(key)!;
    returnRow.refundCount += qty;
  }

  return {
    returnRows: Array.from(agg.values()),
    totalLines: reportRows.length,
    skippedNoAsin,
    latestReturnDate,
  };
}
