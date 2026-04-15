"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils/formatters";
import type { PeriodMetrics } from "@/lib/services/dashboard-tiles-service";

// ─── Header band colors per period ──────────────────────────────────────────

const HEADER_COLORS: Record<string, string> = {
  today: "bg-blue-600",
  yesterday: "bg-slate-600",
  mtd: "bg-blue-600",
  forecast: "bg-amber-600",
  last_month: "bg-orange-600",
};

// ─── % change helpers ───────────────────────────────────────────────────────

/** Metrics where LOWER values = improvement (green) */
const LOWER_IS_BETTER = new Set([
  "acos",
  "tacos",
  "adSpend",
  "refundCount",
  "refundAmount",
  "promoAmount",
  "indirectExpenses",
]);

/** Compute % change, returns null if base is 0 or missing */
function pctChange(current: number | null | undefined, base: number | null | undefined): number | null {
  if (current == null || base == null || base === 0) return null;
  return (current - base) / base;
}

type ChangeBadgeProps = {
  current: number | null | undefined;
  base: number | null | undefined;
  metricKey: string;
};

function ChangeBadge({ current, base, metricKey }: ChangeBadgeProps) {
  const change = pctChange(current, base);
  if (change == null) return null;

  const isLowerBetter = LOWER_IS_BETTER.has(metricKey);
  const isImproving = isLowerBetter ? change < 0 : change > 0;

  return (
    <span
      className={cn(
        "text-2xs font-semibold px-1 py-0.5 rounded whitespace-nowrap",
        isImproving
          ? "text-green-400 bg-green-500/10"
          : "text-red-400 bg-red-500/10"
      )}
    >
      {change >= 0 ? "+" : ""}
      {(change * 100).toFixed(1)}%
    </span>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

type PeriodSummaryCardProps = {
  period: PeriodMetrics;
  /** Comparison period for computing % change badges (e.g. last_month for MTD) */
  comparisonPeriod?: PeriodMetrics | null;
  className?: string;
};

export function PeriodSummaryCard({ period, comparisonPeriod, className }: PeriodSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const profitColor = period.netProfit >= 0 ? "text-success" : "text-danger";
  const grossProfitColor = period.grossProfit >= 0 ? "text-success" : "text-danger";

  const headerBg = HEADER_COLORS[period.periodKey] ?? "bg-slate-600";

  // Estimate payout: net revenue minus fees (simplified)
  const estPayout = period.netRevenue - period.totalFees;

  // Shorthand for comparison — only render badges when a comparison period exists
  const cp = comparisonPeriod ?? null;
  const cpEstPayout = cp ? cp.netRevenue - cp.totalFees : null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card flex flex-col overflow-hidden",
        className
      )}
    >
      {/* ── Colored header band ─────────────────────── */}
      <div className={cn("px-3 py-2 md:px-4 md:py-2.5", headerBg)}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-white">
            {period.label}
          </h3>
          {period.isForecast && (
            <span className="text-2xs font-semibold text-white/80 bg-white/20 px-1.5 py-0.5 rounded">
              Forecast
            </span>
          )}
        </div>
        <p className="text-2xs text-white/70 mt-0.5">
          {formatDateRange(period.dateRange.from, period.dateRange.to)}
        </p>
      </div>

      {/* ── Card body ───────────────────────────────── */}
      <div className="px-3 py-2.5 md:px-4 md:py-3 space-y-1.5 min-w-0">
        {/* Hero metric: Gross Sales */}
        <div>
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className="text-2xs text-muted-foreground">Sales</span>
            {cp && <ChangeBadge current={period.grossSales} base={cp.grossSales} metricKey="grossSales" />}
          </div>
          <p className="text-xl md:text-2xl font-bold text-foreground tabular-nums mt-0.5">
            {formatCurrency(period.grossSales)}
          </p>
        </div>

        {/* Orders / Units on one line */}
        <MetricRow
          label="Orders / Units"
          value={`${formatNumber(period.orderCount)} / ${formatNumber(period.unitsSold)}`}
          badge={cp && (
            <ChangeBadge current={period.orderCount} base={cp.orderCount} metricKey="orderCount" />
          )}
        />

        {/* Refunds */}
        <MetricRow
          label="Refunds"
          value={
            period.refundCount > 0
              ? `${formatNumber(period.refundCount)} (-${formatCurrency(period.refunds)})`
              : "$0.00"
          }
          valueClassName={period.refundCount > 0 ? "text-warning" : undefined}
          badge={cp && (
            <ChangeBadge current={period.refundCount} base={cp.refundCount} metricKey="refundCount" />
          )}
        />

        {/* Promo */}
        {period.promoAmount > 0 && (
          <MetricRow
            label="Promo"
            value={`-${formatCurrency(period.promoAmount)}`}
            valueClassName="text-warning"
            badge={cp && (
              <ChangeBadge current={period.promoAmount} base={cp.promoAmount} metricKey="promoAmount" />
            )}
          />
        )}

        {/* Ad cost */}
        <MetricRow
          label="Adv cost"
          value={formatCurrency(period.adSpend)}
          badge={cp && <ChangeBadge current={period.adSpend} base={cp.adSpend} metricKey="adSpend" />}
        />

        {/* Est payout */}
        <MetricRow
          label="Est. payout"
          value={formatCurrency(estPayout)}
          badge={cp && (
            <ChangeBadge current={estPayout} base={cpEstPayout} metricKey="estimatedPayout" />
          )}
        />

        {/* Gross Profit */}
        <MetricRow
          label="Gross profit"
          value={formatCurrency(period.grossProfit)}
          valueClassName={grossProfitColor}
          badge={cp && <ChangeBadge current={period.grossProfit} base={cp.grossProfit} metricKey="grossProfit" />}
        />

        {/* Indirect Expenses */}
        {period.indirectExpenseTotal > 0 && (
          <MetricRow
            label="Indirect expenses"
            value={`-${formatCurrency(period.indirectExpenseTotal)}`}
            valueClassName="text-danger"
            badge={cp && (
              <ChangeBadge
                current={period.indirectExpenseTotal}
                base={cp.indirectExpenseTotal}
                metricKey="indirectExpenses"
              />
            )}
          />
        )}

        {/* Net Profit — bold, emphasized */}
        <MetricRow
          label="Net profit"
          value={formatCurrency(period.netProfit)}
          valueClassName={profitColor}
          bold
          badge={cp && <ChangeBadge current={period.netProfit} base={cp.netProfit} metricKey="netProfit" />}
        />

        {/* Key Ratios divider */}
        <div className="border-t border-border pt-1.5 mt-1.5">
          <MetricRow
            label="Margin"
            value={period.netMarginPct !== null ? formatPercent(period.netMarginPct) : "\u2014"}
            valueClassName={
              period.netMarginPct !== null
                ? period.netMarginPct >= 0.2 ? "text-success"
                : period.netMarginPct >= 0 ? "text-foreground"
                : "text-danger"
                : undefined
            }
            badge={cp && <ChangeBadge current={period.netMarginPct} base={cp.netMarginPct} metricKey="netMarginPct" />}
          />
          <MetricRow
            label="ACOS"
            value={period.acos !== null ? formatPercent(period.acos) : "\u2014"}
            valueClassName={
              period.acos !== null
                ? period.acos <= 0.2 ? "text-success" : period.acos <= 0.35 ? "text-warning" : "text-danger"
                : undefined
            }
            badge={cp && <ChangeBadge current={period.acos} base={cp.acos} metricKey="acos" />}
          />
          <MetricRow
            label="TACOS"
            value={period.tacos !== null ? formatPercent(period.tacos) : "\u2014"}
            valueClassName={
              period.tacos !== null
                ? period.tacos <= 0.1 ? "text-success" : period.tacos <= 0.15 ? "text-warning" : "text-danger"
                : undefined
            }
            badge={cp && <ChangeBadge current={period.tacos} base={cp.tacos} metricKey="tacos" />}
          />
          <MetricRow
            label="ROAS"
            value={period.roas !== null ? `${period.roas}x` : "\u2014"}
            badge={cp && <ChangeBadge current={period.roas} base={cp.roas} metricKey="roas" />}
          />
        </div>
      </div>

      {/* ── More / Breakdown toggle ─────────────────── */}
      <div className="mt-auto">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2 border-t border-border text-2xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated/50 transition"
        >
          {expanded ? "Less" : "More"}
          <svg
            viewBox="0 0 12 12"
            fill="currentColor"
            className={cn("h-2.5 w-2.5 transition-transform", expanded && "rotate-180")}
          >
            <path d="M3.22 4.72a.75.75 0 0 1 1.06 0L6 6.44l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0L3.22 5.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>

        {expanded && (
          <div className="border-t border-border px-3 md:px-4 py-3 animate-fade-in space-y-3">
            {/* Sales breakdown */}
            <BreakdownSection title="Sales Breakdown">
              <MetricRow label="Gross Sales" value={formatCurrency(period.grossSales)} small />
              <MetricRow label="  Organic Sales" value={formatCurrency(period.grossSales - period.adSales)} small valueClassName="text-muted-foreground" />
              <MetricRow label="  Sponsored Sales" value={formatCurrency(period.adSales)} small valueClassName="text-muted-foreground" />
              <MetricRow
                label="Refunds"
                value={
                  period.refundCount > 0
                    ? `${formatNumber(period.refundCount)} units (-${formatCurrency(period.refunds)})`
                    : `-${formatCurrency(period.refunds)}`
                }
                valueClassName="text-danger"
                small
              />
              <MetricRow label="Promo" value={`-${formatCurrency(period.promoAmount)}`} valueClassName="text-danger" small />
              <MetricRow label="Reimbursements" value={formatCurrency(period.reimbursements)} valueClassName={period.reimbursements > 0 ? "text-success" : undefined} small />
              <MetricRow label="Net Revenue" value={formatCurrency(period.netRevenue)} bold small />
            </BreakdownSection>

            {/* Refund Cost breakdown */}
            {(period.refunds > 0 || period.refundCommission > 0 || period.refundedReferralFee > 0) && (
              <BreakdownSection title="Refund Cost">
                <MetricRow label="Refunded Amount" value={`-${formatCurrency(period.refunds)}`} valueClassName="text-danger" small />
                <MetricRow label="Refund Commission" value={`-${formatCurrency(period.refundCommission)}`} valueClassName="text-danger" small />
                <MetricRow label="Refunded Referral Fee" value={formatCurrency(period.refundedReferralFee)} valueClassName={period.refundedReferralFee > 0 ? "text-success" : undefined} small />
                <MetricRow
                  label="Total Refund Cost"
                  value={`-${formatCurrency(period.refunds + period.refundCommission - period.refundedReferralFee)}`}
                  valueClassName="text-danger"
                  bold
                  small
                />
              </BreakdownSection>
            )}

            {/* Units breakdown */}
            <BreakdownSection title="Units">
              <MetricRow label="Units Sold" value={formatNumber(period.unitsSold)} small />
              <MetricRow label="Orders" value={formatNumber(period.orderCount)} small />
            </BreakdownSection>

            {/* Advertising cost */}
            <BreakdownSection title="Advertising Cost">
              <MetricRow label="Ad Spend (total)" value={`-${formatCurrency(period.adSpend)}`} valueClassName="text-danger" small />
              <MetricRow label="Ad Sales" value={formatCurrency(period.adSales)} small />
              <MetricRow label="ACOS" value={period.acos !== null ? formatPercent(period.acos) : "\u2014"} small />
              <MetricRow label="ROAS" value={period.roas !== null ? `${period.roas}x` : "\u2014"} small />
              <MetricRow label="TACOS" value={period.tacos !== null ? formatPercent(period.tacos) : "\u2014"} small />
              <MetricRow label="Impressions" value={formatNumber(period.adImpressions)} small />
              <MetricRow label="Clicks" value={formatNumber(period.adClicks)} small />
              <MetricRow label="CPC" value={period.cpc !== null ? formatCurrency(period.cpc) : "\u2014"} small />
              <MetricRow label="CTR" value={period.ctr !== null ? formatPercent(period.ctr) : "\u2014"} small />
            </BreakdownSection>

            {/* Amazon fees */}
            <BreakdownSection title="Amazon Fees">
              <MetricRow label="Referral Fees" value={`-${formatCurrency(period.referralFees)}`} valueClassName="text-danger" small />
              <MetricRow label="FBA Fees" value={`-${formatCurrency(period.fbaFees)}`} valueClassName="text-danger" small />
              <MetricRow label="FBA Storage Fees" value={`-${formatCurrency(period.storageFees)}`} valueClassName="text-danger" small />
              <MetricRow label="AWD Storage Fees" value={`-${formatCurrency(period.awdStorageFees)}`} valueClassName="text-danger" small />
              <MetricRow label="Return Processing" value={`-${formatCurrency(period.returnProcessingFees)}`} valueClassName="text-danger" small />
              <MetricRow label="Other Fees" value={`-${formatCurrency(period.otherFees)}`} valueClassName="text-danger" small />
              {period.reversalReimbursement > 0 && (
                <MetricRow
                  label="Reversal Reimbursement"
                  value={`+${formatCurrency(period.reversalReimbursement)}`}
                  valueClassName="text-success"
                  small
                />
              )}
              <MetricRow label="Total Fees" value={`-${formatCurrency(period.totalFees)}`} valueClassName="text-danger" bold small />
            </BreakdownSection>

            {/* COGS */}
            <BreakdownSection title="Cost of Goods Sold">
              <MetricRow label="Landed COGS" value={`-${formatCurrency(period.totalCogs)}`} valueClassName="text-danger" small />
            </BreakdownSection>

            {/* Gross profit */}
            <BreakdownSection title="Gross Profit">
              <MetricRow label="Gross Profit" value={formatCurrency(period.grossProfit)} valueClassName={period.grossProfit >= 0 ? "text-success" : "text-danger"} bold small />
              <MetricRow label="Gross Margin" value={period.grossMarginPct !== null ? formatPercent(period.grossMarginPct) : "\u2014"} small />
            </BreakdownSection>

            {/* Indirect Expenses */}
            {period.indirectExpenses && period.indirectExpenses.length > 0 && (
              <BreakdownSection title="Indirect Expenses">
                {period.indirectExpenses.map((exp, i) => (
                  <MetricRow key={i} label={exp.name} value={`-${formatCurrency(exp.amount)}`} valueClassName="text-danger" small />
                ))}
                <MetricRow label="Total Indirect" value={`-${formatCurrency(period.indirectExpenseTotal)}`} valueClassName="text-danger" bold small />
              </BreakdownSection>
            )}

            {/* Net profit */}
            <BreakdownSection title="Net Profit">
              <MetricRow label="Gross Profit" value={formatCurrency(period.grossProfit)} small />
              <MetricRow label="Ad Spend" value={`-${formatCurrency(period.adSpend)}`} valueClassName="text-danger" small />
              {period.indirectExpenseTotal > 0 && (
                <MetricRow label="Indirect Expenses" value={`-${formatCurrency(period.indirectExpenseTotal)}`} valueClassName="text-danger" small />
              )}
              <MetricRow label="Net Profit" value={formatCurrency(period.netProfit)} valueClassName={period.netProfit >= 0 ? "text-success" : "text-danger"} bold small />
              <MetricRow label="Net Margin" value={period.netMarginPct !== null ? formatPercent(period.netMarginPct) : "\u2014"} small />
              <MetricRow label="Profit / Unit" value={period.profitPerUnit !== null ? formatCurrency(period.profitPerUnit) : "\u2014"} small />
            </BreakdownSection>

            {/* Est payout */}
            <BreakdownSection title="Estimated Payout">
              <MetricRow label="Est. Payout" value={formatCurrency(estPayout)} bold small />
            </BreakdownSection>

            {/* Key Ratios */}
            <BreakdownSection title="Key Ratios">
              <MetricRow label="Gross Margin" value={period.grossMarginPct !== null ? formatPercent(period.grossMarginPct) : "\u2014"} small />
              <MetricRow label="Net Margin" value={period.netMarginPct !== null ? formatPercent(period.netMarginPct) : "\u2014"} small />
              <MetricRow label="ACOS" value={period.acos !== null ? formatPercent(period.acos) : "\u2014"} small />
              <MetricRow label="TACOS" value={period.tacos !== null ? formatPercent(period.tacos) : "\u2014"} small />
              <MetricRow label="ROAS" value={period.roas !== null ? `${period.roas}x` : "\u2014"} small />
              <MetricRow label="CPC" value={period.cpc !== null ? formatCurrency(period.cpc) : "\u2014"} small />
              <MetricRow label="CTR" value={period.ctr !== null ? formatPercent(period.ctr) : "\u2014"} small />
              <MetricRow label="Profit / Unit" value={period.profitPerUnit !== null ? formatCurrency(period.profitPerUnit) : "\u2014"} small />
              <MetricRow label="ROI" value={period.roi !== null ? formatPercent(period.roi) : "\u2014"} small />
            </BreakdownSection>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  valueClassName,
  bold,
  small,
  badge,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  bold?: boolean;
  small?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-1 min-w-0", small ? "py-0.5" : "py-0.5")}>
      <span className={cn(
        "text-muted-foreground shrink min-w-0 truncate",
        small ? "text-2xs" : "text-2xs md:text-xs",
        bold && "text-foreground font-medium"
      )}>
        {label}
      </span>
      <span className="flex flex-wrap items-baseline justify-end gap-x-0.5 gap-y-0.5 shrink-0 max-w-[60%]">
        <span
          className={cn(
            "tabular-nums whitespace-nowrap",
            small ? "text-2xs" : "text-2xs md:text-xs",
            bold ? "font-semibold" : "font-medium",
            valueClassName ?? "text-foreground"
          )}
        >
          {value}
        </span>
        {badge}
      </span>
    </div>
  );
}

function BreakdownSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </p>
      {children}
    </div>
  );
}

function formatDateRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  if (from.toDateString() === to.toDateString()) {
    return `${from.getUTCDate()} ${monthNames[from.getUTCMonth()]} ${from.getUTCFullYear()}`;
  }

  if (from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()) {
    return `${from.getUTCDate()}-${to.getUTCDate()} ${monthNames[from.getUTCMonth()]} ${from.getUTCFullYear()}`;
  }

  return `${from.getUTCDate()} ${monthNames[from.getUTCMonth()].slice(0, 3)} \u2013 ${to.getUTCDate()} ${monthNames[to.getUTCMonth()].slice(0, 3)} ${to.getUTCFullYear()}`;
}
