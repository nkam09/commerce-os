/**
 * Settlement Report Parser
 *
 * Parses TSV output from GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE
 * to extract exact refund amounts from Amazon settlement data.
 *
 * Settlement reports are Amazon's authoritative record of what was
 * actually refunded to customers — this is the same source Sellerboard uses.
 *
 * Extracts two things from refund rows (transaction-type = "Refund"):
 *   1. Refund amounts: price-type = "Principal" → exact item-price refund
 *   2. Fee adjustments: item-related-fee-type → fee credits Amazon gives back
 *
 * Refund amounts match Sellerboard's refund numbers.
 * Fee adjustments reduce the fees in daily_fees (referral fee credits, FBA fee credits).
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

export type RawSettlementFeeAdjustment = {
  sku: string;
  marketplaceCode: string;
  date: Date;
  referralFeeAdj: number;  // positive = credit back to seller
  fbaFeeAdj: number;
  otherFeeAdj: number;
};

/**
 * Non-order settlement fees (storage, disposal, subscription, etc.)
 * These come as bulk charges from settlement reports with no per-order attribution.
 *
 * Amounts stored as positive values (the deduction amount).
 * sku may be empty for account-level fees (storage, subscription).
 */
export type RawSettlementFeeRow = {
  sku: string;              // may be empty for account-level fees
  marketplaceCode: string;
  date: Date;
  storageFee: number;       // Storage Fee + AWD Storage Fee
  disposalFee: number;      // DisposalComplete
  subscriptionFee: number;  // Subscription Fee
  otherFee: number;         // catch-all for other non-order fees
};

