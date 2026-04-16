"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { useApiData } from "@/hooks/use-api-data";
import type {
  RankTrackingProduct,
  RankTrackingKeyword,
} from "@/lib/services/rank-tracking-service";

// ─── Types for API response ─────────────────────────────────────────────────

type RankTrackingResponse = {
  products: RankTrackingProduct[];
  product: RankTrackingProduct;
  keywords: RankTrackingKeyword[];
};

type DateRange = "last7" | "last30" | "last90";

// ─── Page ───────────────────────────────────────────────────────────────────

export default function RankTrackingPage() {
  const [selectedAsin, setSelectedAsin] = useState("B0EXAMPLE1");
  const [dateRange, setDateRange] = useState<DateRange>("last30");

  const apiUrl = `/api/rank-tracking?asin=${selectedAsin}&dateRange=${dateRange}`;
  const { data, isLoading, isError, error, refetch } =
    useApiData<RankTrackingResponse>(apiUrl);

  // Group keywords by zone
  const grouped = useMemo(() => {
    if (!data?.keywords) return null;
    const branded = data.keywords.filter((k) => k.zone === "branded");
    const primary = data.keywords.filter((k) => k.zone === "primary");
    const longTail = data.keywords.filter((k) => k.zone === "long-tail");
    return { branded, primary, longTail };
  }, [data?.keywords]);

  // ─── Loading ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4 p-1">
        <div className="flex items-center gap-3">
          <div className="h-9 w-64 rounded-md bg-card border border-border animate-pulse" />
          <div className="h-9 w-36 rounded-md bg-card border border-border animate-pulse" />
        </div>
        <div className="h-[400px] rounded-lg bg-card border border-border animate-pulse" />
        <div className="h-[300px] rounded-lg bg-card border border-border animate-pulse" />
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">
          {error ?? "Failed to load rank tracking data."}
        </p>
        <button
          onClick={refetch}
          className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || !grouped) return null;

  return (
    <div className="space-y-5 p-1">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">
            Keywords / Rank Tracking
          </h1>
          <p className="text-2xs text-muted-foreground mt-0.5">
            Track organic and sponsored keyword rankings across your catalog
          </p>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Product selector */}
        <select
          value={selectedAsin}
          onChange={(e) => setSelectedAsin(e.target.value)}
          className="h-9 rounded-md border border-border bg-elevated px-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary min-w-[280px]"
        >
          {data.products.map((p) => (
            <option key={p.asin} value={p.asin}>
              {p.asin} — {p.title}
            </option>
          ))}
        </select>

        {/* Date range */}
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          className="h-9 rounded-md border border-border bg-elevated px-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="last7">Last 7 days</option>
          <option value="last30">Last 30 days</option>
          <option value="last90">Last 90 days</option>
        </select>

        <div className="flex-1" />

        {/* Product title display */}
        <span className="text-xs font-medium text-muted-foreground">
          {data.product.title}
        </span>
      </div>

      {/* Rank Color Legend */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-2xs text-muted-foreground whitespace-nowrap mr-1">
          Rank:
        </span>
        {RANK_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-1 shrink-0">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Keyword Table */}
      <KeywordRankTable
        grouped={grouped}
        dateRange={dateRange}
      />

      {/* Heatmap Grid */}
      <HeatmapGrid
        keywords={data.keywords}
        dateRange={dateRange}
      />
    </div>
  );
}

// ─── Rank Legend ─────────────────────────────────────────────────────────────

