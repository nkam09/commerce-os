"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { useApiData } from "@/hooks/use-api-data";
import { PageError } from "@/components/shared/error";
import { EmptyState } from "@/components/shared/empty-state";
import { SkeletonMetricCard, SkeletonTable } from "@/components/ui/skeleton-loader";
import { AIInsightBanner } from "@/components/pages/dashboard/ai-insight-banner";
import { TrendsSummaryCards } from "@/components/pages/dashboard/trends-summary-cards";
import {
  TrendsHeatmapTable,
  HEATMAP_METRICS,
  type HeatmapMetricDef,
} from "@/components/pages/dashboard/trends-heatmap-table";
import { TrendsMonthlyTotals } from "@/components/pages/dashboard/trends-monthly-totals";
import type { TrendsViewData } from "@/lib/services/dashboard-trends-service";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { pacificDateStr, subDays, parseYearMonth, toISODate } from "@/lib/utils/pacific-date";
import { useBrandParam } from "@/lib/stores/brand-store";

// ─── Constants ──────────────────────────────────────────────────────────────

type TimeRange = "6m" | "12m" | "ytd" | "custom";
type Granularity = "monthly" | "weekly";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "ytd", label: "This year" },
  { value: "custom", label: "Custom" },
];

// ─── ChevronDown icon ───────────────────────────────────────────────────────

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("w-3.5 h-3.5", className)}
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

// ─── Download icon ──────────────────────────────────────────────────────────

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("w-4 h-4", className)}
    >
      <path d="M8 2v8m0 0l-3-3m3 3l3-3" />
      <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" />
    </svg>
  );
}

// ─── Time Range Dropdown ────────────────────────────────────────────────────

