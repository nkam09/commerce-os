"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { useApiData } from "@/hooks/use-api-data";
import { PageError } from "@/components/shared/error";
import { EmptyState } from "@/components/shared/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton-loader";
import { AIInsightBanner } from "@/components/pages/dashboard/ai-insight-banner";
import type {
  PLColumnsResponse,
  PLColumn,
  PLColumnMetrics,
  PLGranularity,
} from "@/lib/services/dashboard-pl-service";
import { DateRangeDropdown } from "@/components/ui/date-range-dropdown";
import { pacificDateStr, subDays, toISODate } from "@/lib/utils/pacific-date";

// ─── Row hierarchy definition ──────────────────────────────────────────────

type MetricFormat = "currency" | "number" | "pct";

interface RowDef {
  id: string;
  label: string;
  metricKey: keyof PLColumnMetrics;
  format: MetricFormat;
  indent: number;
  isBold?: boolean;
  isProfit?: boolean;  // green/red coloring
  invertColor?: boolean; // lower is better
  children?: RowDef[];
}

const ROW_DEFS: RowDef[] = [
  {
    id: "sales", label: "Sales", metricKey: "sales", format: "currency", indent: 0,
  },
  {
    id: "units", label: "Units", metricKey: "units", format: "number", indent: 0,
  },
  {
    id: "refundCount", label: "Refunds", metricKey: "refundCount", format: "number", indent: 0,
  },
  {
    id: "promo", label: "Promo", metricKey: "promo", format: "currency", indent: 0,
  },
  {
    id: "advertisingCost", label: "Advertising Cost", metricKey: "advertisingCost", format: "currency", indent: 0, invertColor: true,
  },
  {
    id: "refundCost", label: "Refund Cost", metricKey: "refundCost", format: "currency", indent: 0, invertColor: true,
  },
  {
    id: "amazonFees", label: "Amazon Fees", metricKey: "amazonFees", format: "currency", indent: 0, invertColor: true,
  },
  {
    id: "costOfGoods", label: "Cost of Goods", metricKey: "costOfGoods", format: "currency", indent: 0, invertColor: true,
  },
  {
    id: "grossProfit", label: "Gross Profit", metricKey: "grossProfit", format: "currency", indent: 0, isBold: true, isProfit: true,
  },
  {
    id: "indirectExpenses", label: "Indirect Expenses", metricKey: "indirectExpenses", format: "currency", indent: 0, invertColor: true,
  },
  {
    id: "netProfit", label: "Net Profit", metricKey: "netProfit", format: "currency", indent: 0, isBold: true, isProfit: true,
  },
  {
    id: "estimatedPayout", label: "Est. Payout", metricKey: "estimatedPayout", format: "currency", indent: 0,
  },
  {
    id: "realAcos", label: "Real ACOS", metricKey: "realAcos", format: "pct", indent: 0, invertColor: true,
  },
  {
    id: "tacos", label: "TACOS", metricKey: "tacos", format: "pct", indent: 0, invertColor: true,
  },
  {
    id: "refundPct", label: "% Refunds", metricKey: "refundPct", format: "pct", indent: 0, invertColor: true,
  },
  {
    id: "margin", label: "Margin", metricKey: "margin", format: "pct", indent: 0,
  },
  {
    id: "roi", label: "ROI", metricKey: "roi", format: "pct", indent: 0,
  },
];

// ─── Formatting ────────────────────────────────────────────────────────────

