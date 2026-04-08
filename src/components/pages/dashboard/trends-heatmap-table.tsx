"use client";

import { cn } from "@/lib/utils/cn";
import { MiniSparkline } from "@/components/ui/mini-sparkline";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils/formatters";
import type { TrendsMonthlyData, ProductTrendData } from "@/lib/services/dashboard-trends-service";

// ─── Metric definition for the tab system ────────────────────────────────────

export type HeatmapMetricKey =
  | "netRevenue"
  | "unitsSold"
  | "orderCount"
  | "promoAmount"
  | "adSpend"
  | "refundAmount"
  | "refundCost"
  | "refundPct"
  | "sellableReturns"
  | "amazonFees"
  | "estimatedPayout"
  | "cogs"
  | "grossProfit"
  | "indirectExpenses"
  | "netProfit"
  | "netMarginPct"
  | "roi"
  | "bsr"
  | "acos"
  | "tacos"
  | "realAcos"
  | "sessions"
  | "unitSessionPct";

export type HeatmapMetricDef = {
  key: HeatmapMetricKey;
  label: string;
  dataKey: keyof TrendsMonthlyData;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
};

export const HEATMAP_METRICS: HeatmapMetricDef[] = [
  { key: "netRevenue", label: "Sales", dataKey: "netRevenue", format: (v) => formatCurrency(v, "USD", true) },
  { key: "unitsSold", label: "Units", dataKey: "unitsSold", format: (v) => formatNumber(v, true) },
  { key: "orderCount", label: "Orders", dataKey: "orderCount", format: (v) => formatNumber(v) },
  { key: "promoAmount", label: "Promo", dataKey: "grossSales", format: (v) => formatCurrency(v, "USD", true) },
  { key: "adSpend", label: "Advertising cost", dataKey: "adSpend", format: (v) => formatCurrency(v, "USD", true), lowerIsBetter: true },
  { key: "refundAmount", label: "Refunds", dataKey: "grossSales", format: (v) => formatNumber(v) },
  { key: "refundCost", label: "Refund cost", dataKey: "grossSales", format: (v) => formatCurrency(v, "USD", true), lowerIsBetter: true },
  { key: "refundPct", label: "% Refunds", dataKey: "grossSales", format: (v) => formatPercent(v), lowerIsBetter: true },
  { key: "sellableReturns", label: "Sellable returns", dataKey: "unitsSold", format: (v) => formatNumber(v) },
  { key: "amazonFees", label: "Amazon fees", dataKey: "grossSales", format: (v) => formatCurrency(v, "USD", true), lowerIsBetter: true },
  { key: "estimatedPayout", label: "Estimated payout", dataKey: "netRevenue", format: (v) => formatCurrency(v, "USD", true) },
  { key: "cogs", label: "Cost of goods", dataKey: "grossSales", format: (v) => formatCurrency(v, "USD", true), lowerIsBetter: true },
  { key: "grossProfit", label: "Gross profit", dataKey: "grossSales", format: (v) => formatCurrency(v, "USD", true) },
  { key: "indirectExpenses", label: "Indirect expenses", dataKey: "grossSales", format: (v) => formatCurrency(v, "USD", true), lowerIsBetter: true },
  { key: "netProfit", label: "Net profit", dataKey: "netProfit", format: (v) => formatCurrency(v, "USD", true) },
  { key: "netMarginPct", label: "Margin", dataKey: "netMarginPct", format: (v) => formatPercent(v) },
  { key: "roi", label: "ROI", dataKey: "netMarginPct", format: (v) => formatPercent(v) },
  { key: "bsr", label: "BSR", dataKey: "orderCount", format: (v) => formatNumber(v) },
  { key: "acos", label: "ACOS", dataKey: "acos", format: (v) => formatPercent(v), lowerIsBetter: true },
  { key: "tacos", label: "TACOS", dataKey: "tacos", format: (v) => formatPercent(v), lowerIsBetter: true },
  { key: "realAcos", label: "Real ACOS", dataKey: "acos", format: (v) => formatPercent(v), lowerIsBetter: true },
  { key: "sessions", label: "Sessions", dataKey: "orderCount", format: (v) => formatNumber(v) },
  { key: "unitSessionPct", label: "Unit session %", dataKey: "profitPerUnit", format: (v) => formatPercent(v) },
];

// ─── Product Row type (simulated from monthly data) ──────────────────────────

type ProductRow = {
  id: string;
  title: string;
  asin: string;
  sku: string;
  imageUrl: string | null;
  /** Array of values per period, matching the periods array order */
  values: number[];
  /** Array of % changes per period (null for first period) */
  changes: (number | null)[];
};

// ─── Heatmap color util ─────────────────────────────────────────────────────

