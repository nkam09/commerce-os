/**
 * Financial Event Bucket Mapper
 *
 * Maps Amazon's fee type strings onto the five DailyFee buckets:
 *   referralFee | fbaFee | storageFee | returnProcessingFee | otherFees
 *
 * This is a lookup table. Unmapped types fall into otherFees.
 *
 * TODO: This mapping must be validated against real financial event responses.
 *       Amazon's feeType strings are not fully documented and change over time.
 *       Build a validation report from the first live sync to catch unknowns.
 */

export type FeeBucket =
  | "referralFee"
  | "fbaFee"
  | "storageFee"
  | "returnProcessingFee"
  | "otherFees";

/**
 * Returns the DailyFee bucket for a given Amazon feeType or chargeType string.
 * Comparison is case-insensitive to handle API version drift.
 *
 * TODO: Validate every key in this map against live financial event data.
 */
export function mapFeeToBucket(feeType: string): FeeBucket {
  const key = feeType.toLowerCase();

  // Referral fees (Amazon's commission percentage of sale price)
  if (
    key === "commission" ||
    key === "variableclosingfee" ||
    key === "referralfee"
  ) {
    return "referralFee";
  }

  // FBA fulfillment fees (pick, pack, ship)
  if (
    key === "fbaperorderfulfillmentfee" ||
    key === "fbaperunitfulfillmentfee" ||
    key === "fbaweightbasedfee" ||
    key === "fbafulfilmentfee" || // TODO: Validate spelling live
    key === "fulfillmentfee"
  ) {
    return "fbaFee";
  }

  // Storage fees (monthly, long-term)
  if (
    key === "fbastoragefee" ||
    key === "storagefee" ||
    key === "longtermstoragefee" ||
    key === "fbalongtermstoragefee"
  ) {
    return "storageFee";
  }

  // Return processing fees
  if (
    key === "returnshipping" ||
    key === "returnprocessingfee" ||
    key === "fbareturnprocessingfee" ||
    key === "returnadminfee"
  ) {
    return "returnProcessingFee";
  }

  // Everything else: disposal, removal, label, subscription, etc.
  return "otherFees";
}

/**
 * Returns true for charge types that represent revenue (not fees).
 * Revenue charges are excluded from fee buckets.
 * TODO: Validate this exclusion list live.
 */
export function isRevenueLikeCharge(chargeType: string): boolean {
  const key = chargeType.toLowerCase();
  return (
    key === "principal" ||
    key === "tax" ||
    key === "shippingcharge" ||
    key === "shippingtax" ||
    key === "giftwrap" ||
    key === "giftwraptax"
  );
}
