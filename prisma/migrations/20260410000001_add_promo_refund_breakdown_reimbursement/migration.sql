-- DailySale: promo + refund cost breakdown
ALTER TABLE "daily_sales" ADD COLUMN IF NOT EXISTS "promoAmount" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "daily_sales" ADD COLUMN IF NOT EXISTS "refundCommission" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "daily_sales" ADD COLUMN IF NOT EXISTS "refundedReferralFee" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- DailyFee: reversal reimbursement
ALTER TABLE "daily_fees" ADD COLUMN IF NOT EXISTS "reimbursement" DECIMAL(14,4) NOT NULL DEFAULT 0;