function getHeatmapBg(changePct: number | null, lowerIsBetter: boolean): string {
  if (changePct === null) return "";

  // Flip the logic if lower is better
  const effective = lowerIsBetter ? -changePct : changePct;

  if (effective >= 0.3) return "bg-green-600/25 dark:bg-green-500/20";
  if (effective >= 0.15) return "bg-green-500/15 dark:bg-green-400/15";
  if (effective >= 0.05) return "bg-green-400/10 dark:bg-green-400/10";
  if (effective > -0.05) return "";
  if (effective > -0.15) return "bg-red-400/10 dark:bg-red-400/10";
  if (effective > -0.3) return "bg-red-500/15 dark:bg-red-400/15";
  return "bg-red-600/25 dark:bg-red-500/20";
}

function getChangeColor(changePct: number | null, lowerIsBetter: boolean): string {
  if (changePct === null) return "text-muted-foreground";

  const effective = lowerIsBetter ? -changePct : changePct;
  if (effective > 0.01) return "text-green-600 dark:text-green-400";
  if (effective < -0.01) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/**
 * Build product rows from real per-product data returned by the API.
 * Falls back to splitting aggregate data if products array is empty.
 */
function buildProductRows(
  monthlyData: TrendsMonthlyData[],
  metric: HeatmapMetricDef,
  products?: ProductTrendData[]
): ProductRow[] {
  if (products && products.length > 0) {
    return products.map((p) => {
      const values = p.monthly.map((d) => {
        const v = d[metric.dataKey] as number;
        return Math.round(v * 100) / 100;
      });
      const changes = values.map((v, i) =>
        i === 0 ? null : calcChange(v, values[i - 1])
      );
      return {
        id: p.productId,
        title: p.title,
        asin: p.asin,
        sku: p.sku,
        imageUrl: p.imageUrl,
        values,
        changes,
      };
    });
  }

  // Fallback: no per-product data, show one "All Products" row
  const values = monthlyData.map((d) => {
    const base = d[metric.dataKey] as number;
    return Math.round(base * 100) / 100;
  });
  const changes = values.map((v, i) =>
    i === 0 ? null : calcChange(v, values[i - 1])
  );
  return [{
    id: "all",
    title: "All Products",
    asin: "",
    sku: "",
    imageUrl: null,
    values,
    changes,
  }];
}

// ─── Component ──────────────────────────────────────────────────────────────

type TrendsHeatmapTableProps = {
  monthlyData: TrendsMonthlyData[];
  selectedMetric: HeatmapMetricDef;
  products?: ProductTrendData[];
};

export function TrendsHeatmapTable({
  monthlyData,
  selectedMetric,
  products,
}: TrendsHeatmapTableProps) {
  // Periods displayed from right (oldest) to left (newest)
  const periods = [...monthlyData].reverse();
  const productRows = buildProductRows(monthlyData, selectedMetric, products);

  // Reverse values/changes too so index 0 = most recent
  const reversedRows = productRows.map((row) => ({
    ...row,
    values: [...row.values].reverse(),
    changes: [...row.changes].reverse(),
  }));

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              {/* Frozen product column */}
              <th className="sticky left-0 z-10 bg-elevated/90 backdrop-blur-sm min-w-[220px] px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Product
              </th>
              {/* Sparkline column */}
              <th className="sticky left-[220px] z-10 bg-elevated/90 backdrop-blur-sm min-w-[80px] px-2 py-2.5 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Trend
              </th>
              {/* Period columns — most recent first */}
              {periods.map((d, i) => (
                <th
                  key={d.month}
                  className={cn(
                    "min-w-[100px] px-3 py-2.5 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider",
                    i === 0 && "bg-primary/5"
                  )}
                >
                  {d.month}
                  {i === 0 && (
                    <span className="ml-1 text-muted-foreground/60">(MTD)</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reversedRows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-elevated/30 transition-colors">
                {/* Product info — frozen */}
                <td className="sticky left-0 z-10 bg-card backdrop-blur-sm px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {/* Image placeholder */}
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 text-muted-foreground/50" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground truncate max-w-[140px]">
                        {row.title}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.asin} / {row.sku}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Sparkline */}
                <td className="sticky left-[220px] z-10 bg-card backdrop-blur-sm px-2 py-2.5 text-center">
                  <MiniSparkline
                    data={[...row.values].reverse()}
                    width={60}
                    height={24}
                    color={selectedMetric.lowerIsBetter ? "#f59e0b" : "#3b82f6"}
                  />
                </td>

                {/* Data cells */}
                {row.values.map((value, i) => {
                  const change = row.changes[i];
                  return (
                    <td
                      key={periods[i].month}
                      className={cn(
                        "px-3 py-2 text-center",
                        i === 0 && "bg-primary/5",
                        getHeatmapBg(change, !!selectedMetric.lowerIsBetter)
                      )}
                    >
                      <div className="text-xs font-semibold text-foreground tabular-nums">
                        {selectedMetric.format(value)}
                      </div>
                      {change !== null && (
                        <div
                          className={cn(
                            "text-[10px] tabular-nums mt-0.5",
                            getChangeColor(change, !!selectedMetric.lowerIsBetter)
                          )}
                        >
                          {change > 0 ? "+" : ""}
                          {(change * 100).toFixed(1)}%
                        </div>
                      )}
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
