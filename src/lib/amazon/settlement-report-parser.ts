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
  refundCount: number;          // count of distinct order-ids with refunds that day
  refundAmount: number;         // sum of |amount| for Principal refunds
  refundCommission: number;     // absolute commission retained/charged on refund (item-related-fee-type=Commission)
  refundedReferralFee: number;  // absolute referral fee credited back on refund (RefundCommission fee type)
};

/**
 * Promo (coupon/discount) row from settlement "Order" rows with a non-zero
 * promotion-amount column. Amounts stored as absolute (positive) values.
 */
export type RawSettlementPromoRow = {
  sku: string;
  marketplaceCode: string;
  date: Date;
  promoAmount: number;
};

/**
 * Reversal reimbursement row: money Amazon returns to the seller for lost/damaged
 * inventory or reversed refunds. Captured transaction types:
 *   REVERSAL_REIMBURSEMENT, WAREHOUSE_DAMAGE, WAREHOUSE_LOST, FREE_REPLACEMENT_REFUND_ITEMS
 * Amounts stored as absolute (positive) values.
 */
export type RawSettlementReimbursementRow = {
  sku: string;              // may be empty for account-level reimbursements
  marketplaceCode: string;
  date: Date;
  reimbursement: number;
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
  storageFee: number;       // Storage Fee (FBA)
  awdStorageFee: number;    // AWD Storage Fee
  disposalFee: number;      // DisposalComplete
  subscriptionFee: number;  // Subscription Fee
  otherFee: number;         // catch-all for other non-order fees
};