export type SettlementParseResult = {
  refundRows: RawSettlementRefundRow[];
  feeAdjustments: RawSettlementFeeAdjustment[];
  feeRows: RawSettlementFeeRow[];
  totalLines: number;
  refundLines: number;
  feeAdjLines: number;
  feeRowLines: number;
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

// ─── Fee type mapping ────────────────────────────────────────────────────────

function mapFeeType(feeType: string): "referral" | "fba" | "other" {
  const lower = feeType.toLowerCase();
  if (lower === "commission") return "referral";
  if (lower === "fbaperunitfulfillmentfee" || lower === "fbaperorderfulfillmentfee") return "fba";
  return "other";
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Classifies a non-refund transaction-type into a fee bucket.
 * Returns null if the row is not a settlement fee we track.
 */
function classifySettlementFee(
  transactionType: string
): "storage" | "disposal" | "subscription" | "other" | null {
  const t = transactionType.trim();
  if (t === "Storage Fee" || t === "AWD Storage Fee") return "storage";
  if (t === "DisposalComplete" || t === "Disposal Complete") return "disposal";
  if (t === "Subscription Fee") return "subscription";
  // Account-level fees with no clear category — uncomment to capture as "other":
  // if (t === "other-transaction") return "other";
  return null;
}

function blankFeeRow(): Omit<RawSettlementFeeRow, "sku" | "marketplaceCode" | "date"> {
  return {
    storageFee: 0,
    disposalFee: 0,
    subscriptionFee: 0,
    otherFee: 0,
  };
}

/**
 * Parses a settlement report to extract refund data, fee adjustments,
 * and non-order settlement fees (storage, disposal, subscription).
 *
 * 1. Refund amounts: transaction-type="Refund" + price-type="Principal"
 *    → exact item-price refund amounts. Aggregated by (sku, marketplace, date).
 *
 * 2. Fee adjustments: transaction-type="Refund" + item-related-fee-type present
 *    → fee credits Amazon gives back on refunds (referral fee, FBA fee, etc.)
 *    Aggregated by (sku, marketplace, date). Amounts stored as-is (signed).
 *
 * 3. Settlement fees: transaction-type in {Storage Fee, AWD Storage Fee,
 *    DisposalComplete, Subscription Fee}
 *    → bulk charges with no per-order attribution.
 *    Aggregated by (sku, marketplace, date). sku may be empty for account-level fees.
 *    Amounts stored as positive values (absolute).
 *
 * @param reportText - Raw TSV/CSV string from the settlement report
 * @param marketplaceCode - Amazon marketplace ID (e.g. "ATVPDKIKX0DER")
 */
export function parseSettlementReport(
  reportText: string,
  marketplaceCode: string
): SettlementParseResult {
  const reportRows = parseTsv(reportText);
  const refundAgg = new Map<string, RawSettlementRefundRow & { orderIds: Set<string> }>();
  const feeAdjAgg = new Map<string, RawSettlementFeeAdjustment>();
  const feeRowAgg = new Map<string, RawSettlementFeeRow>();
  let refundLines = 0;
  let feeAdjLines = 0;
  let feeRowLines = 0;
  let skippedNoSku = 0;
  let settlementId = "";

  for (const row of reportRows) {
    // Capture settlement-id from first row that has it
    if (!settlementId && row["settlement-id"]) {
      settlementId = row["settlement-id"];
    }

    const transactionType = (row["transaction-type"] ?? "").trim();
    const postedDate = (row["posted-date"] ?? row["posted-date-time"] ?? "").trim();
    if (!postedDate) continue;

    // ─── Refund row processing ─────────────────────────────────────────
    if (transactionType === "Refund") {
      const sku = (row["sku"] ?? "").trim();
      const orderId = (row["order-id"] ?? "").trim();

      if (!sku) {
        skippedNoSku++;
        continue;
      }

      const date = toPacificDateOnly(postedDate);
      const dateStr = dateToStr(date);
      const key = `${sku}::${marketplaceCode}::${dateStr}`;

      // ── Refund Principal amounts ──
      const priceType = (row["price-type"] ?? "").trim().toLowerCase();
      if (priceType === "principal") {
        refundLines++;
        const amount = Math.abs(parseNumber(row["price-amount"]));

        if (!refundAgg.has(key)) {
          refundAgg.set(key, {
            sku,
            marketplaceCode,
            date,
            refundCount: 0,
            refundAmount: 0,
            orderIds: new Set<string>(),
          });
        }

        const refundRow = refundAgg.get(key)!;
        refundRow.refundAmount += amount;

        // Count distinct order-ids as refund units
        if (orderId && !refundRow.orderIds.has(orderId)) {
          refundRow.orderIds.add(orderId);
          refundRow.refundCount++;
        }
      }

      // ── Fee adjustments (credits Amazon gives back on refunds) ──
      const feeType = (row["item-related-fee-type"] ?? "").trim();
      const feeAmountRaw = (row["item-related-fee-amount"] ?? "").trim();

      if (feeType && feeAmountRaw) {
        const feeAmount = parseNumber(feeAmountRaw);
        if (feeAmount !== 0) {
          feeAdjLines++;

          if (!feeAdjAgg.has(key)) {
            feeAdjAgg.set(key, {
              sku,
              marketplaceCode,
              date,
              referralFeeAdj: 0,
              fbaFeeAdj: 0,
              otherFeeAdj: 0,
            });
          }

          const adjRow = feeAdjAgg.get(key)!;
          const bucket = mapFeeType(feeType);
          if (bucket === "referral") {
            adjRow.referralFeeAdj += feeAmount;
          } else if (bucket === "fba") {
            adjRow.fbaFeeAdj += feeAmount;
          } else {
            adjRow.otherFeeAdj += feeAmount;
          }
        }
      }

      continue; // refund row handled — skip settlement fee processing
    }

    // ─── Non-refund settlement fee processing ──────────────────────────
    const bucket = classifySettlementFee(transactionType);
    if (!bucket) continue;

    // Settlement fees store their amount in other-fee-amount (not price-amount)
    const otherFeeAmountRaw = (row["other-fee-amount"] ?? "").trim();
    if (!otherFeeAmountRaw) continue;

    const rawAmount = parseNumber(otherFeeAmountRaw);
    if (rawAmount === 0) continue;

    feeRowLines++;

    // Settlement fees are charges — store as absolute (positive) values
    const amount = Math.abs(rawAmount);
    const sku = (row["sku"] ?? "").trim(); // may be empty for account-level fees
    const date = toPacificDateOnly(postedDate);
    const dateStr = dateToStr(date);
    const key = `${sku}::${marketplaceCode}::${dateStr}`;

    if (!feeRowAgg.has(key)) {
      feeRowAgg.set(key, {
        sku,
        marketplaceCode,
        date,
        ...blankFeeRow(),
      });
    }

    const feeRow = feeRowAgg.get(key)!;
    if (bucket === "storage") {
      feeRow.storageFee += amount;
    } else if (bucket === "disposal") {
      feeRow.disposalFee += amount;
    } else if (bucket === "subscription") {
      feeRow.subscriptionFee += amount;
    } else {
      feeRow.otherFee += amount;
    }
  }

  // Strip orderIds set from refund output
  const refundRows: RawSettlementRefundRow[] = Array.from(refundAgg.values()).map(
    ({ orderIds: _orderIds, ...rest }) => rest
  );

  const feeAdjustments: RawSettlementFeeAdjustment[] = Array.from(feeAdjAgg.values());
  const feeRows: RawSettlementFeeRow[] = Array.from(feeRowAgg.values());

  return {
    refundRows,
    feeAdjustments,
    feeRows,
    totalLines: reportRows.length,
    refundLines,
    feeAdjLines,
    feeRowLines,
    skippedNoSku,
    settlementId,
  };
}