function fmtCell(value: number | null, format: MetricFormat): string {
  if (value == null) return "—";
  if (format === "currency") {
    const abs = Math.abs(value);
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(abs);
    return value < -0.5 ? `(${formatted})` : formatted;
  }
  if (format === "pct") {
    return value != null ? `${value.toFixed(1)}%` : "—";
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

// ─── Heatmap ───────────────────────────────────────────────────────────────

function getHeatmapBg(value: number, allValues: number[], invertColor?: boolean): string | undefined {
  const nums = allValues.filter((v) => v != null && !isNaN(v));
  if (nums.length < 2) return undefined;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max - min === 0) return undefined;
  let normalized = (value - min) / (max - min);
  if (invertColor) normalized = 1 - normalized;
  if (normalized >= 0.5) {
    const intensity = (normalized - 0.5) * 2;
    return `rgba(34, 197, 94, ${(0.05 + intensity * 0.18).toFixed(3)})`;
  }
  const intensity = (0.5 - normalized) * 2;
  return `rgba(239, 68, 68, ${(0.05 + intensity * 0.18).toFixed(3)})`;
}

// ─── Icons ─────────────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12h10" />
    </svg>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────

const GRANULARITY_OPTIONS: { value: PLGranularity; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

type PLTimeRange = "30d" | "12w" | "6m" | "custom";

const PL_TIME_RANGE_PRESETS = [
  { label: "Last 30 days", value: "30d" },
  { label: "Last 12 weeks", value: "12w" },
  { label: "Last 6 months", value: "6m" },
];

function computePLDates(range: PLTimeRange): { from: string; to: string } {
  const today = pacificDateStr();
  switch (range) {
    case "30d": return { from: subDays(today, 29), to: today };
    case "12w": return { from: subDays(today, 83), to: today };
    case "6m": return { from: subDays(today, 179), to: today };
    default: return { from: subDays(today, 29), to: today };
  }
}

const DOWNLOAD_OPTIONS = [
  { label: "Daily P&L (CSV)", key: "daily" },
  { label: "Monthly P&L (CSV)", key: "monthly" },
  { label: "Monthly by Day (CSV)", key: "monthlyByDay" },
  { label: "Yearly P&L (CSV)", key: "yearly" },
  { label: "Per-Product P&L (CSV)", key: "perProduct" },
];

// ─── CSV helpers ──────────────────────────────────────────────────────────

function escapeCsvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildPLCsv(columns: PLColumn[]): string {
  // Transposed: rows are metrics, columns are time periods
  const header = ["Metric", ...columns.map((c) => c.label)];
  const rows = ROW_DEFS.map((row) => {
    const values = columns.map((col) => {
      const v = col.metrics[row.metricKey];
      return fmtCell(v, row.format);
    });
    return [row.label, ...values];
  });
  return [header, ...rows]
    .map((r) => r.map(escapeCsvField).join(","))
    .join("\n");
}

// ─── Dropdown helper ──────────────────────────────────────────────────────

function Dropdown({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border bg-elevated/50 text-muted-foreground hover:bg-elevated hover:text-foreground transition-colors"
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="ml-0.5 opacity-50">
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-border bg-card shadow-lg py-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Heatmap toggle ────────────────────────────────────────────────────────

function HeatmapToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border transition-colors",
        active ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-elevated/50 text-muted-foreground hover:bg-elevated",
      )}
    >
      <div className="w-6 h-2 rounded-full" style={{
        background: active
          ? "linear-gradient(90deg, rgba(239,68,68,0.45), rgba(34,197,94,0.45))"
          : "linear-gradient(90deg, rgba(120,120,120,0.25), rgba(120,120,120,0.25))",
      }} />
      Heatmap
    </button>
  );
}

// ─── Main exported component ──────────────────────────────────────────────

