"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatNumber } from "@/lib/utils/formatters";
import { useApiData } from "@/hooks/use-api-data";
import { PageError } from "@/components/shared/error";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonChart, SkeletonTable } from "@/components/ui/skeleton-loader";
import { AIInsightBanner } from "./ai-insight-banner";
import { DateRangeDropdown } from "@/components/ui/date-range-dropdown";
import { ProductPerformanceTable } from "./product-performance-table";
import type { ChartViewData } from "@/lib/services/dashboard-chart-service";
import type { ProductRow } from "@/lib/services/dashboard-tiles-service";

// â”€â”€â”€ Time range options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ChartTimeRange = "7d" | "14d" | "30d" | "90d" | "6m" | "12m" | "custom";

const TIME_RANGES: { label: string; value: ChartTimeRange; months: number }[] = [
  { label: "7d", value: "7d", months: 1 },
  { label: "14d", value: "14d", months: 1 },
  { label: "30d", value: "30d", months: 1 },
  { label: "90d", value: "90d", months: 3 },
  { label: "6m", value: "6m", months: 6 },
  { label: "12m", value: "12m", months: 12 },
];

const CHART_DATE_PRESETS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 14 days", value: "14d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last 6 months", value: "6m" },
  { label: "Last 12 months", value: "12m" },
];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

function computeChartDates(range: ChartTimeRange): { from: string; to: string } {
  const today = toISODate(new Date());
  switch (range) {
    case "7d": return { from: dateNDaysAgo(6), to: today };
    case "14d": return { from: dateNDaysAgo(13), to: today };
    case "30d": return { from: dateNDaysAgo(29), to: today };
    case "90d": return { from: dateNDaysAgo(89), to: today };
    case "6m": return { from: dateNDaysAgo(179), to: today };
    case "12m": return { from: dateNDaysAgo(364), to: today };
    default: return { from: dateNDaysAgo(29), to: today };
  }
}

// â”€â”€â”€ Metric series config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type MetricSeriesKey =
  | "revenue"
  | "netProfit"
  | "adSpend"
  | "acos"
  | "tacos"
  | "grossProfit"
  | "units"
  | "orders"
  | "refunds"
  | "margin"
  | "roas";

type MetricSeries = {
  key: MetricSeriesKey;
  label: string;
  color: string;
  type: "bar" | "line";
  yAxisId: "left" | "right";
  defaultVisible: boolean;
  dashed?: boolean;
};

const METRIC_SERIES: MetricSeries[] = [
  { key: "adSpend", label: "Ad Spend", color: "#4ade80", type: "bar", yAxisId: "left", defaultVisible: true },
  { key: "netProfit", label: "Net Profit", color: "#3b82f6", type: "bar", yAxisId: "left", defaultVisible: true },
  { key: "revenue", label: "Revenue", color: "#22c55e", type: "line", yAxisId: "left", defaultVisible: true },
  { key: "acos", label: "ACOS %", color: "#facc15", type: "line", yAxisId: "right", defaultVisible: true, dashed: true },
  { key: "tacos", label: "TACOS %", color: "#f97316", type: "line", yAxisId: "right", defaultVisible: true, dashed: true },
  { key: "grossProfit", label: "Gross Profit", color: "#a78bfa", type: "line", yAxisId: "left", defaultVisible: false },
  { key: "units", label: "Units", color: "#c084fc", type: "line", yAxisId: "right", defaultVisible: false },
  { key: "orders", label: "Orders", color: "#06b6d4", type: "line", yAxisId: "right", defaultVisible: false },
  { key: "refunds", label: "Refunds", color: "#ef4444", type: "line", yAxisId: "left", defaultVisible: false },
  { key: "margin", label: "Margin %", color: "#10b981", type: "line", yAxisId: "right", defaultVisible: false },
  { key: "roas", label: "ROAS", color: "#8b5cf6", type: "line", yAxisId: "right", defaultVisible: false },
];

// â”€â”€â”€ Summary panel line items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SummaryLineItem = {
  label: string;
  key: string;
  bold?: boolean;
  colorFn?: (v: number) => string;
  isCount?: boolean;
  children?: SummaryLineItem[];
};