export type SettlementParseResult = {
  refundRows: RawSettlementRefundRow[];
  feeRows: RawSettlementFeeRow[];
  promoRows: RawSettlementPromoRow[];
  reimbursementRows: RawSettlementReimbursementRow[];
  totalLines: number;
  refundLines: number;
  feeRowLines: number;
  promoLines: number;
  reimbursementLines: number;
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
 * Identifies settlement reimbursement transaction types.
 * These represent money returned to the seller (lost/damaged inventory,
 * reversed refunds, free replacements).
 */
function isReimbursementTransaction(transactionType: string): boolean {
  const t = transactionType.trim().toUpperCase().replace(/\s+/g, "_");
  return (
    t === "REVERSAL_REIMBURSEMENT" ||
    t === "WAREHOUSE_DAMAGE" ||
    t === "WAREHOUSE_LOST" ||
    t === "FREE_REPLACEMENT_REFUND_ITEMS"
  );
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Classifies a non-refund transaction-type into a fee bucket.
 * Returns null if the row is not a settlement fee we track.
 */
function classifySettlementFee(
  transactionType: string
): "storage" | "awdStorage" | "disposal" | "subscription" | "other" | null {
  const t = transactionType.trim();
  if (t === "Storage Fee") return "storage";
  if (t === "AWD Storage Fee") return "awdStorage";
  if (t === "DisposalComplete" || t === "Disposal Complete") return "disposal";
  if (t === "Subscription Fee") return "subscription";
  // Account-level fees with no clear category — uncomment to capture as "other":
  // if (t === "other-transaction") return "other";
  return null;
}

function blankFeeRow(): Omit<RawSettlementFeeRow, "sku" | "marketplaceCode" | "date"> {
  return {
    storageFee: 0,
    awdStorageFee: 0,
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
 *    → bulk charges with no per-order attribution. Storage Fee and
 *    AWD Storage Fee are tracked separately.
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
  const feeRowAgg = new Map<string, RawSettlementFeeRow>();
  const promoAgg = new Map<string, RawSettlementPromoRow>();
  const reimbursementAgg = new Map<string, RawSettlementReimbursementRow>();
  let refundLines = 0;
  let feeRowLines = 0;
  let promoLines = 0;
  let reimbursementLines = 0;
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

      const ensureRefundRow = () => {
        if (!refundAgg.has(key)) {
          refundAgg.set(key, {
            sku,
            marketplaceCode,
            date,
            refundCount: 0,
            refundAmount: 0,
            refundCommission: 0,
            refundedReferralFee: 0,
            orderIds: new Set<string>(),
          });
        }
        return refundAgg.get(key)!;
      };

      // ── Refund Principal amounts ──
      const priceType = (row["price-type"] ?? "").trim().toLowerCase();
      if (priceType === "principal") {
        refundLines++;
        const amount = Math.abs(parseNumber(row["price-amount"]));

        const refundRow = ensureRefundRow();
        refundRow.refundAmount += amount;

        // Count distinct order-ids as refund units
        if (orderId && !refundRow.orderIds.has(orderId)) {
          refundRow.orderIds.add(orderId);
          refundRow.refundCount++;
        }
      }

      // ── Refund cost breakdown ──
      // Correct mapping (verified from raw settlement data):
      //   Commission (positive)         → refundedReferralFee
      //      This is the referral fee Amazon credits back to the seller on
      //      the refund. Already positive in the report.
      //   RefundCommission (negative)   → refundCommission (absolute value)
      //      This is Amazon's commission charge on the refund itself — a cost
      //      to the seller.
      //   ShippingChargeback            → ignored (not shown in Sellerboard)
      const feeType = (row["item-related-fee-type"] ?? "").trim();
      const feeAmountRaw = (row["item-related-fee-amount"] ?? "").trim();

      if (feeType && feeAmountRaw) {
        const feeAmount = parseNumber(feeAmountRaw);
        if (feeAmount !== 0) {
          const lowerFeeType = feeType.toLowerCase();
          if (lowerFeeType === "commission") {
            const refundRow = ensureRefundRow();
            refundRow.refundedReferralFee += feeAmount; // already positive
          } else if (lowerFeeType === "refundcommission") {
            const refundRow = ensureRefundRow();
            refundRow.refundCommission += Math.abs(feeAmount);
          }
          // ShippingChargeback and anything else: ignored
        }
      }

      continue; // refund row handled — skip settlement fee processing
    }

    // ─── Order row: capture Principal promotion-amount ────────────────
    // Only "Principal" promotion-type counts as a sales promo/discount.
    // Shipping and other promotion types are ignored to match Sellerboard.
    if (transactionType === "Order") {
      const promoType = (row["promotion-type"] ?? "").trim();
      const promoRaw = (row["promotion-amount"] ?? "").trim();
      if (promoType === "Principal" && promoRaw) {
        const promoVal = parseNumber(promoRaw);
        if (promoVal !== 0) {
          const sku = (row["sku"] ?? "").trim();
          if (!sku) {
            skippedNoSku++;
          } else {
            promoLines++;
            const date = toPacificDateOnly(postedDate);
            const dateStr = dateToStr(date);
            const key = `${sku}::${marketplaceCode}::${dateStr}`;
            if (!promoAgg.has(key)) {
              promoAgg.set(key, { sku, marketplaceCode, date, promoAmount: 0 });
            }
            promoAgg.get(key)!.promoAmount += Math.abs(promoVal);
          }
        }
      }
      continue;
    }

    // ─── Reversal reimbursement processing ─────────────────────────────
    if (isReimbursementTransaction(transactionType)) {
      // Reimbursements typically use other-amount; fall back to price-amount
      const amountRaw =
        (row["other-amount"] ?? "").trim() || (row["price-amount"] ?? "").trim();
      if (!amountRaw) continue;
      const rawAmount = parseNumber(amountRaw);
      if (rawAmount === 0) continue;

      reimbursementLines++;
      const amount = Math.abs(rawAmount);
      const sku = (row["sku"] ?? "").trim(); // may be empty for account-level
      const date = toPacificDateOnly(postedDate);
      const dateStr = dateToStr(date);
      const key = `${sku}::${marketplaceCode}::${dateStr}`;
      if (!reimbursementAgg.has(key)) {
        reimbursementAgg.set(key, { sku, marketplaceCode, date, reimbursement: 0 });
      }
      reimbursementAgg.get(key)!.reimbursement += amount;
      continue;
    }

    // ─── Non-refund settlement fee processing ──────────────────────────
    const bucket = classifySettlementFee(transactionType);
    if (!bucket) continue;

    // Settlement fees store their amount in other-amount (not price-amount)
    const otherFeeAmountRaw = (row["other-amount"] ?? "").trim();
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
    } else if (bucket === "awdStorage") {
      feeRow.awdStorageFee += amount;
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

  const feeRows: RawSettlementFeeRow[] = Array.from(feeRowAgg.values());
  const promoRows: RawSettlementPromoRow[] = Array.from(promoAgg.values());
  const reimbursementRows: RawSettlementReimbursementRow[] = Array.from(
    reimbursementAgg.values()
  );

  return {
    refundRows,
    feeRows,
    promoRows,
    reimbursementRows,
    totalLines: reportRows.length,
    refundLines,
    feeRowLines,
    promoLines,
    reimbursementLines,
    skippedNoSku,
    settlementId,
  };
}