const RANK_LEGEND = [
  { label: "1-10", color: "#22c55e" },
  { label: "11-20", color: "#86efac" },
  { label: "21-50", color: "#eab308" },
  { label: "51-100", color: "#f97316" },
  { label: "100+", color: "#ef4444" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatVolume(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function rankChangeDisplay(change: number) {
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-green-400 font-medium">
        <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="currentColor">
          <path d="M5 1L9 6H1L5 1Z" />
        </svg>
        {change}
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-400 font-medium">
        <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="currentColor">
          <path d="M5 9L1 4H9L5 9Z" />
        </svg>
        {Math.abs(change)}
      </span>
    );
  }
  return <span className="text-muted-foreground">&mdash;</span>;
}

// ─── Keyword Rank Table ─────────────────────────────────────────────────────

type GroupedKeywords = {
  branded: RankTrackingKeyword[];
  primary: RankTrackingKeyword[];
  longTail: RankTrackingKeyword[];
};

function KeywordRankTable({
  grouped,
}: {
  grouped: GroupedKeywords;
  dateRange: DateRange;
}) {
  const zones: { label: string; keywords: RankTrackingKeyword[] }[] = [
    { label: "Branded Keywords", keywords: grouped.branded },
    { label: "Primary Keywords", keywords: grouped.primary },
    { label: "Long-tail Keywords", keywords: grouped.longTail },
  ];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="px-3 py-2.5 text-left text-2xs font-medium text-muted-foreground uppercase tracking-wider min-w-[260px]">
                Keyword
              </th>
              <th className="px-3 py-2.5 text-right text-2xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Search Vol
              </th>
              <th className="px-3 py-2.5 text-right text-2xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Current
              </th>
              <th className="px-3 py-2.5 text-right text-2xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Best
              </th>
              <th className="px-3 py-2.5 text-right text-2xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Worst
              </th>
              <th className="px-3 py-2.5 text-right text-2xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Avg (30d)
              </th>
              <th className="px-3 py-2.5 text-center text-2xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Change
              </th>
              <th className="px-3 py-2.5 text-right text-2xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Sponsored
              </th>
            </tr>
          </thead>
          <tbody>
            {zones.map((zone) => (
              <ZoneSection
                key={zone.label}
                label={zone.label}
                keywords={zone.keywords}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ZoneSection({
  label,
  keywords,
}: {
  label: string;
  keywords: RankTrackingKeyword[];
}) {
  return (
    <>
      {/* Section header */}
      <tr className="bg-elevated/30">
        <td
          colSpan={8}
          className="px-3 py-2 text-2xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border"
        >
          {label}
          <span className="ml-2 text-tertiary font-normal">
            ({keywords.length})
          </span>
        </td>
      </tr>
      {/* Keyword rows */}
      {keywords.map((kw) => (
        <tr
          key={kw.id}
          className="border-b border-border hover:bg-elevated/20 transition-colors"
        >
          <td className="px-3 py-2.5">
            <span className="text-xs font-medium text-foreground">
              {kw.keyword}
            </span>
          </td>
          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
            {formatVolume(kw.searchVolume)}
          </td>
          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
            <span
              className={cn(
                kw.currentRank !== null && kw.currentRank <= 10
                  ? "text-green-400"
                  : kw.currentRank !== null && kw.currentRank <= 20
                    ? "text-green-300"
                    : kw.currentRank !== null && kw.currentRank <= 50
                      ? "text-yellow-400"
                      : "text-foreground",
              )}
            >
              {kw.currentRank ?? "\u2014"}
            </span>
          </td>
          <td className="px-3 py-2.5 text-right tabular-nums text-green-400">
            {kw.bestRank}
          </td>
          <td className="px-3 py-2.5 text-right tabular-nums text-red-400">
            {kw.worstRank}
          </td>
          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
            {kw.avgRank30d}
          </td>
          <td className="px-3 py-2.5 text-center tabular-nums">
            {rankChangeDisplay(kw.rankChange)}
          </td>
          <td className="px-3 py-2.5 text-right tabular-nums text-blue-400">
            {kw.sponsoredRank ?? "\u2014"}
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Heatmap Grid ───────────────────────────────────────────────────────────

function getHeatmapColor(rank: number | null): string {
  if (rank === null) return "rgba(100,100,100,0.2)";
  if (rank <= 10) return "#22c55e";
  if (rank <= 20) return "#86efac";
  if (rank <= 50) return "#eab308";
  if (rank <= 100) return "#f97316";
  return "#ef4444";
}

function getHeatmapTextColor(rank: number | null): string {
  if (rank === null) return "var(--muted-foreground)";
  if (rank <= 10) return "#ffffff";
  if (rank <= 20) return "#052e16";
  if (rank <= 50) return "#422006";
  return "#ffffff";
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function HeatmapGrid({
  keywords,
  dateRange,
}: {
  keywords: RankTrackingKeyword[];
  dateRange: DateRange;
}) {
  if (keywords.length === 0) return null;

  // Use dates from first keyword's heatmap
  const dates = keywords[0].heatmap.map((c) => c.date);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">
        Daily Rank Heatmap
        <span className="ml-2 text-2xs font-normal text-muted-foreground">
          ({dateRange === "last7" ? "7" : dateRange === "last30" ? "30" : "90"} days)
        </span>
      </h2>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-[10px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {/* Keyword column header */}
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-2xs font-medium text-muted-foreground min-w-[220px] border-r border-border">
                  Keyword
                </th>
                {/* Date headers */}
                {dates.map((date) => (
                  <th
                    key={date}
                    className="px-0 py-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                    style={{ minWidth: 32 }}
                  >
                    {formatDateShort(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keywords.map((kw) => (
                <tr key={kw.id}>
                  {/* Keyword name */}
                  <td className="sticky left-0 z-10 bg-card px-3 py-1 text-xs font-medium text-foreground truncate max-w-[220px] border-r border-border">
                    {kw.keyword}
                  </td>
                  {/* Rank cells */}
                  {kw.heatmap.map((cell, idx) => (
                    <td key={idx} className="px-0 py-0.5">
                      <div
                        className="flex items-center justify-center rounded-sm mx-0.5"
                        style={{
                          width: 28,
                          height: 24,
                          backgroundColor: getHeatmapColor(cell.rank),
                          color: getHeatmapTextColor(cell.rank),
                        }}
                        title={`${kw.keyword} | ${cell.date} | Rank: ${cell.rank ?? "N/A"}`}
                      >
                        <span className="text-[9px] font-bold tabular-nums leading-none">
                          {cell.rank ?? "\u2013"}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
