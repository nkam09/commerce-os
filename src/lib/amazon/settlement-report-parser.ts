/**
 * Settlement Report Parser
 *
 * Parses TSV output from GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE
 * to extract exact refund amounts from Amazon settlement data.
 *
 * Settlement reports are Amazon's authoritative record of what was
 * actually refunded to customers — this is the same source Sellerboard uses.
 *
 * Filters for rows where:
 *   transaction-type = "Refund"
 *   amount-description = "Principal"
 *
 * This gives the exact item-price refund amount (what the customer got back),
 * matching Sellerboard's refund numbers.
 *
 * Uses America/Los_Angeles (Pacific time) for date attribution.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportRow = Record<string, string>;

export type RawSettlementRefundRow = {
  sku: string;
  marketplaceCode: string;
  date: Date;
  refundCount: number;   // count of distinct order-ids with refunds that day
  refundAmount: number;  // sum of |amount| for Principal refunds
};

export type SettlementParseResult = {
  refundRows: RawSettlementRefundRow[];
  totalLines: number;
  refundLines: number;
  skippedNoSku: number;
  settlementId: string;
};

// ─── Pacific timezone date attribution ──────────────────────────────────────

/**
 * Converts an ISO date string (or date-like string) to a UTC midnight Date
 * representing the calendar date in America/Los_Angeles.
 */
function toPacificDateOnly(dateString: string): Date {
  const pacificStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateString));
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
 * Settlement reports can use tab or comma delimiters — we detect based on
 * header content.
 */
function parseTsv(tsv: string): ReportRow[] {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Settlement reports sometimes have a header row with metadata before the
  // actual column headers. Look for the row containing "settlement-id".
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (lines[i].includes("settlement-id")) {
      headerIdx = i;
      break;
    }
  }

  const headerLine = lines[headerIdx];
  // Detect delimiter: if tabs are present, use tab; otherwise comma
  const delimiter = headerLine.includes("\t") ? "\t" : ",";

  const headers = headerLine.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: ReportRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter);
    const row: ReportRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim().replace(/^"|"$/g, "");
    }
    rows.push(row);
  }

  return rows;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parses a settlement report to extract refund data.
 *
 * Filters for transaction-type = "Refund" and amount-description = "Principal"
 * to get exact item-price refund amounts.
 *
 * Aggregates by (sku, marketplaceCode, pacificDate).
 * refundCount = count of distinct order-ids per day per SKU.
 * refundAmount = sum of |amount| for Principal refund charges.
 *
 * @param reportText - Raw TSV/CSV string from the settlement report
 * @param marketplaceCode - Amazon marketplace ID (e.g. "ATVPDKIKX0DER")
 */
export function parseSettlementReport(
  reportText: string,
  marketplaceCode: string
): SettlementParseResult {
  const reportRows = parseTsv(reportText);
  const agg = new Map<string, RawSettlementRefundRow & { orderIds: Set<string> }>();
  let refundLines = 0;
  let skippedNoSku = 0;
  let settlementId = "";

  for (const row of reportRows) {
    // Capture settlement-id from first row that has it
    if (!settlementId && row["settlement-id"]) {
      settlementId = row["settlement-id"];
    }

    const transactionType = (row["transaction-type"] ?? "").trim();
    const amountDescription = (row["price-type"] ?? "").trim().toLowerCase();

    // Only process refund rows with Principal amount
    if (transactionType !== "Refund") continue;
    if (amountDescription !== "principal") continue;

    refundLines++;

    const sku = (row["sku"] ?? "").trim();
    const postedDate = (row["posted-date"] ?? row["posted-date-time"] ?? "").trim();
    const orderId = (row["order-id"] ?? "").trim();

    if (!sku || !postedDate) {
      skippedNoSku++;
      continue;
    }

    const date = toPacificDateOnly(postedDate);
    const dateStr = dateToStr(date);
    const amount = Math.abs(parseNumber(row["price-amount"]));

    const key = `${sku}::${marketplaceCode}::${dateStr}`;

    if (!agg.has(key)) {
      agg.set(key, {
        sku,
        marketplaceCode,
        date,
        refundCount: 0,
        refundAmount: 0,
        orderIds: new Set<string>(),
      });
    }

    const refundRow = agg.get(key)!;
    refundRow.refundAmount += amount;

    // Count distinct order-ids as refund units
    if (orderId && !refundRow.orderIds.has(orderId)) {
      refundRow.orderIds.add(orderId);
      refundRow.refundCount++;
    }
  }

  // Strip orderIds set from output
  const refundRows: RawSettlementRefundRow[] = Array.from(agg.values()).map(
    ({ orderIds: _orderIds, ...rest }) => rest
  );

  return {
    refundRows,
    totalLines: reportRows.length,
    refundLines,
    skippedNoSku,
    settlementId,
  };
}
