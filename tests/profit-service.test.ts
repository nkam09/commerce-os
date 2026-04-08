/**
 * Profit Service Tests
 *
 * Tests the fee bucket mapper and the core profit arithmetic used by the
 * overview and product drawer.
 *
 * There is no standalone profit-service yet; these tests cover the pure
 * functions that will feed it:
 *   - mapFeeToBucket / isRevenueLikeCharge (from financial-event-bucket-mapper)
 *   - netRevenue     (inline pure helper, tested here before extraction)
 *   - grossMarginPct (inline pure helper, tested here before extraction)
 *   - netProfitPct   (inline pure helper, tested here before extraction)
 */

import { describe, it, expect } from "vitest";
import {
  mapFeeToBucket,
  isRevenueLikeCharge,
} from "@/lib/amazon/financial-event-bucket-mapper";

// ─── Net revenue arithmetic ───────────────────────────────────────────────────
// These helpers will live in a profit-service module.
// Defined inline here until that service is extracted.

type FeeBreakdown = {
  referralFee: number;
  fbaFee: number;
  storageFee: number;
  returnProcessingFee: number;
  otherFees: number;
};

type SaleBreakdown = {
  grossSales: number;
  refundAmount: number;
  cogs: number; // landed COGS per unit × units sold
  adSpend: number;
};

function totalFees(fees: FeeBreakdown): number {
  return (
    fees.referralFee +
    fees.fbaFee +
    fees.storageFee +
    fees.returnProcessingFee +
    fees.otherFees
  );
}

function netRevenue(sale: SaleBreakdown, fees: FeeBreakdown): number {
  return sale.grossSales - sale.refundAmount - totalFees(fees) - sale.cogs - sale.adSpend;
}

function grossMarginPct(grossSales: number, cogs: number): number | null {
  if (grossSales === 0) return null;
  return (grossSales - cogs) / grossSales;
}

function netProfitPct(grossSales: number, net: number): number | null {
  if (grossSales === 0) return null;
  return net / grossSales;
}

// ─── Bucket mapper coverage ───────────────────────────────────────────────────

describe("mapFeeToBucket — full coverage", () => {
  const referralCases = ["Commission", "VariableClosingFee", "ReferralFee"];
  const fbaCases = [
    "FBAPerOrderFulfillmentFee",
    "FBAPerUnitFulfillmentFee",
    "FBAWeightBasedFee",
    "FulfillmentFee",
  ];
  const storageCases = [
    "FBAStorageFee",
    "StorageFee",
    "LongTermStorageFee",
    "FBALongTermStorageFee",
  ];
  const returnCases = [
    "ReturnShipping",
    "ReturnProcessingFee",
    "FBAReturnProcessingFee",
    "ReturnAdminFee",
  ];
  const otherCases = [
    "DisposalFee",
    "RemovalFee",
    "LabelingFee",
    "FBAInboundTransportationFee",
    "SubscriptionFee",
    "UnknownFutureAmazonFee",
  ];

  for (const f of referralCases) {
    it(`maps "${f}" → referralFee`, () => {
      expect(mapFeeToBucket(f)).toBe("referralFee");
    });
  }

  for (const f of fbaCases) {
    it(`maps "${f}" → fbaFee`, () => {
      expect(mapFeeToBucket(f)).toBe("fbaFee");
    });
  }

  for (const f of storageCases) {
    it(`maps "${f}" → storageFee`, () => {
      expect(mapFeeToBucket(f)).toBe("storageFee");
    });
  }

  for (const f of returnCases) {
    it(`maps "${f}" → returnProcessingFee`, () => {
      expect(mapFeeToBucket(f)).toBe("returnProcessingFee");
    });
  }

  for (const f of otherCases) {
    it(`maps "${f}" → otherFees`, () => {
      expect(mapFeeToBucket(f)).toBe("otherFees");
    });
  }
});

describe("isRevenueLikeCharge — full coverage", () => {
  const revenueCases = [
    "Principal",
    "Tax",
    "ShippingCharge",
    "ShippingTax",
    "GiftWrap",
    "GiftWrapTax",
  ];
  const feeCases = ["Commission", "FBAPerUnitFulfillmentFee", "FBAStorageFee"];

  for (const c of revenueCases) {
    it(`identifies "${c}" as revenue-like`, () => {
      expect(isRevenueLikeCharge(c)).toBe(true);
    });
  }

  for (const c of feeCases) {
    it(`identifies "${c}" as NOT revenue-like`, () => {
      expect(isRevenueLikeCharge(c)).toBe(false);
    });
  }
});

// ─── Net revenue math ─────────────────────────────────────────────────────────

describe("netRevenue", () => {
  const fees: FeeBreakdown = {
    referralFee: 4.50,
    fbaFee: 3.22,
    storageFee: 0.15,
    returnProcessingFee: 0,
    otherFees: 0,
  };

  it("subtracts fees, refunds, COGS, and ad spend from grossSales", () => {
    const sale: SaleBreakdown = {
      grossSales: 29.99,
      refundAmount: 0,
      cogs: 8.00,
      adSpend: 1.50,
    };
    // 29.99 - 0 - (4.50 + 3.22 + 0.15) - 8.00 - 1.50 = 12.62
    expect(netRevenue(sale, fees)).toBeCloseTo(12.62);
  });

  it("deducts refundAmount from grossSales", () => {
    const sale: SaleBreakdown = {
      grossSales: 29.99,
      refundAmount: 29.99,
      cogs: 8.00,
      adSpend: 0,
    };
    expect(netRevenue(sale, fees)).toBeCloseTo(-15.87); // fees + COGS still apply
  });

  it("returns negative when fees exceed revenue", () => {
    const sale: SaleBreakdown = {
      grossSales: 5.00,
      refundAmount: 0,
      cogs: 8.00,
      adSpend: 2.00,
    };
    expect(netRevenue(sale, fees)).toBeLessThan(0);
  });

  it("returns grossSales when all fees and costs are zero", () => {
    const zeroFees: FeeBreakdown = {
      referralFee: 0,
      fbaFee: 0,
      storageFee: 0,
      returnProcessingFee: 0,
      otherFees: 0,
    };
    const sale: SaleBreakdown = {
      grossSales: 100,
      refundAmount: 0,
      cogs: 0,
      adSpend: 0,
    };
    expect(netRevenue(sale, zeroFees)).toBe(100);
  });
});

// ─── Gross margin and net profit % ───────────────────────────────────────────

describe("grossMarginPct", () => {
  it("computes (grossSales - cogs) / grossSales", () => {
    expect(grossMarginPct(100, 30)).toBeCloseTo(0.70);
  });

  it("returns 1.0 when COGS is 0", () => {
    expect(grossMarginPct(100, 0)).toBeCloseTo(1.0);
  });

  it("returns null when grossSales is 0", () => {
    expect(grossMarginPct(0, 30)).toBeNull();
  });

  it("returns negative when COGS exceeds grossSales", () => {
    expect(grossMarginPct(50, 80)).toBeCloseTo(-0.60);
  });
});

describe("netProfitPct", () => {
  it("computes net / grossSales", () => {
    expect(netProfitPct(100, 20)).toBeCloseTo(0.20);
  });

  it("returns null when grossSales is 0", () => {
    expect(netProfitPct(0, 20)).toBeNull();
  });

  it("returns negative for a loss", () => {
    expect(netProfitPct(100, -10)).toBeCloseTo(-0.10);
  });
});