function TimeRangeDropdown({
  value,
  onChange,
  customFrom,
  customTo,
  onApplyCustom,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
  customFrom: Date | null;
  customTo: Date | null;
  onApplyCustom: (from: Date, to: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = TIME_RANGE_OPTIONS.find((o) => o.value === value);
  const customLabel = customFrom && customTo
    ? `${customFrom.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${customTo.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-elevated transition-colors"
      >
        {value === "custom" && customLabel ? customLabel : current?.label}
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-md border border-border bg-card shadow-lg py-1">
          {TIME_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                if (opt.value === "custom") {
                  setOpen(false);
                  setShowPicker(true);
                } else {
                  onChange(opt.value);
                  setOpen(false);
                  setShowPicker(false);
                }
              }}
              className={cn(
                "block w-full text-left px-3 py-1.5 text-xs transition-colors",
                opt.value === value
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-elevated"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {showPicker && (
        <DateRangePicker
          from={customFrom}
          to={customTo}
          onApply={(from, to) => {
            onApplyCustom(from, to);
            setShowPicker(false);
          }}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Granularity Toggle ─────────────────────────────────────────────────────

function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (v: Granularity) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-card overflow-hidden">
      {(["monthly", "weekly"] as Granularity[]).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
            g === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-elevated"
          )}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

// ─── Metric Tabs (horizontal scrollable) ────────────────────────────────────

function MetricTabs({
  selected,
  onChange,
}: {
  selected: HeatmapMetricDef;
  onChange: (m: HeatmapMetricDef) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative">
      {/* Fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent z-10" />

      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto scrollbar-none px-1 py-1"
        style={{ scrollbarWidth: "none" }}
      >
        {HEATMAP_METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              "flex-shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
              m.key === selected.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-elevated"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── CSV helpers ────────────────────────────────────────────────────────────

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

function buildTrendsCsv(monthly: TrendsViewData["monthly"]): string {
  const headers = [
    "Month", "Gross Sales", "Net Revenue", "Net Profit", "Units",
    "Orders", "Ad Spend", "ACOS", "TACOS", "Net Margin", "Profit/Unit",
  ];
  const rows = monthly.map((m) => [
    m.month,
    m.grossSales.toFixed(2),
    m.netRevenue.toFixed(2),
    m.netProfit.toFixed(2),
    String(m.unitsSold),
    String(m.orderCount),
    m.adSpend.toFixed(2),
    (m.acos * 100).toFixed(1) + "%",
    (m.tacos * 100).toFixed(1) + "%",
    (m.netMarginPct * 100).toFixed(1) + "%",
    m.profitPerUnit.toFixed(2),
  ]);
  return [headers, ...rows]
    .map((r) => r.map(escapeCsvField).join(","))
    .join("\n");
}

// ─── Export Button ───────────────────────────────────────────────────────────

function ExportButton({ monthlyData }: { monthlyData: TrendsViewData["monthly"] }) {
  const [open, setOpen] = useState(false);

  const handleExport = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    const csv = buildTrendsCsv(monthlyData);
    downloadCsv(csv, `commerce-os-trends-${date}.csv`);
    setOpen(false);
  }, [monthlyData]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-elevated transition-colors"
      >
        <DownloadIcon />
        Export
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[120px] rounded-md border border-border bg-card shadow-lg py-1">
          <button
            type="button"
            onClick={handleExport}
            className="block w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-elevated transition-colors"
          >
            Export CSV
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton Loading State ─────────────────────────────────────────────────

function TrendsSkeleton() {
  return (
    <div className="space-y-6">
      {/* AI banner skeleton */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="animate-pulse flex gap-3">
          <div className="h-3 bg-muted rounded w-full" />
        </div>
      </div>

      {/* Controls skeleton */}
      <div className="flex gap-3">
        <div className="h-8 w-32 bg-muted rounded-md animate-pulse" />
        <div className="h-8 w-40 bg-muted rounded-md animate-pulse" />
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonMetricCard key={i} />
        ))}
      </div>

      {/* Metric tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 w-16 bg-muted rounded-md animate-pulse" />
        ))}
      </div>

      {/* Tables skeleton */}
      <SkeletonTable rows={5} cols={8} />
      <SkeletonTable rows={10} cols={8} />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

function computeTrendsDates(range: TimeRange): { from: string; to: string } {
  const today = pacificDateStr();
  const { year } = parseYearMonth(today);
  switch (range) {
    case "6m": return { from: subDays(today, 179), to: today };
    case "12m": return { from: subDays(today, 364), to: today };
    case "ytd": return { from: `${year}-01-01`, to: today };
    default: return { from: subDays(today, 364), to: today };
  }
}

export function TrendsView() {
  const [timeRange, setTimeRange] = useState<TimeRange>("12m");
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [selectedMetric, setSelectedMetric] = useState<HeatmapMetricDef>(
    HEATMAP_METRICS[0]
  );
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);

  // Compute API dates from local state
  const { from: dateFrom, to: dateTo } = useMemo(() => {
    if (timeRange === "custom" && customFrom && customTo) {
      return { from: toISODate(customFrom), to: toISODate(customTo) };
    }
    return computeTrendsDates(timeRange);
  }, [timeRange, customFrom, customTo]);

  const bp = useBrandParam();
  const trendsUrl = `/api/dashboard/trends-data?range=${timeRange}&granularity=${granularity}&metric=${selectedMetric.key}&from=${dateFrom}&to=${dateTo}${bp}`;
  const { data, isLoading, isError, error, refetch } =
    useApiData<TrendsViewData>(trendsUrl);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <TrendsSkeleton />;
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (isError) {
    return <PageError message={error ?? undefined} onRetry={refetch} />;
  }

  // ── Empty ──────────────────────────────────────────────────────────────────

  if (!data || !data.monthly || data.monthly.length === 0) {
    return (
      <EmptyState
        title="No trends data yet"
        description="Connect your Amazon account and sync data to see performance trends."
      />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* AI Insight Banner */}
      <AIInsightBanner />

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <TimeRangeDropdown
          value={timeRange}
          onChange={(v) => { setTimeRange(v); }}
          customFrom={customFrom}
          customTo={customTo}
          onApplyCustom={(from, to) => {
            setCustomFrom(from);
            setCustomTo(to);
            setTimeRange("custom");
          }}
        />
        <GranularityToggle value={granularity} onChange={setGranularity} />
        <div className="flex-1" />
        <ExportButton monthlyData={data.monthly} />
      </div>

      {/* Summary Cards */}
      <TrendsSummaryCards monthlyData={data.monthly} />

      {/* Metric Selector Tabs */}
      <MetricTabs selected={selectedMetric} onChange={setSelectedMetric} />

      {/* Heatmap Table */}
      <TrendsHeatmapTable
        monthlyData={data.monthly}
        selectedMetric={selectedMetric}
        products={data.products}
      />

      {/* Monthly Totals Table */}
      <TrendsMonthlyTotals monthlyData={data.monthly} />
    </div>
  );
}
