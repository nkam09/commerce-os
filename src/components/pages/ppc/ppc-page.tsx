"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  createColumnHelper, flexRender, type SortingState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils/cn";
import { DateRangeDropdown } from "@/components/ui/date-range-dropdown";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { PPCChart } from "./ppc-chart";
import { PPCSummaryPanel } from "./ppc-summary-panel";
import { PPCFilterPanel, DEFAULT_FILTERS, type PPCFilters } from "./ppc-filters";
import { CampaignDetailPanel } from "./campaign-detail-panel";
import type { PPCSummaryMetrics, CampaignRow, PPCChartDataPoint, ByProductRow, CampaignProductBreakdown } from "@/lib/services/ppc-service";

// ─── Constants ───────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 14 days", value: "14d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last 6 months", value: "6m" },
  { label: "Last 12 months", value: "12m" },
];

type TabId = "campaigns" | "byproduct" | "allperiods";

const TABS: { id: TabId; label: string }[] = [
  { id: "campaigns", label: "Campaigns" },
  { id: "byproduct", label: "By Product" },
  { id: "allperiods", label: "All Periods" },
];

// ─── Date helpers ────────────────────────────────────────────────────────────

function computeDates(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const daysMap: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90, "6m": 180, "12m": 365 };
  const days = daysMap[preset] ?? 30;
  const from = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtD = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtP = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
const fmtI = (v: number) => v.toLocaleString("en-US");
const fmtR = (v: number | null) => v != null ? `${v.toFixed(2)}x` : "—";

// ─── CSV export ──────────────────────────────────────────────────────────────

