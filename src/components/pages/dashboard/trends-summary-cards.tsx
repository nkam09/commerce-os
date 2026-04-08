"use client";

import { cn } from "@/lib/utils/cn";
import { MiniSparkline } from "@/components/ui/mini-sparkline";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils/formatters";
import type { TrendsMonthlyData } from "@/lib/services/dashboard-trends-service";

// ─── Types ──────────────────────────────────────────────────────────────────

type SummaryCardDef = {
  key: string;
  label: string;
  dataKey: keyof TrendsMonthlyData;
  format: (v: number) => string;
  color: string;
  /** If true, lower values are considered positive (e.g., ACOS, Ad Spend) */
  lowerIsBetter?: boolean;
  /** "total" sums all months; "average" averages them */
  aggregation: "total" | "average";
};

const SUMMARY_CARDS: SummaryCardDef[] = [
  {
    key: "revenue",
    label: "Revenue",
    dataKey: "netRevenue",
    format: (v) => formatCurrency(v, "USD", true),
    color: "#22c55e",
    aggregation: "total",
  },
  {
    key: "netProfit",
    label: "Net Profit",
    dataKey: "netProfit",
    format: (v) => formatCurrency(v, "USD", true),
    color: "#3b82f6",
    aggregation: "total",
  },
  {
    key: "unitsSold",
    label: "Units Sold",
    dataKey: "unitsSold",
    format: (v) => formatNumber(v, true),
    color: "#8b5cf6",
    aggregation: "total",
  },
  {
    key: "acos",
    label: "ACOS",
    dataKey: "acos",
    format: (v) => formatPercent(v),
    color: "#f59e0b",
    lowerIsBetter: true,
    aggregation: "average",
  },
  {
    key: "netMargin",
    label: "Net Margin",
    dataKey: "netMarginPct",
    format: (v) => formatPercent(v),
    color: "#06b6d4",
    aggregation: "average",
  },
  {
    key: "adSpend",
    label: "Ad Spend",
    dataKey: "adSpend",
    format: (v) => formatCurrency(v, "USD", true),
    color: "#ef4444",
    lowerIsBetter: true,
    aggregation: "total",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return (current - previous) / previous;
}

// ─── Change Badge ───────────────────────────────────────────────────────────

function ChangeBadge({
  change,
  lowerIsBetter = false,
}: {
  change: number;
  lowerIsBetter?: boolean;
}) {
  const isPositive = change > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  const arrow = isPositive ? "\u2191" : "\u2193";
  const pct = Math.abs(change * 100).toFixed(1);

  if (change === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
        0.0%
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        isGood
          ? "bg-green-500/10 text-green-600 dark:text-green-400"
          : "bg-red-500/10 text-red-600 dark:text-red-400"
      )}
    >
      {arrow} {pct}%
    </span>
  );
}

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({
  def,
  monthlyData,
}: {
  def: SummaryCardDef;
  monthlyData: TrendsMonthlyData[];
}) {
  const values = monthlyData.map((d) => d[def.dataKey] as number);

  // Aggregate value
  let aggregated: number;
  if (def.aggregation === "total") {
    aggregated = values.reduce((sum, v) => sum + v, 0);
  } else {
    aggregated = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  }

  // MoM change: compare last two months
  const current = values.length > 0 ? values[values.length - 1] : 0;
  const previous = values.length >= 2 ? values[values.length - 2] : current;
  const change = calcChange(current, previous);

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {def.label}
        </span>
        <ChangeBadge change={change} lowerIsBetter={def.lowerIsBetter} />
      </div>
      <div className="text-lg font-semibold text-foreground tabular-nums">
        {def.format(aggregated)}
      </div>
      <div className="mt-auto">
        <MiniSparkline data={values} color={def.color} width={60} height={28} filled />
      </div>
    </div>
  );
}

// ─── Summary Cards Row ──────────────────────────────────────────────────────

type TrendsSummaryCardsProps = {
  monthlyData: TrendsMonthlyData[];
};

export function TrendsSummaryCards({ monthlyData }: TrendsSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {SUMMARY_CARDS.map((def) => (
        <SummaryCard key={def.key} def={def} monthlyData={monthlyData} />
      ))}
    </div>
  );
}