export function PLView() {
  const [granularity, setGranularity] = useState<PLGranularity>("monthly");
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [plTimeRange, setPlTimeRange] = useState<PLTimeRange>("6m");
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);

  const { from: dateFrom, to: dateTo } = useMemo(() => {
    if (plTimeRange === "custom" && customFrom && customTo) {
      return { from: toISODate(customFrom), to: toISODate(customTo) };
    }
    return computePLDates(plTimeRange);
  }, [plTimeRange, customFrom, customTo]);

  const apiUrl = `/api/dashboard/pl-data?granularity=${granularity}&from=${dateFrom}&to=${dateTo}`;

  const { data, isLoading, isError, error, refetch } =
    useApiData<PLColumnsResponse>(apiUrl);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-[52px] rounded-lg bg-ai-muted/30 border border-ai/10 animate-skeleton-pulse" />
        <div className="flex items-center gap-2">
          {GRANULARITY_OPTIONS.map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-md bg-muted animate-skeleton-pulse" />
          ))}
        </div>
        <SkeletonTable rows={14} cols={7} />
      </div>
    );
  }

  if (isError) {
    return <PageError message={error ?? undefined} onRetry={refetch} />;
  }

  if (!data || data.columns.length === 0) {
    return (
      <EmptyState
        title="No P&L data yet"
        description="Connect your Amazon account and sync data to see your P&L breakdown."
      />
    );
  }

  return (
    <div className="space-y-4">
      <AIInsightBanner page="dashboard" />

      {/* Controls */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:flex-wrap md:gap-3">
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-foreground">
            Profit &amp; Loss
          </h2>

          {/* Time range dropdown */}
          <DateRangeDropdown
            presets={PL_TIME_RANGE_PRESETS}
            selectedPreset={plTimeRange}
            onPresetChange={(v) => setPlTimeRange(v as PLTimeRange)}
            customFrom={customFrom}
            customTo={customTo}
            onCustomApply={(from, to) => {
              setCustomFrom(from);
              setCustomTo(to);
              setPlTimeRange("custom");
            }}
          />

          {/* Granularity toggle */}
          <div className="flex items-center gap-0.5 bg-elevated/50 rounded-md p-0.5 border border-border">
            {GRANULARITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setGranularity(opt.value)}
                className={cn(
                  "px-2.5 md:px-3 py-1.5 md:py-1 text-xs rounded transition-all font-medium",
                  granularity === opt.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HeatmapToggle active={heatmapEnabled} onToggle={() => setHeatmapEnabled((v) => !v)} />
          <Dropdown label={<><DownloadIcon /> Download</>}>
            {DOWNLOAD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  const date = new Date().toISOString().slice(0, 10);
                  const csv = buildPLCsv(data.columns);
                  downloadCsv(csv, `commerce-os-pl-${opt.key}-${date}.csv`);
                }}
                className="block w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-elevated hover:text-foreground"
              >
                {opt.label}
              </button>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* Grid */}
      <PLGrid columns={data.columns} heatmapEnabled={heatmapEnabled} />
    </div>
  );
}

// ─── P&L Grid ──────────────────────────────────────────────────────────────

function PLGrid({ columns, heatmapEnabled }: { columns: PLColumn[]; heatmapEnabled: boolean }) {
  const [expandedRows] = useState<Set<string>>(new Set());

  // For heatmap: precompute value ranges per row
  const heatmapRanges = useMemo(() => {
    const ranges: Record<string, number[]> = {};
    for (const row of ROW_DEFS) {
      ranges[row.id] = columns.map((col) => {
        const v = col.metrics[row.metricKey];
        return typeof v === "number" ? v : 0;
      });
    }
    return ranges;
  }, [columns]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto -mx-0.5 px-0.5">
        <table className="w-full text-[11px] md:text-xs">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="sticky left-0 z-10 bg-elevated text-left px-2.5 md:px-4 py-2 md:py-2.5 font-semibold text-muted-foreground min-w-[140px] md:min-w-[220px]">
                Metric
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-right px-2 md:px-4 py-2 md:py-2.5 font-semibold text-muted-foreground min-w-[80px] md:min-w-[100px] whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROW_DEFS.map((row) => {
              const values = columns.map((col) => col.metrics[row.metricKey]);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/50 hover:bg-elevated/30 transition-colors",
                    row.isBold && "bg-elevated/20",
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 bg-card px-2.5 md:px-4 py-1.5 md:py-2 whitespace-nowrap",
                      row.isBold ? "font-bold text-foreground" : "text-muted-foreground",
                    )}
                    style={{ paddingLeft: `${10 + row.indent * 12}px` }}
                  >
                    {row.label}
                  </td>
                  {values.map((val, i) => {
                    const num = typeof val === "number" ? val : 0;
                    const bg = heatmapEnabled ? getHeatmapBg(num, heatmapRanges[row.id] ?? [], row.invertColor) : undefined;
                    return (
                      <td
                        key={columns[i].key}
                        className={cn(
                          "text-right px-2 md:px-4 py-1.5 md:py-2 tabular-nums whitespace-nowrap",
                          row.isBold ? "font-bold" : "",
                          row.isProfit && num > 0 && "text-green-500",
                          row.isProfit && num < 0 && "text-red-500",
                          !row.isProfit && row.invertColor && num > 0 && "text-red-400/80",
                        )}
                        style={bg ? { backgroundColor: bg } : undefined}
                      >
                        {fmtCell(val, row.format)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Legacy aliases
export { PLView as DashboardPLView };