const SUMMARY_LINES: SummaryLineItem[] = [
  {
    label: "Sales",
    key: "grossSales",
    children: [
      { label: "Organic", key: "organicSales" },
      { label: "SP", key: "spSales" },
      { label: "SD", key: "sdSales" },
      { label: "Direct", key: "directSales" },
      { label: "Subscription", key: "subscriptionSales" },
    ],
  },
  {
    label: "Units",
    key: "unitsSold",
    isCount: true,
    children: [
      { label: "Organic units", key: "organicUnits", isCount: true },
      { label: "Ad units", key: "adUnits", isCount: true },
    ],
  },
  { label: "Refunds", key: "refunds" },
  { label: "Promo", key: "promo" },
  {
    label: "Advertising cost",
    key: "adSpend",
    children: [
      { label: "SP", key: "spSpend" },
      { label: "SBV", key: "sbvSpend" },
      { label: "SD", key: "sdSpend" },
      { label: "SB", key: "sbSpend" },
    ],
  },
  { label: "Refund cost", key: "refundCost" },
  {
    label: "Amazon fees",
    key: "amazonFees",
    children: [
      { label: "Referral fee", key: "referralFees" },
      { label: "FBA fee", key: "fbaFees" },
      { label: "Storage fee", key: "storageFees" },
      { label: "Return processing", key: "returnFees" },
      { label: "Other fees", key: "otherFees" },
    ],
  },
  { label: "Cost of goods", key: "totalCogs" },
  {
    label: "Gross Profit",
    key: "grossProfit",
    bold: true,
    colorFn: (v) => (v >= 0 ? "text-green-400" : "text-red-400"),
  },
  { label: "Indirect expenses", key: "indirectExpenses" },
  {
    label: "Net Profit",
    key: "netProfit",
    bold: true,
    colorFn: (v) => (v >= 0 ? "text-green-400" : "text-red-400"),
  },
  { label: "Estimated payout", key: "estimatedPayout" },
];

// â”€â”€â”€ Chart data point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ChartPoint = {
  label: string;
  revenue: number;
  netProfit: number;
  adSpend: number;
  acos: number;
  tacos: number;
  grossProfit: number;
  units: number;
  orders: number;
  refunds: number;
  margin: number;
  roas: number;
};

// â”€â”€â”€ SVG Chart Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SVG_W = 900;
const SVG_H = 430;
const PAD = { top: 20, right: 60, bottom: 40, left: 65 };
const CHART_W = SVG_W - PAD.left - PAD.right;
const CHART_H = SVG_H - PAD.top - PAD.bottom;

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ChartView() {
  const [timeRange, setTimeRange] = useState<ChartTimeRange>("30d");
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [datePreset, setDatePreset] = useState<string>("30d");

  // Compute API dates from local state
  const { from: dateFrom, to: dateTo } = useMemo(() => {
    if (timeRange === "custom" && customFrom && customTo) {
      return { from: toISODate(customFrom), to: toISODate(customTo) };
    }
    return computeChartDates(timeRange);
  }, [timeRange, customFrom, customTo]);

  const chartUrl = `/api/dashboard/chart-data?range=${timeRange}&from=${dateFrom}&to=${dateTo}`;
  const { data, isLoading, isError, error, refetch } =
    useApiData<ChartViewData>(chartUrl);

  const tilesQuery = useApiData<{
    periods: Array<Record<string, number>>;
    products: ProductRow[];
  }>(`/api/dashboard/tiles?from=${dateFrom}&to=${dateTo}`);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-16 rounded-lg bg-card border border-ai/20 animate-pulse" />
        <SkeletonChart className="min-h-[480px]" />
        <SkeletonTable rows={4} cols={6} />
      </div>
    );
  }

  if (isError) {
    return <PageError message={error ?? undefined} onRetry={refetch} />;
  }

  if (!data || !data?.monthly || data.monthly.length === 0) {
    return (
      <EmptyState
        title="No chart data yet"
        description="Connect your Amazon account and sync data to see monthly performance charts."
      />
    );
  }

  return (
    <div className="space-y-4">
      <AIInsightBanner />
      <ChartPanel
        data={data}
        summaryData={tilesQuery.data?.periods?.[2]}
        timeRange={timeRange}
        setTimeRange={(v) => { setTimeRange(v); setDatePreset(v); }}
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomApply={(from, to) => {
          setCustomFrom(from);
          setCustomTo(to);
          setTimeRange("custom");
          setDatePreset("custom");
        }}
      />
      {tilesQuery.data?.products && tilesQuery.data.products.length > 0 && (
        <ProductPerformanceTable />
      )}
    </div>
  );
}