function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => {
      const v = r[h];
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Campaign columns ────────────────────────────────────────────────────────

const cc = createColumnHelper<CampaignRow>();
const campaignColumns = [
  cc.display({ id: "expand", header: "", size: 36, cell: ({ row }) => (
    <button onClick={() => row.toggleExpanded()} className="p-1 text-muted-foreground hover:text-foreground">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className={cn("transition-transform", row.getIsExpanded() && "rotate-90")}><path d="M3 1l4 4-4 4" /></svg>
    </button>
  )}),
  cc.accessor("campaignName", { header: "Campaign", cell: (i) => <div className="max-w-[260px] truncate font-medium text-primary hover:underline cursor-pointer" title={`Click for details: ${i.getValue()}`}>{i.getValue()}</div>, size: 260 }),
  cc.accessor("campaignType", { header: "Type", cell: (i) => { const t = i.getValue(); const c: Record<string, string> = { SP: "bg-blue-500/20 text-blue-400", SB: "bg-purple-500/20 text-purple-400", SD: "bg-amber-500/20 text-amber-400", SBV: "bg-green-500/20 text-green-400" }; return <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold uppercase", c[t] ?? "bg-gray-500/20 text-gray-400")}>{t}</span>; }, size: 60 }),
  cc.accessor("status", { header: "Status", cell: (i) => { const s = i.getValue(); const c = s === "ENABLED" ? "text-green-400" : s === "PAUSED" ? "text-amber-400" : "text-gray-500"; return <span className={cn("text-xs capitalize", c)}>{s.toLowerCase()}</span>; }, size: 80 }),
  cc.accessor("adSpend", { header: "Ad Spend", cell: (i) => <span className="tabular-nums">{fmtD(i.getValue())}</span>, size: 100 }),
  cc.accessor("ppcSales", { header: "Sales", cell: (i) => <span className="tabular-nums">{fmtD(i.getValue())}</span>, size: 100 }),
  cc.accessor("acos", { header: "ACOS", cell: (i) => { const v = i.getValue(); if (v == null) return <span className="text-muted-foreground">—</span>; return <span className={cn("tabular-nums font-medium", v < 20 ? "text-green-400" : v < 35 ? "text-amber-400" : "text-red-400")}>{v.toFixed(1)}%</span>; }, size: 80 }),
  cc.accessor("profit", { header: "Profit", cell: (i) => <span className={cn("tabular-nums font-medium", i.getValue() >= 0 ? "text-green-400" : "text-red-400")}>{fmtD(i.getValue())}</span>, size: 100 }),
  cc.accessor("impressions", { header: "Impr", cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>, size: 80 }),
  cc.accessor("clicks", { header: "Clicks", cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>, size: 70 }),
  cc.accessor("cpc", { header: "CPC", cell: (i) => <span className="tabular-nums">{i.getValue() != null ? `$${i.getValue()!.toFixed(2)}` : "—"}</span>, size: 65 }),
  cc.accessor("orders", { header: "Orders", cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>, size: 65 }),
  cc.accessor("roas", { header: "ROAS", cell: (i) => <span className="tabular-nums">{fmtR(i.getValue())}</span>, size: 65 }),
];

// ─── By Product columns ──────────────────────────────────────────────────────

const pc = createColumnHelper<ByProductRow>();
const productColumns = [
  pc.accessor("asin", { header: "ASIN", cell: (i) => <span className="font-mono text-xs text-foreground">{i.getValue()}</span>, size: 120 }),
  pc.accessor("title", { header: "Product", cell: (i) => <div className="max-w-[240px] truncate text-foreground">{i.getValue()}</div>, size: 240 }),
  pc.accessor("campaignCount", { header: "Campaigns", cell: (i) => <span className="tabular-nums">{i.getValue()}</span>, size: 80 }),
  pc.accessor("adSpend", { header: "Ad Spend", cell: (i) => <span className="tabular-nums">{fmtD(i.getValue())}</span>, size: 100 }),
  pc.accessor("ppcSales", { header: "Sales", cell: (i) => <span className="tabular-nums">{fmtD(i.getValue())}</span>, size: 100 }),
  pc.accessor("acos", { header: "ACOS", cell: (i) => { const v = i.getValue(); if (v == null) return "—"; return <span className={cn("tabular-nums font-medium", v < 20 ? "text-green-400" : v < 35 ? "text-amber-400" : "text-red-400")}>{v.toFixed(1)}%</span>; }, size: 80 }),
  pc.accessor("profit", { header: "Profit", cell: (i) => <span className={cn("tabular-nums font-medium", i.getValue() >= 0 ? "text-green-400" : "text-red-400")}>{fmtD(i.getValue())}</span>, size: 100 }),
  pc.accessor("orders", { header: "Orders", cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>, size: 65 }),
  pc.accessor("roas", { header: "ROAS", cell: (i) => <span className="tabular-nums">{fmtR(i.getValue())}</span>, size: 65 }),
];

// ─── API response ────────────────────────────────────────────────────────────

interface PPCApiResponse {
  summary: PPCSummaryMetrics;
  chart: PPCChartDataPoint[];
  tab: { rows: CampaignRow[] | ByProductRow[]; totalCount: number };
}

// ─── Expanded row sub-component ──────────────────────────────────────────────

function CampaignExpansion({ campaignName, from, to }: { campaignName: string; from: string; to: string }) {
  const { data, isLoading } = useQuery<{ breakdown: CampaignProductBreakdown[] }>({
    queryKey: ["ppc-expand", campaignName, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/ppc?expand=${encodeURIComponent(campaignName)}&from=${from}&to=${to}`);
      const json = await res.json();
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <tr><td colSpan={13} className="px-6 py-3"><Skeleton className="h-8 w-full" /></td></tr>;
  if (!data?.breakdown?.length) return <tr><td colSpan={13} className="px-6 py-3 text-xs text-muted-foreground">No product breakdown available</td></tr>;

  return (
    <>
      {data.breakdown.map((b) => (
        <tr key={b.productId} className="bg-elevated/20 border-b border-border/30">
          <td className="px-3 py-2" />
          <td className="px-3 py-2 pl-10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground">{b.asin}</span>
              <span className="text-xs text-foreground truncate max-w-[180px]">{b.title}</span>
            </div>
          </td>
          <td className="px-3 py-2" /> {/* type */}
          <td className="px-3 py-2" /> {/* status */}
          <td className="px-3 py-2 text-xs tabular-nums">{fmtD(b.adSpend)}</td>
          <td className="px-3 py-2 text-xs tabular-nums">{fmtD(b.ppcSales)}</td>
          <td className="px-3 py-2 text-xs tabular-nums">{b.acos != null ? <span className={cn(b.acos < 20 ? "text-green-400" : b.acos < 35 ? "text-amber-400" : "text-red-400")}>{b.acos.toFixed(1)}%</span> : "—"}</td>
          <td className="px-3 py-2 text-xs tabular-nums"><span className={b.profit >= 0 ? "text-green-400" : "text-red-400"}>{fmtD(b.profit)}</span></td>
          <td className="px-3 py-2 text-xs tabular-nums">{fmtI(b.impressions)}</td>
          <td className="px-3 py-2 text-xs tabular-nums">{fmtI(b.clicks)}</td>
          <td className="px-3 py-2" /> {/* cpc */}
          <td className="px-3 py-2 text-xs tabular-nums">{fmtI(b.orders)}</td>
          <td className="px-3 py-2" /> {/* roas */}
        </tr>
      ))}
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PPCPage() {
  const [datePreset, setDatePreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("campaigns");
  const [sorting, setSorting] = useState<SortingState>([{ id: "adSpend", desc: true }]);
  const [filters, setFilters] = useState<PPCFilters>({ ...DEFAULT_FILTERS });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [detailCampaign, setDetailCampaign] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    if (datePreset === "custom" && customFrom && customTo) {
      return { from: customFrom.toISOString().slice(0, 10), to: customTo.toISOString().slice(0, 10) };
    }
    return computeDates(datePreset);
  }, [datePreset, customFrom, customTo]);

  // Build API URL with filters
  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", from); p.set("to", to); p.set("tab", activeTab);
    if (filters.status !== "all") p.set("status", filters.status);
    if (filters.type !== "all") p.set("type", filters.type);
    if (filters.search) p.set("search", filters.search);
    return p.toString();
  }, [from, to, activeTab, filters]);

  const { data, isLoading, isError, error, refetch } = useQuery<PPCApiResponse>({
    queryKey: ["ppc", filterParams],
    queryFn: async () => {
      const res = await fetch(`/api/ppc?${filterParams}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load PPC data");
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const toggleExpand = useCallback((name: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }, []);

  // Client-side filter for ACOS/spend/sales ranges
  const filteredRows = useMemo(() => {
    const rows = (data?.tab?.rows ?? []) as CampaignRow[];
    return rows.filter((r) => {
      if (filters.acosMin && (r.acos == null || r.acos < Number(filters.acosMin))) return false;
      if (filters.acosMax && (r.acos == null || r.acos > Number(filters.acosMax))) return false;
      if (filters.spendMin && r.adSpend < Number(filters.spendMin)) return false;
      if (filters.spendMax && r.adSpend > Number(filters.spendMax)) return false;
      if (filters.salesMin && r.ppcSales < Number(filters.salesMin)) return false;
      if (filters.salesMax && r.ppcSales > Number(filters.salesMax)) return false;
      return true;
    });
  }, [data?.tab?.rows, filters]);

  const campaignTable = useReactTable({
    data: activeTab === "byproduct" ? [] : filteredRows,
    columns: campaignColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const productTable = useReactTable({
    data: activeTab === "byproduct" ? (data?.tab?.rows ?? []) as ByProductRow[] : [],
    columns: productColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleExportCSV = () => {
    const rows = activeTab === "byproduct" ? (data?.tab?.rows ?? []) : filteredRows;
    const mapped = rows.map((r) => {
      if ("campaignName" in r) {
        const cr = r as CampaignRow;
        return { Campaign: cr.campaignName, Type: cr.campaignType, Status: cr.status, "Ad Spend": cr.adSpend, Sales: cr.ppcSales, "ACOS %": cr.acos ?? "", Profit: cr.profit, Impressions: cr.impressions, Clicks: cr.clicks, CPC: cr.cpc ?? "", Orders: cr.orders, ROAS: cr.roas ?? "" };
      }
      const pr = r as ByProductRow;
      return { ASIN: pr.asin, Product: pr.title, Campaigns: pr.campaignCount, "Ad Spend": pr.adSpend, Sales: pr.ppcSales, "ACOS %": pr.acos ?? "", Profit: pr.profit, Orders: pr.orders, ROAS: pr.roas ?? "" };
    });
    exportCSV(mapped as Record<string, unknown>[], `ppc-${activeTab}-${from}-to-${to}.csv`);
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="space-y-6 px-6 py-5">
        <div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-40" /></div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4"><Skeleton className="h-[450px] rounded-lg" /><Skeleton className="h-[450px] rounded-lg" /></div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (isError) return <div className="px-6 py-5"><ErrorState message={error instanceof Error ? error.message : "Error"} onRetry={() => refetch()} /></div>;

  const s = data?.summary;
  if (!s || (filteredRows.length === 0 && s.adSpend === 0 && activeTab !== "byproduct")) {
    return <div className="px-6 py-5"><EmptyState title="No PPC data yet" description="Start running Amazon PPC campaigns to see performance data here." /></div>;
  }

  return (
    <div className="space-y-4 md:space-y-6 px-3 md:px-6 py-4 md:py-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-lg md:text-xl font-bold text-foreground">PPC Dashboard</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn("px-3 py-1.5 text-xs rounded-md border transition-colors", showFilters ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
          >
            Filters {(filters.status !== "all" || filters.type !== "all" || filters.search || filters.acosMin || filters.spendMin || filters.salesMin) ? "●" : ""}
          </button>
          <DateRangeDropdown
            presets={DATE_PRESETS}
            selectedPreset={datePreset}
            onPresetChange={setDatePreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomApply={(f, t) => { setCustomFrom(f); setCustomTo(t); setDatePreset("custom"); }}
            align="right"
          />
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <PPCFilterPanel
          filters={filters}
          onApply={(f) => { setFilters(f); setShowFilters(false); }}
          onCancel={() => setShowFilters(false)}
        />
      )}

      {/* Chart + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <PPCChart data={data?.chart ?? []} activeRange={datePreset === "custom" ? "30d" : datePreset} onTimeRangeChange={setDatePreset} />
        <PPCSummaryPanel summary={s} />
      </div>

      {/* Tabs + Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-border px-4">
          <div className="flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id); setSorting([{ id: "adSpend", desc: true }]); setExpandedCampaigns(new Set()); }}
                className={cn(
                  "px-4 py-3 text-xs font-medium border-b-2 transition-colors",
                  activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {data?.tab?.totalCount != null && activeTab === t.id && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">({data.tab.totalCount})</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExportCSV} className="px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border rounded-md transition" title="Export CSV">
              CSV ↓
            </button>
          </div>
        </div>

        {/* Table — campaigns/allperiods */}
        {activeTab !== "byproduct" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                {campaignTable.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-elevated/50">
                    {hg.headers.map((h, hi) => (
                      <th key={h.id} onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                        className={cn(
                          "px-2 md:px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap",
                          h.column.getCanSort() && "cursor-pointer select-none hover:text-foreground",
                          hi <= 1 && "md:static sticky left-0 z-20 bg-elevated/90 md:bg-elevated/50"
                        )}
                        style={{ width: h.getSize() }}>
                        <div className="flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {campaignTable.getRowModel().rows.map((row, i) => {
                  const orig = row.original;
                  const isExp = expandedCampaigns.has(orig.campaignName);
                  const rowBg = i % 2 === 0 ? "bg-card" : "bg-elevated/10";
                  return (
                    <React.Fragment key={row.id}>
                      <tr className={cn("border-b border-border/50 hover:bg-elevated/30 transition-colors", rowBg)}>
                        {row.getVisibleCells().map((cell, ci) => (
                          <td
                            key={cell.id}
                            className={cn(
                              "px-2 md:px-3 py-2.5 whitespace-nowrap",
                              cell.column.id === "expand" && "cursor-pointer",
                              ci <= 1 && cn("md:static sticky left-0 z-10", rowBg)
                            )}
                            onClick={() => {
                              if (cell.column.id === "expand") toggleExpand(orig.campaignName);
                              else if (cell.column.id === "campaignName") setDetailCampaign(orig.campaignName);
                            }}
                          >
                            {cell.column.id === "expand" ? (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className={cn("text-muted-foreground transition-transform", isExp && "rotate-90")}><path d="M3 1l4 4-4 4" /></svg>
                            ) : flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {isExp && <CampaignExpansion campaignName={orig.campaignName} from={from} to={to} />}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {campaignTable.getRowModel().rows.length === 0 && (
              <div className="px-6 py-12 text-center text-muted-foreground text-sm">No campaigns found for this period.</div>
            )}
          </div>
        )}

        {/* Table — by product */}
        {activeTab === "byproduct" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                {productTable.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-elevated/50">
                    {hg.headers.map((h, hi) => (
                      <th key={h.id} onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                        className={cn(
                          "px-2 md:px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap",
                          h.column.getCanSort() && "cursor-pointer select-none hover:text-foreground",
                          hi === 0 && "md:static sticky left-0 z-20 bg-elevated/90 md:bg-elevated/50"
                        )}
                        style={{ width: h.getSize() }}>
                        <div className="flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {productTable.getRowModel().rows.map((row, i) => {
                  const rowBg = i % 2 === 0 ? "bg-card" : "bg-elevated/10";
                  return (
                  <tr key={row.id} className={cn("border-b border-border/50 hover:bg-elevated/30 transition-colors", rowBg)}>
                    {row.getVisibleCells().map((cell, ci) => (
                      <td key={cell.id} className={cn("px-2 md:px-3 py-2.5 whitespace-nowrap", ci === 0 && cn("md:static sticky left-0 z-10", rowBg))}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {productTable.getRowModel().rows.length === 0 && (
              <div className="px-6 py-12 text-center text-muted-foreground text-sm">No product data found for this period.</div>
            )}
          </div>
        )}
      </div>

      {/* Campaign detail slide-over */}
      {detailCampaign && (
        <CampaignDetailPanel
          campaignName={detailCampaign}
          from={from}
          to={to}
          onClose={() => setDetailCampaign(null)}
        />
      )}
    </div>
  );
}

// Need React for Fragment
import React from "react";
