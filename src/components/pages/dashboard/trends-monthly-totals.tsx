"use client";

import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils/formatters";
import type { TrendsMonthlyData } from "@/lib/services/dashboard-trends-service";

// ─── Row definitions ────────────────────────────────────────────────────────

type TableRowDef = {
  label: string;
  dataKey: keyof TrendsMonthlyData;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
  isBold?: boolean;
};

const MONTHLY_TOTAL_ROWS: TableRowDef[] = [
  { label: "Gross Sales", dataKey: "grossSales", format: (v) => formatCurrency(v, "USD", true) },
  { label: "Net Revenue", dataKey: "netRevenue", format: (v) => formatCurrency(v, "USD", true) },
  { label: "Units Sold", dataKey: "unitsSold", format: (v) => formatNumber(v) },
  { label: "Orders", dataKey: "orderCount", format: (v) => formatNumber(v) },
  { label: "Ad Spend", dataKey: "adSpend", format: (v) => formatCurrency(v, "USD", true), lowerIsBetter: true },
  { label: "ACOS", dataKey: "acos", format: (v) => formatPercent(v), lowerIsBetter: true },
  { label: "TACOS", dataKey: "tacos", format: (v) => formatPercent(v), lowerIsBetter: true },
  { label: "Net Profit", dataKey: "netProfit", format: (v) => formatCurrency(v, "USD", true), isBold: true },
  { label: "Net Margin", dataKey: "netMarginPct", format: (v) => formatPercent(v) },
  { label: "Profit / Unit", dataKey: "profitPerUnit", format: (v) => formatCurrency(v) },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function getValueColor(
  value: number,
  change: number | null,
  lowerIsBetter?: boolean
): string {
  if (change === null) return "text-foreground";
  const effective = lowerIsBetter ? -change : change;
  if (effective > 0.01) return "text-green-600 dark:text-green-400";
  if (effective < -0.01) return "text-red-600 dark:text-red-400";
  return "text-foreground";
}

// ─── Component ──────────────────────────────────────────────────────────────

type TrendsMonthlyTotalsProps = {
  monthlyData: TrendsMonthlyData[];
};

export function TrendsMonthlyTotals({ monthlyData }: TrendsMonthlyTotalsProps) {
  const lastIdx = monthlyData.length - 1;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Monthly Totals</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="sticky left-0 z-10 bg-elevated/90 backdrop-blur-sm px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider min-w-[140px]">
                Metric
              </th>
              {monthlyData.map((d, i) => (
                <th
                  key={d.month}
                  className={cn(
                    "px-4 py-2.5 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider min-w-[100px]",
                    i === lastIdx && "bg-primary/5"
                  )}
                >
                  {d.month}
                  {i === lastIdx && (
                    <span className="ml-1 text-muted-foreground/60">(MTD)</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MONTHLY_TOTAL_ROWS.map((row) => (
              <tr
                key={row.label}
                className={cn(
                  "border-b border-border last:border-b-0",
                  row.isBold && "bg-elevated/30"
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 bg-card backdrop-blur-sm px-4 py-2 text-xs whitespace-nowrap",
                    row.isBold ? "font-semibold text-foreground" : "font-medium text-foreground"
                  )}
                >
                  {row.label}
                </td>
                {monthlyData.map((d, i) => {
                  const value = d[row.dataKey] as number;
                  const prevValue =
                    i > 0
                      ? (monthlyData[i - 1][row.dataKey] as number)
                      : null;
                  const change =
                    prevValue !== null ? calcChange(value, prevValue) : null;

                  return (
                    <td
                      key={d.month}
                      className={cn(
                        "px-4 py-2 text-right text-xs tabular-nums whitespace-nowrap",
                        i === lastIdx && "bg-primary/5",
                        getValueColor(value, change, row.lowerIsBetter),
                        row.isBold && "font-semibold"
                      )}
                    >
                      {row.format(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