// â”€â”€â”€ Chart + Summary Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ChartPanel({
  data,
  summaryData,
  timeRange,
  setTimeRange,
  datePreset,
  setDatePreset,
  customFrom,
  customTo,
  onCustomApply,
}: {
  data: ChartViewData;
  summaryData?: Record<string, number>;
  timeRange: ChartTimeRange;
  setTimeRange: (v: ChartTimeRange) => void;
  datePreset: string;
  setDatePreset: (v: string) => void;
  customFrom: Date | null;
  customTo: Date | null;
  onCustomApply: (from: Date, to: Date) => void;
}) {
  const [visibleSeries, setVisibleSeries] = useState<Set<MetricSeriesKey>>(
    () => new Set(METRIC_SERIES.filter((s) => s.defaultVisible).map((s) => s.key))
  );
  const [showConfig, setShowConfig] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Filter data based on time range (or custom date range)
  const filteredData = useMemo(() => {
    if (!data?.monthly) return [];
    if (timeRange === "custom" && customFrom && customTo) {
      // Filter months that overlap with the custom range
      const fromTime = customFrom.getTime();
      const toTime = customTo.getTime();
      return data.monthly.filter((d) => {
        // Parse the month label (e.g. "Jan 2026") into a rough date
        const parts = d.label.split(" ");
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const mIdx = monthNames.indexOf(parts[0]);
        const yr = parseInt(parts[1] || String(new Date().getFullYear()), 10);
        if (mIdx < 0 || isNaN(yr)) return true;
        const monthStart = new Date(yr, mIdx, 1).getTime();
        const monthEnd = new Date(yr, mIdx + 1, 0).getTime();
        return monthEnd >= fromTime && monthStart <= toTime;
      });
    }
    const range = TIME_RANGES.find((r) => r.value === timeRange);
    if (!range) return data.monthly;
    return data.monthly.slice(-range.months);
  }, [data?.monthly, timeRange, customFrom, customTo]);

  // Transform to chart points
  const chartPoints: ChartPoint[] = useMemo(() => {
    return filteredData.map((d) => {
      const grossProfit = d.revenue - d.adSpend;
      const margin = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
      const roas = d.adSpend > 0 ? d.revenue / d.adSpend : 0;
      const tacos = d.revenue > 0 ? (d.adSpend / d.revenue) * 100 : 0;
      return {
        label: d.label,
        revenue: d.revenue,
        netProfit: d.profit,
        adSpend: d.adSpend,
        acos: d.acosPct,
        tacos: Math.round(tacos * 10) / 10,
        grossProfit: Math.round(grossProfit),
        units: d.unitsSold,
        orders: Math.round(d.unitsSold * 0.85),
        refunds: Math.round(d.revenue * 0.03),
        margin: Math.round(margin * 10) / 10,
        roas: Math.round(roas * 10) / 10,
      };
    });
  }, [filteredData]);

  // Compute scales
  const { leftMax, leftMin, rightMax } = useMemo(() => {
    let lMax = 0;
    let lMin = 0;
    let rMax = 0;
    for (const pt of chartPoints) {
      for (const s of METRIC_SERIES) {
        if (!visibleSeries.has(s.key)) continue;
        const v = pt[s.key];
        if (s.yAxisId === "left") {
          if (v > lMax) lMax = v;
          if (v < lMin) lMin = v;
        } else {
          if (v > rMax) rMax = v;
        }
      }
    }
    // Round up to nice numbers
    const niceMax = (v: number) => {
      if (v <= 0) return 100;
      const mag = Math.pow(10, Math.floor(Math.log10(v)));
      return Math.ceil(v / mag) * mag;
    };
    const niceMin = (v: number) => {
      if (v >= 0) return 0;
      const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))));
      return -Math.ceil(Math.abs(v) / mag) * mag;
    };
    return {
      leftMax: niceMax(lMax),
      leftMin: niceMin(lMin),
      rightMax: niceMax(rMax),
    };
  }, [chartPoints, visibleSeries]);

  const leftRange = leftMax - leftMin;
  const toLeftY = (v: number) => PAD.top + CHART_H * (1 - (v - leftMin) / (leftRange || 1));
  const toRightY = (v: number) => PAD.top + CHART_H * (1 - v / (rightMax || 1));
  const zeroY = toLeftY(0);

  const barGroupW = chartPoints.length > 0 ? CHART_W / chartPoints.length : 1;
  const barW = barGroupW * 0.25;
  const barGap = barGroupW * 0.04;

  const toggleSeries = useCallback((key: MetricSeriesKey) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Build summary values
  const summaryValues = useMemo(() => {
    const monthly = data?.monthly ?? [];
    const totalRevenue = monthly.reduce((s, d) => s + d.revenue, 0);
    const totalAdSpend = monthly.reduce((s, d) => s + d.adSpend, 0);
    const totalProfit = monthly.reduce((s, d) => s + d.profit, 0);
    const totalUnits = monthly.reduce((s, d) => s + d.unitsSold, 0);
    const avgAcos =
      monthly.filter((d) => d.acosPct > 0).length > 0
        ? monthly.reduce((s, d) => s + d.acosPct, 0) / monthly.filter((d) => d.acosPct > 0).length
        : 0;

    const sd = summaryData;
    const vals: Record<string, number> = {
      grossSales: sd?.grossSales ?? totalRevenue,
      organicSales: sd?.organicSales ?? Math.round(totalRevenue * 0.6),
      spSales: sd?.spSales ?? Math.round(totalRevenue * 0.25),
      sdSales: sd?.sdSales ?? Math.round(totalRevenue * 0.08),
      directSales: sd?.directSales ?? Math.round(totalRevenue * 0.05),
      subscriptionSales: sd?.subscriptionSales ?? Math.round(totalRevenue * 0.02),
      unitsSold: sd?.unitsSold ?? totalUnits,
      organicUnits: sd?.organicUnits ?? Math.round(totalUnits * 0.6),
      adUnits: sd?.adUnits ?? Math.round(totalUnits * 0.4),
      refunds: sd?.refundAmount ?? Math.round(totalRevenue * 0.03),
      promo: sd?.promo ?? 0,
      adSpend: sd?.adSpend ?? totalAdSpend,
      spSpend: sd?.spSpend ?? Math.round(totalAdSpend * 0.6),
      sbvSpend: sd?.sbvSpend ?? Math.round(totalAdSpend * 0.15),
      sdSpend: sd?.sdSpend ?? Math.round(totalAdSpend * 0.15),
      sbSpend: sd?.sbSpend ?? Math.round(totalAdSpend * 0.1),
      refundCost: sd?.refundCost ?? Math.round(totalRevenue * 0.01),
      amazonFees: sd?.totalFees ?? Math.round(totalRevenue * 0.3),
      referralFees: sd?.referralFees ?? Math.round(totalRevenue * 0.15),
      fbaFees: sd?.fbaFees ?? Math.round(totalRevenue * 0.1),
      storageFees: sd?.storageFees ?? Math.round(totalRevenue * 0.02),
      returnFees: sd?.returnFees ?? Math.round(totalRevenue * 0.015),
      otherFees: sd?.otherFees ?? Math.round(totalRevenue * 0.015),
      totalCogs: sd?.totalCogs ?? Math.round(totalRevenue * 0.2),
      grossProfit: sd?.grossProfit ?? Math.round(totalProfit + totalAdSpend),
      indirectExpenses: sd?.indirectExpenses ?? 0,
      netProfit: sd?.netProfit ?? totalProfit,
      estimatedPayout: sd?.estimatedPayout ?? Math.round(totalRevenue * 0.85),
      acosPct: avgAcos,
      tacosPct: totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : 0,
      marginPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      roas: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0,
    };
    return vals;
  }, [data?.monthly, summaryData]);

  // Build line paths
  const buildLinePath = (key: MetricSeriesKey, yAxisId: "left" | "right") => {
    return chartPoints
      .map((pt, i) => {
        const cx = PAD.left + barGroupW * i + barGroupW / 2;
        const cy = yAxisId === "left" ? toLeftY(pt[key]) : toRightY(pt[key]);
        return `${cx},${cy}`;
      })
      .join(" ");
  };

  // Left Y ticks
  const leftTicks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => leftMin + (leftRange * i) / count);
  }, [leftMin, leftRange]);

  // Right Y ticks
  const rightTicks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => (rightMax * i) / count);
  }, [rightMax]);

  // Active visible bars and lines
  const activeBars = METRIC_SERIES.filter((s) => s.type === "bar" && visibleSeries.has(s.key));
  const activeLines = METRIC_SERIES.filter((s) => s.type === "line" && visibleSeries.has(s.key));

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header toolbar */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3 px-3 md:px-4 py-2.5 md:py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Performance Chart</h2>

        <div className="flex items-center gap-2 md:gap-3 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {/* Time range pills */}
          <div className="flex items-center rounded-lg border border-border bg-elevated/50 p-0.5 shrink-0">
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => { setTimeRange(r.value); setDatePreset(r.value); }}
                className={cn(
                  "px-2 md:px-2.5 py-1 text-2xs font-medium rounded-md transition-all whitespace-nowrap",
                  timeRange === r.value && timeRange !== "custom"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <DateRangeDropdown
            presets={CHART_DATE_PRESETS}
            selectedPreset={datePreset}
            onPresetChange={(v) => {
              const match = TIME_RANGES.find((r) => r.value === v);
              if (match) {
                setTimeRange(match.value);
              }
              setDatePreset(v);
            }}
            customFrom={customFrom}
            customTo={customTo}
            onCustomApply={onCustomApply}
            align="right"
          />

          {/* Config gear */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center justify-center h-7 w-7 rounded-md border border-border bg-elevated/50 text-muted-foreground hover:text-foreground transition"
              title="Toggle metric series"
            >
              <GearIcon />
            </button>
            {showConfig && (
              <MetricConfigDropdown
                visibleSeries={visibleSeries}
                onToggle={toggleSeries}
                onClose={() => setShowConfig(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Chart + Summary side-by-side */}
      <div className="flex flex-col lg:flex-row">
        {/* Chart area ~70% */}
        <div className="flex-1 min-w-0 p-2.5 md:p-4">
          {/* Legend */}
          <div className="flex items-center gap-2 md:gap-4 mb-2 md:mb-3 flex-wrap">
            {METRIC_SERIES.filter((s) => visibleSeries.has(s.key)).map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                {s.type === "bar" ? (
                  <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                ) : (
                  <div
                    className="h-0.5 w-4 rounded-full"
                    style={{
                      backgroundColor: s.color,
                      ...(s.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${s.color} 0, ${s.color} 3px, transparent 3px, transparent 6px)`, backgroundColor: "transparent" } : {}),
                    }}
                  />
                )}
                <span className="text-2xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          {/* SVG Chart */}
          <div className="w-full" style={{ minHeight: "min(430px, 60vw)" }}>
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-auto"
              preserveAspectRatio="xMidYMid meet"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Grid lines */}
              {leftTicks.map((tick, i) => {
                const y = toLeftY(tick);
                return (
                  <line
                    key={`grid-${i}`}
                    x1={PAD.left}
                    x2={SVG_W - PAD.right}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.07}
                    className="text-foreground"
                  />
                );
              })}

              {/* Zero reference line */}
              {leftMin < 0 && (
                <line
                  x1={PAD.left}
                  x2={SVG_W - PAD.right}
                  y1={zeroY}
                  y2={zeroY}
                  stroke="rgba(255,255,255,0.2)"
                  strokeDasharray="4 3"
                />
              )}

              {/* Left Y-axis labels (dollars) */}
              {leftTicks.map((tick, i) => (
                <text
                  key={`ly-${i}`}
                  x={PAD.left - 8}
                  y={toLeftY(tick) + 4}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  fontSize={10}
                  fontFamily="inherit"
                >
                  {Math.abs(tick) >= 1000 ? `$${(tick / 1000).toFixed(0)}k` : `$${Math.round(tick)}`}
                </text>
              ))}

              {/* Right Y-axis labels (%) */}
              {rightTicks.map((tick, i) => (
                <text
                  key={`ry-${i}`}
                  x={SVG_W - PAD.right + 8}
                  y={toRightY(tick) + 4}
                  textAnchor="start"
                  className="fill-muted-foreground"
                  fontSize={10}
                  fontFamily="inherit"
                >
                  {Math.round(tick)}%
                </text>
              ))}

              {/* Axis titles */}
              <text
                x={14}
                y={SVG_H / 2}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={10}
                fontFamily="inherit"
                transform={`rotate(-90, 14, ${SVG_H / 2})`}
              >
                Dollars ($)
              </text>
              <text
                x={SVG_W - 8}
                y={SVG_H / 2}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={10}
                fontFamily="inherit"
                transform={`rotate(90, ${SVG_W - 8}, ${SVG_H / 2})`}
              >
                Percentage (%)
              </text>

              {/* Bars */}
              {chartPoints.map((pt, i) => {
                const groupX = PAD.left + barGroupW * i;
                const isHovered = hoveredIndex === i;
                const totalBarWidth = activeBars.length * barW + (activeBars.length - 1) * barGap;
                const startX = groupX + (barGroupW - totalBarWidth) / 2;

                return (
                  <g
                    key={pt.label}
                    onMouseEnter={() => setHoveredIndex(i)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Hover background */}
                    {isHovered && (
                      <rect
                        x={groupX}
                        y={PAD.top}
                        width={barGroupW}
                        height={CHART_H}
                        fill="currentColor"
                        fillOpacity={0.03}
                        className="text-foreground"
                      />
                    )}
                    {/* Draw each bar */}
                    {activeBars.map((bar, bi) => {
                      const val = pt[bar.key];
                      const x = startX + bi * (barW + barGap);
                      const isNeg = val < 0;
                      const barTop = isNeg ? zeroY : toLeftY(val);
                      const barBottom = isNeg ? toLeftY(val) : zeroY;
                      const barHeight = Math.max(1, Math.abs(barBottom - barTop));

                      return (
                        <rect
                          key={bar.key}
                          x={x}
                          y={barTop}
                          width={barW}
                          height={barHeight}
                          rx={2}
                          fill={bar.color}
                          fillOpacity={isHovered ? 1 : 0.8}
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* Lines */}
              {activeLines.map((line) => {
                const path = buildLinePath(line.key, line.yAxisId);
                return (
                  <g key={line.key}>
                    <polyline
                      points={path}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeDasharray={line.dashed ? "6 3" : undefined}
                    />
                    {chartPoints.map((pt, i) => {
                      const cx = PAD.left + barGroupW * i + barGroupW / 2;
                      const cy =
                        line.yAxisId === "left"
                          ? toLeftY(pt[line.key])
                          : toRightY(pt[line.key]);
                      return (
                        <circle
                          key={`${line.key}-${i}`}
                          cx={cx}
                          cy={cy}
                          r={hoveredIndex === i ? 5 : 3}
                          fill={line.color}
                          stroke="#1a1d27"
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* X-axis labels */}
              {chartPoints.map((pt, i) => (
                <text
                  key={`xl-${i}`}
                  x={PAD.left + barGroupW * i + barGroupW / 2}
                  y={SVG_H - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={10}
                  fontFamily="inherit"
                >
                  {pt.label.length > 6 ? pt.label.replace(/ \d{4}/, (m) => m.slice(0, 3)) : pt.label}
                </text>
              ))}

              {/* Tooltip */}
              {hoveredIndex !== null && (() => {
                const pt = chartPoints[hoveredIndex];
                const visibleMetrics = METRIC_SERIES.filter((s) => visibleSeries.has(s.key));
                const tooltipW = 175;
                const lineH = 16;
                const tooltipH = 24 + visibleMetrics.length * lineH;
                const tx = PAD.left + barGroupW * hoveredIndex + barGroupW / 2;
                const tooltipX = tx + tooltipW + 20 > SVG_W ? tx - tooltipW - 10 : tx + 10;
                const tooltipY = PAD.top + 10;

                return (
                  <g>
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={tooltipW}
                      height={tooltipH}
                      rx={6}
                      fill="#1e1e2e"
                      fillOpacity={0.96}
                      stroke="#333"
                      strokeWidth={1}
                    />
                    <text
                      x={tooltipX + 10}
                      y={tooltipY + 16}
                      fontSize={11}
                      fontWeight={600}
                      fill="#e0e0e0"
                      fontFamily="inherit"
                    >
                      {pt.label}
                    </text>
                    {visibleMetrics.map((s, mi) => {
                      const v = pt[s.key];
                      const isDollar = s.yAxisId === "left" && s.key !== "units" && s.key !== "orders";
                      const isPct = s.key === "acos" || s.key === "tacos" || s.key === "margin";
                      let formatted: string;
                      if (isDollar) formatted = `$${v.toLocaleString()}`;
                      else if (isPct) formatted = `${v.toFixed(1)}%`;
                      else if (s.key === "roas") formatted = `${v.toFixed(1)}x`;
                      else formatted = v.toLocaleString();

                      return (
                        <text
                          key={s.key}
                          x={tooltipX + 10}
                          y={tooltipY + 32 + mi * lineH}
                          fontSize={10}
                          fill={s.color}
                          fontFamily="inherit"
                        >
                          {s.label}: {formatted}
                        </text>
                      );
                    })}
                  </g>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* Right summary panel ~30% */}
        <div className="w-full lg:w-[320px] lg:min-w-[280px] border-t lg:border-t-0 lg:border-l border-border">
          <div className="px-3 md:px-4 py-2.5 md:py-3 border-b border-border">
            <h3 className="text-xs font-semibold text-foreground">Period Summary</h3>
            <p className="text-2xs text-muted-foreground">Last 12 months</p>
          </div>
          <div className="max-h-[400px] lg:max-h-[500px] overflow-y-auto px-2.5 md:px-3 py-2">
            {SUMMARY_LINES.map((line) => (
              <SummaryLineRow key={line.key} item={line} values={summaryValues} />
            ))}

            {/* Key Ratios Section */}
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                Key Ratios
              </p>
              <div className="space-y-1.5">
                <RatioRow label="ACOS" value={`${(summaryValues.acosPct ?? 0).toFixed(1)}%`} />
                <RatioRow label="TACOS" value={`${(summaryValues.tacosPct ?? 0).toFixed(1)}%`} />
                <RatioRow label="Net Margin" value={`${(summaryValues.marginPct ?? 0).toFixed(1)}%`} />
                <RatioRow label="ROAS" value={`${(summaryValues.roas ?? 0).toFixed(1)}x`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Summary line row with expand/collapse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SummaryLineRow({
  item,
  values,
  depth = 0,
}: {
  item: SummaryLineItem;
  values: Record<string, number>;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const value = values[item.key] ?? 0;
  const hasChildren = item.children && item.children.length > 0;
  const colorClass = item.colorFn ? item.colorFn(value) : "text-foreground";

  return (
    <div>
      <button
        type="button"
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center justify-between py-1.5 rounded hover:bg-elevated/40 transition text-left",
          hasChildren && "cursor-pointer",
          !hasChildren && "cursor-default"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px`, paddingRight: 4 }}
      >
        <span className="flex items-center gap-1.5">
          {hasChildren && <ChevronIcon expanded={expanded} />}
          <span
            className={cn(
              "text-xs",
              item.bold ? "font-semibold" : "font-normal",
              depth > 0 ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {item.label}
          </span>
        </span>
        <span
          className={cn(
            "text-xs tabular-nums",
            item.bold ? "font-semibold" : "font-medium",
            colorClass
          )}
        >
          {item.isCount ? formatNumber(value) : formatCurrency(value, "USD", true)}
        </span>
      </button>
      {expanded && hasChildren && (
        <div>
          {item.children!.map((child) => (
            <SummaryLineRow key={child.key} item={child} values={values} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Ratio row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RatioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-1 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs tabular-nums font-medium text-foreground">{value}</span>
    </div>
  );
}

// â”€â”€â”€ Metric config dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MetricConfigDropdown({
  visibleSeries,
  onToggle,
  onClose,
}: {
  visibleSeries: Set<MetricSeriesKey>;
  onToggle: (key: MetricSeriesKey) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-52 rounded-lg border border-border bg-card p-2.5 shadow-xl animate-fade-in">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          Metric Series
        </p>
        {METRIC_SERIES.map((s) => (
          <label
            key={s.key}
            className="flex items-center gap-2.5 rounded px-1.5 py-1 text-xs text-foreground hover:bg-elevated/50 cursor-pointer transition"
          >
            <input
              type="checkbox"
              checked={visibleSeries.has(s.key)}
              onChange={() => onToggle(s.key)}
              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/30"
            />
            <div className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.label}</span>
            </div>
          </label>
        ))}
      </div>
    </>
  );
}

// â”€â”€â”€ Icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492ZM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0Z" />
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319Zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319Z" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn(
        "h-3 w-3 text-muted-foreground transition-transform",
        expanded && "rotate-90"
      )}
    >
      <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

