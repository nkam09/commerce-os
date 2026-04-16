"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { useApiData } from "@/hooks/use-api-data";
import { PageError } from "@/components/shared/error";
import { EmptyState } from "@/components/shared/empty-state";
import { SkeletonMetricCard } from "@/components/ui/skeleton-loader";
import { DateRangeDropdown } from "@/components/ui/date-range-dropdown";
import { PeriodSummaryCard } from "./period-summary-card";
import { ProductPerformanceTable } from "./product-performance-table";
import { AIInsightBanner } from "./ai-insight-banner";
import { pacificDateStr, subDays, parseYearMonth, toISODate } from "@/lib/utils/pacific-date";
import { useBrandParam } from "@/lib/stores/brand-store";
import type { DashboardTilesData, PeriodMetrics, TilesCombo } from "@/lib/services/dashboard-tiles-service";

// ─── Combo options ─────────────────────────────────────────────────────────

const DATE_RANGE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 14 days", value: "14d" },
  { label: "Last 30 days", value: "30d" },
  { label: "MTD", value: "mtd" },
  { label: "Last month", value: "last_month" },
  { label: "Last 3 months", value: "3m" },
];

function computePresetDates(preset: string): { from: string; to: string } | null {
  const today = pacificDateStr();
  const { year, month } = parseYearMonth(today);
  switch (preset) {
    case "today": return { from: today, to: today };
    case "yesterday": { const y = subDays(today, 1); return { from: y, to: y }; }
    case "7d": return { from: subDays(today, 6), to: today };
    case "14d": return { from: subDays(today, 13), to: today };
    case "30d": return { from: subDays(today, 29), to: today };
    case "mtd": return { from: toISODate(new Date(Date.UTC(year, month, 1))), to: today };
    case "last_month": {
      const firstOfLastMonth = new Date(Date.UTC(year, month - 1, 1));
      const lastOfLastMonth = new Date(Date.UTC(year, month, 0));
      return { from: toISODate(firstOfLastMonth), to: toISODate(lastOfLastMonth) };
    }
    case "3m": return { from: subDays(today, 89), to: today };
    default: return null;
  }
}

const COMBO_OPTIONS: { value: TilesCombo; label: string }[] = [
  { value: "default", label: "Standard" },
  { value: "days", label: "Daily Compare" },
  { value: "weeks", label: "Weekly Compare" },
  { value: "months", label: "Monthly Compare" },
  { value: "quarters", label: "Quarterly Compare" },
];

/** Map period keys to their comparison period for % change badges */
const COMPARISON_MAPS: Record<TilesCombo, Record<string, string>> = {
  default: { mtd: "prior_mtd", forecast: "last_month" },
  days: { last_7: "last_14", last_14: "last_30" },
  weeks: { this_week: "week_1", week_1: "week_2", week_2: "week_3" },
  months: { mtd: "prior_mtd", last_month: "month_2", month_2: "month_3" },
  quarters: { quarter_0: "quarter_1", quarter_1: "quarter_2" },
};

export function DashboardTilesView() {
  const [combo, setCombo] = useState<TilesCombo>("default");
  const [, setDrawerProductId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<string>("30d");
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const bp = useBrandParam();

  const tilesUrl = `/api/dashboard/tiles?combo=${combo}${bp}`;

  const { data, isLoading, isError, error, refetch } =
    useApiData<DashboardTilesData>(tilesUrl);

  // Compute date range for the extra period card
  const extraDates = useMemo(() => {
    if (datePreset === "custom" && customFrom && customTo) {
      return { from: toISODate(customFrom), to: toISODate(customTo) };
    }
    return computePresetDates(datePreset);
  }, [datePreset, customFrom, customTo]);

  const extraUrl = extraDates
    ? `/api/dashboard/tiles?combo=default&from=${extraDates.from}&to=${extraDates.to}${bp}`
    : null;

  if (extraUrl && extraDates) {
    console.log("[tiles-custom] fetching for:", { from: extraDates.from, to: extraDates.to });
  }

  const extraQuery = useApiData<DashboardTilesData>(extraUrl ?? "");

  // Build comparison map based on combo
  const comparisonMap = useMemo(() => {
    if (!data) return {};
    const byKey = new Map(data.periods.map((p) => [p.periodKey, p]));
    const compMap = COMPARISON_MAPS[combo] ?? {};
    const result: Record<string, PeriodMetrics | null> = {};
    for (const period of data.periods) {
      const compKey = compMap[period.periodKey];
      result[period.periodKey] = compKey ? byKey.get(compKey) ?? null : null;
    }
    return result;
  }, [data, combo]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-14 rounded-lg bg-ai-muted animate-skeleton-pulse" />
        <div className="flex items-center gap-2 mb-4">
          {COMBO_OPTIONS.map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-md bg-muted animate-skeleton-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonMetricCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return <PageError message={error ?? undefined} onRetry={refetch} />;
  }

  if (!data) {
    return <EmptyState title="No dashboard data" description="Connect your Amazon account to start seeing data." />;
  }

  return (
    <div className="space-y-6">
      <AIInsightBanner page="dashboard" />

      {/* Combo selector + Date Range */}
      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-elevated/50 rounded-lg p-1 w-full md:w-fit border border-border overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {COMBO_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCombo(opt.value)}
              className={cn(
                "px-2.5 md:px-3 py-1.5 text-xs rounded-md transition-all font-medium whitespace-nowrap shrink-0",
                combo === opt.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <DateRangeDropdown
          presets={DATE_RANGE_PRESETS}
          selectedPreset={datePreset}
          onPresetChange={(v) => setDatePreset(v)}
          customFrom={customFrom}
          customTo={customTo}
          onCustomApply={(from, to) => {
            setCustomFrom(from);
            setCustomTo(to);
            setDatePreset("custom");
          }}
        />
      </div>

      {/* Period Summary Cards — prior_mtd is comparison-only, hidden */}
      {(() => {
        const visiblePeriods = data.periods.filter((p) => p.periodKey !== "prior_mtd");
        return (
          <div className={cn(
            "grid gap-3 md:gap-4",
            visiblePeriods.length <= 3
              ? "grid-cols-2 sm:grid-cols-3"
              : visiblePeriods.length === 4
              ? "grid-cols-2 lg:grid-cols-4"
              : "grid-cols-2 lg:grid-cols-5",
          )}>
            {visiblePeriods.map((period) => (
              <PeriodSummaryCard
                key={period.periodKey}
                period={period}
                comparisonPeriod={comparisonMap[period.periodKey] ?? null}
              />
            ))}
          </div>
        );
      })()}

      {/* Extra period card from date range selection */}
      {extraDates && extraQuery.data && extraQuery.data.periods.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {extraQuery.data.periods.slice(0, 1).map((period) => {
            // Build a human-readable label showing the actual date range
            const rangeLabel = (() => {
              const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              const fd = new Date(extraDates.from + "T00:00:00");
              const td = new Date(extraDates.to + "T00:00:00");
              const sameYear = fd.getFullYear() === td.getFullYear();
              const fromStr = `${SHORT[fd.getMonth()]} ${fd.getDate()}`;
              const toStr = sameYear
                ? `${SHORT[td.getMonth()]} ${td.getDate()}, ${td.getFullYear()}`
                : `${SHORT[td.getMonth()]} ${td.getDate()}, ${td.getFullYear()}`;
              return `${fromStr} \u2013 ${toStr}`;
            })();

            const presetLabel = DATE_RANGE_PRESETS.find((p) => p.value === datePreset)?.label;
            const cardLabel = datePreset === "custom"
              ? rangeLabel
              : presetLabel
                ? `${presetLabel} (${rangeLabel})`
                : rangeLabel;

            return (
              <PeriodSummaryCard
                key={`extra-${period.periodKey}`}
                period={{
                  ...period,
                  label: cardLabel,
                }}
                comparisonPeriod={null}
              />
            );
          })}
        </div>
      )}

      {/* Product Performance Table */}
      <ProductPerformanceTable
        onRowClick={(p) => setDrawerProductId(p.id)}
      />
    </div>
  );
}
