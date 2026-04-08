"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils/cn";
import { DateRangeDropdown } from "@/components/ui/date-range-dropdown";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  KeywordSummaryMetrics,
  KeywordRow,
  SearchTermRow,
  KeywordDetail,
  KeywordDetailRow,
} from "@/lib/services/keyword-service";

// ─── Constants ────────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 14 days", value: "14d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last 6 months", value: "6m" },
  { label: "Last 12 months", value: "12m" },
];

type TabId = "keywords" | "searchterms" | "negative";

const TABS: { id: TabId; label: string }[] = [
  { id: "keywords", label: "Keywords" },
  { id: "searchterms", label: "Search Terms" },
  { id: "negative", label: "Negative Keywords" },
];

const MATCH_TYPES = [
  { label: "All", value: "all" },
  { label: "EXACT", value: "EXACT" },
  { label: "PHRASE", value: "PHRASE" },
  { label: "BROAD", value: "BROAD" },
  { label: "TARGETING_EXPRESSION", value: "TARGETING_EXPRESSION" },
  { label: "TARGETING_EXPRESSION_PREDEFINED", value: "TARGETING_EXPRESSION_PREDEFINED" },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function computeDates(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const daysMap: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90, "6m": 180, "12m": 365 };
  const days = daysMap[preset] ?? 30;
  const from = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtD = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtP = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : "—");
const fmtI = (v: number) => v.toLocaleString("en-US");
const fmtR = (v: number | null) => (v != null ? `${v.toFixed(2)}x` : "—");

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          const s = String(v ?? "");
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Match type badge ─────────────────────────────────────────────────────────

const MATCH_BADGE_COLORS: Record<string, string> = {
  EXACT: "bg-blue-500/20 text-blue-400",
  PHRASE: "bg-green-500/20 text-green-400",
  BROAD: "bg-amber-500/20 text-amber-400",
  TARGETING_EXPRESSION: "bg-purple-500/20 text-purple-400",
  TARGETING_EXPRESSION_PREDEFINED: "bg-gray-500/20 text-gray-400",
};

function MatchBadge({ type }: { type: string }) {
  const short =
    type === "TARGETING_EXPRESSION"
      ? "T.E."
      : type === "TARGETING_EXPRESSION_PREDEFINED"
        ? "T.E.P."
        : type;
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-[10px] font-semibold uppercase whitespace-nowrap",
        MATCH_BADGE_COLORS[type] ?? "bg-gray-500/20 text-gray-400"
      )}
      title={type}
    >
      {short}
    </span>
  );
}

// ─── Keyword columns ──────────────────────────────────────────────────────────

const kc = createColumnHelper<KeywordRow>();
const keywordColumns = [
  kc.accessor("keywordText", {
    header: "Keyword",
    cell: (i) => (
      <div className="max-w-[260px] truncate font-medium text-primary hover:underline cursor-pointer" title={i.getValue()}>
        {i.getValue()}
      </div>
    ),
    size: 260,
  }),
  kc.accessor("matchType", {
    header: "Match",
    cell: (i) => <MatchBadge type={i.getValue()} />,
    size: 70,
  }),
  kc.accessor("campaignName", {
    header: "Campaign",
    cell: (i) => (
      <div className="max-w-[200px] truncate text-foreground" title={i.getValue() ?? ""}>
        {i.getValue() ?? "—"}
      </div>
    ),
    size: 200,
  }),
  kc.accessor("adGroupName", {
    header: "Ad Group",
    cell: (i) => (
      <div className="max-w-[160px] truncate text-foreground" title={i.getValue() ?? ""}>
        {i.getValue() ?? "—"}
      </div>
    ),
    size: 160,
  }),
  kc.accessor("adSpend", {
    header: "Spend",
    cell: (i) => <span className="tabular-nums">{fmtD(i.getValue())}</span>,
    size: 90,
  }),
  kc.accessor("sales", {
    header: "Sales",
    cell: (i) => <span className="tabular-nums">{fmtD(i.getValue())}</span>,
    size: 90,
  }),
  kc.accessor("acos", {
    header: "ACOS",
    cell: (i) => {
      const v = i.getValue();
      if (v == null) return <span className="text-muted-foreground">—</span>;
      return (
        <span className={cn("tabular-nums font-medium", v < 20 ? "text-green-400" : v < 35 ? "text-amber-400" : "text-red-400")}>
          {v.toFixed(1)}%
        </span>
      );
    },
    size: 70,
  }),
  kc.accessor("clicks", {
    header: "Clicks",
    cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>,
    size: 70,
  }),
  kc.accessor("impressions", {
    header: "Impr",
    cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>,
    size: 80,
  }),
  kc.accessor("cpc", {
    header: "CPC",
    cell: (i) => <span className="tabular-nums">{i.getValue() != null ? `$${i.getValue()!.toFixed(2)}` : "—"}</span>,
    size: 65,
  }),
  kc.accessor("ctr", {
    header: "CTR",
    cell: (i) => <span className="tabular-nums">{fmtP(i.getValue())}</span>,
    size: 65,
  }),
  kc.accessor("orders", {
    header: "Orders",
    cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>,
    size: 65,
  }),
  kc.accessor("roas", {
    header: "ROAS",
    cell: (i) => <span className="tabular-nums">{fmtR(i.getValue())}</span>,
    size: 65,
  }),
];

// ─── Search term columns ──────────────────────────────────────────────────────

const sc = createColumnHelper<SearchTermRow>();
const searchTermColumns = [
  sc.accessor("searchTerm", {
    header: "Search Term",
    cell: (i) => (
      <div className="max-w-[260px] truncate font-medium text-foreground" title={i.getValue()}>
        {i.getValue()}
      </div>
    ),
    size: 260,
  }),
  sc.accessor("keywordText", {
    header: "Keyword",
    cell: (i) => (
      <div className="max-w-[200px] truncate text-muted-foreground" title={i.getValue() ?? ""}>
        {i.getValue() ?? "—"}
      </div>
    ),
    size: 200,
  }),
  sc.accessor("matchType", {
    header: "Match",
    cell: (i) => (i.getValue() ? <MatchBadge type={i.getValue()!} /> : <span className="text-muted-foreground">—</span>),
    size: 70,
  }),
  sc.accessor("campaignName", {
    header: "Campaign",
    cell: (i) => (
      <div className="max-w-[200px] truncate text-foreground" title={i.getValue() ?? ""}>
        {i.getValue() ?? "—"}
      </div>
    ),
    size: 200,
  }),
  sc.accessor("adSpend", {
    header: "Spend",
    cell: (i) => <span className="tabular-nums">{fmtD(i.getValue())}</span>,
    size: 90,
  }),
  sc.accessor("sales", {
    header: "Sales",
    cell: (i) => <span className="tabular-nums">{fmtD(i.getValue())}</span>,
    size: 90,
  }),
  sc.accessor("acos", {
    header: "ACOS",
    cell: (i) => {
      const v = i.getValue();
      if (v == null) return <span className="text-muted-foreground">—</span>;
      return (
        <span className={cn("tabular-nums font-medium", v < 20 ? "text-green-400" : v < 35 ? "text-amber-400" : "text-red-400")}>
          {v.toFixed(1)}%
        </span>
      );
    },
    size: 70,
  }),
  sc.accessor("clicks", {
    header: "Clicks",
    cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>,
    size: 70,
  }),
  sc.accessor("impressions", {
    header: "Impr",
    cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>,
    size: 80,
  }),
  sc.accessor("orders", {
    header: "Orders",
    cell: (i) => <span className="tabular-nums">{fmtI(i.getValue())}</span>,
    size: 65,
  }),
];

// ─── Filter state ─────────────────────────────────────────────────────────────

interface KeywordFilters {
  search: string;
  matchType: string;
  minSpend: string;
  maxAcos: string;
}

const DEFAULT_FILTERS: KeywordFilters = { search: "", matchType: "all", minSpend: "", maxAcos: "" };

// ─── Filter panel ─────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  onApply,
  onCancel,
}: {
  filters: KeywordFilters;
  onApply: (f: KeywordFilters) => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState<KeywordFilters>({ ...filters });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Search
          </label>
          <input
            type="text"
            value={local.search}
            onChange={(e) => setLocal({ ...local, search: e.target.value })}
            placeholder="Keyword or search term..."
            className="w-full h-8 px-3 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Match Type */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Match Type
          </label>
          <select
            value={local.matchType}
            onChange={(e) => setLocal({ ...local, matchType: e.target.value })}
            className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {MATCH_TYPES.map((mt) => (
              <option key={mt.value} value={mt.value}>
                {mt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Min Spend */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Min Spend ($)
          </label>
          <input
            type="number"
            value={local.minSpend}
            onChange={(e) => setLocal({ ...local, minSpend: e.target.value })}
            placeholder="0"
            className="w-full h-8 px-3 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Max ACOS */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Max ACOS (%)
          </label>
          <input
            type="number"
            value={local.maxAcos}
            onChange={(e) => setLocal({ ...local, maxAcos: e.target.value })}
            placeholder="100"
            className="w-full h-8 px-3 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mt-4">
        <button
          onClick={() => {
            setLocal({ ...DEFAULT_FILTERS });
            onApply({ ...DEFAULT_FILTERS });
          }}
          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          Clear
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs border border-border rounded-md text-foreground hover:bg-elevated transition">
          Cancel
        </button>
        <button
          onClick={() => onApply(local)}
          className="px-4 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: KeywordSummaryMetrics }) {
  const cards = [
    { label: "Spend", value: fmtD(summary.totalSpend) },
    { label: "Sales", value: fmtD(summary.totalSales) },
    { label: "ACOS", value: fmtP(summary.acos), color: summary.acos != null && summary.acos < 25 ? "text-green-400" : summary.acos != null && summary.acos < 40 ? "text-amber-400" : "text-red-400" },
    { label: "Clicks", value: fmtI(summary.clicks) },
    { label: "Impressions", value: fmtI(summary.impressions) },
    { label: "Orders", value: fmtI(summary.orders) },
    { label: "CPC", value: summary.cpc != null ? `$${summary.cpc.toFixed(2)}` : "—" },
    { label: "ROAS", value: fmtR(summary.roas), color: summary.roas != null && summary.roas >= 3 ? "text-green-400" : summary.roas != null && summary.roas >= 2 ? "text-amber-400" : undefined },
    { label: "Keywords", value: fmtI(summary.uniqueKeywords) },
    { label: "Search Terms", value: fmtI(summary.uniqueSearchTerms) },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{c.label}</p>
          <p className={cn("text-sm font-bold tabular-nums", c.color ?? "text-foreground")}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Keyword detail slide-over ────────────────────────────────────────────────

function KeywordDetailPanel({
  keywordText,
  matchType,
  from,
  to,
  onClose,
}: {
  keywordText: string;
  matchType: string;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery<KeywordDetail>({
    queryKey: ["keyword-detail", keywordText, matchType, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ keyword: keywordText, matchType, from, to });
      const res = await fetch(`/api/keywords/detail?${params}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load detail");
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[500px] max-w-full bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground truncate" title={keywordText}>
              {keywordText}
            </h2>
            <MatchBadge type={matchType} />
          </div>
          <button onClick={onClose} className="ml-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated transition">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          )}

          {isError && <ErrorState title="Failed to load keyword detail" />}

          {data && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Spend", value: fmtD(data.totalSpend) },
                  { label: "Sales", value: fmtD(data.totalSales) },
                  { label: "ACOS", value: fmtP(data.acos), color: data.acos != null && data.acos < 25 ? "text-green-400" : data.acos != null && data.acos < 40 ? "text-amber-400" : "text-red-400" },
                  { label: "ROAS", value: fmtR(data.roas) },
                  { label: "Clicks", value: fmtI(data.clicks) },
                  { label: "Orders", value: fmtI(data.orders) },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border bg-elevated/30 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">{s.label}</p>
                    <p className={cn("text-sm font-bold tabular-nums", "color" in s ? s.color : "text-foreground")}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Per-campaign breakdown */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-3 py-2.5 border-b border-border">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Campaign Breakdown ({data.campaigns.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-elevated/50">
                        <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Campaign</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Spend</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Sales</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">ACOS</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Clicks</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.campaigns.map((c: KeywordDetailRow, idx: number) => (
                        <tr key={`${c.campaignName}-${idx}`} className={cn("border-b border-border/50", idx % 2 === 0 ? "bg-card" : "bg-elevated/10")}>
                          <td className="px-3 py-2 truncate max-w-[200px]" title={c.campaignName}>{c.campaignName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtD(c.adSpend)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtD(c.sales)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {c.acos != null ? (
                              <span className={cn(c.acos < 20 ? "text-green-400" : c.acos < 35 ? "text-amber-400" : "text-red-400")}>
                                {c.acos.toFixed(1)}%
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtI(c.clicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtI(c.orders)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.campaigns.length === 0 && (
                    <div className="px-6 py-8 text-center text-muted-foreground text-xs">No campaign data for this keyword.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── API response type ────────────────────────────────────────────────────────

interface KeywordsApiResponse {
  summary: KeywordSummaryMetrics;
  rows: KeywordRow[] | SearchTermRow[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function KeywordsPageV2() {
  const [datePreset, setDatePreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("keywords");
  const [sorting, setSorting] = useState<SortingState>([{ id: "adSpend", desc: true }]);
  const [filters, setFilters] = useState<KeywordFilters>({ ...DEFAULT_FILTERS });
  const [showFilters, setShowFilters] = useState(false);
  const [detailKeyword, setDetailKeyword] = useState<{ text: string; match: string } | null>(null);

  const { from, to } = useMemo(() => {
    if (datePreset === "custom" && customFrom && customTo) {
      return { from: customFrom.toISOString().slice(0, 10), to: customTo.toISOString().slice(0, 10) };
    }
    return computeDates(datePreset);
  }, [datePreset, customFrom, customTo]);

  // Build query params
  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", from);
    p.set("to", to);
    p.set("tab", activeTab === "negative" ? "keywords" : activeTab);
    if (filters.search) p.set("search", filters.search);
    if (filters.matchType !== "all") p.set("matchType", filters.matchType);
    if (filters.minSpend) p.set("minSpend", filters.minSpend);
    if (filters.maxAcos) p.set("maxAcos", filters.maxAcos);
    return p.toString();
  }, [from, to, activeTab, filters]);

  const { data, isLoading, isError, error, refetch } = useQuery<KeywordsApiResponse>({
    queryKey: ["keywords", filterParams],
    queryFn: async () => {
      const res = await fetch(`/api/keywords?${filterParams}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load keyword data");
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: activeTab !== "negative",
  });

  // Table data
  const keywordRows = useMemo(() => {
    if (activeTab !== "keywords" || !data?.rows) return [];
    return data.rows as KeywordRow[];
  }, [data?.rows, activeTab]);

  const searchTermRows = useMemo(() => {
    if (activeTab !== "searchterms" || !data?.rows) return [];
    return data.rows as SearchTermRow[];
  }, [data?.rows, activeTab]);

  const keywordTable = useReactTable({
    data: keywordRows,
    columns: keywordColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const searchTermTable = useReactTable({
    data: searchTermRows,
    columns: searchTermColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleClickKeyword = useCallback((row: KeywordRow) => {
    setDetailKeyword({ text: row.keywordText, match: row.matchType });
  }, []);

  const handleExportCSV = () => {
    if (!data?.rows) return;
    if (activeTab === "keywords") {
      const mapped = (data.rows as KeywordRow[]).map((r) => ({
        Keyword: r.keywordText,
        "Match Type": r.matchType,
        Campaign: r.campaignName ?? "",
        "Ad Group": r.adGroupName ?? "",
        Spend: r.adSpend,
        Sales: r.sales,
        "ACOS %": r.acos ?? "",
        Clicks: r.clicks,
        Impressions: r.impressions,
        CPC: r.cpc ?? "",
        CTR: r.ctr ?? "",
        Orders: r.orders,
        ROAS: r.roas ?? "",
      }));
      exportCSV(mapped as Record<string, unknown>[], `keywords-${from}-to-${to}.csv`);
    } else {
      const mapped = (data.rows as SearchTermRow[]).map((r) => ({
        "Search Term": r.searchTerm,
        Keyword: r.keywordText ?? "",
        "Match Type": r.matchType ?? "",
        Campaign: r.campaignName ?? "",
        Spend: r.adSpend,
        Sales: r.sales,
        "ACOS %": r.acos ?? "",
        Clicks: r.clicks,
        Impressions: r.impressions,
        Orders: r.orders,
      }));
      exportCSV(mapped as Record<string, unknown>[], `search-terms-${from}-to-${to}.csv`);
    }
  };

  const hasActiveFilters = filters.search || filters.matchType !== "all" || filters.minSpend || filters.maxAcos;

  // ── Loading ──
  if (isLoading && activeTab !== "negative") {
    return (
      <div className="space-y-6 px-6 py-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (isError && activeTab !== "negative") {
    return (
      <div className="px-6 py-5">
        <ErrorState message={error instanceof Error ? error.message : "Error loading keyword data"} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 py-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Keywords</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md border transition-colors",
              showFilters ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            Filters {hasActiveFilters ? "●" : ""}
          </button>
          <DateRangeDropdown
            presets={DATE_PRESETS}
            selectedPreset={datePreset}
            onPresetChange={setDatePreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomApply={(f, t) => {
              setCustomFrom(f);
              setCustomTo(t);
              setDatePreset("custom");
            }}
            align="right"
          />
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          onApply={(f) => {
            setFilters(f);
            setShowFilters(false);
          }}
          onCancel={() => setShowFilters(false)}
        />
      )}

      {/* Summary cards */}
      {data?.summary && <SummaryCards summary={data.summary} />}

      {/* Tabs + Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-border px-4">
          <div className="flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTab(t.id);
                  setSorting([{ id: t.id === "searchterms" ? "adSpend" : "adSpend", desc: true }]);
                }}
                className={cn(
                  "px-4 py-3 text-xs font-medium border-b-2 transition-colors",
                  activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {activeTab === t.id && data?.rows && activeTab !== "negative" && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">({data.rows.length})</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {activeTab !== "negative" && (
              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border rounded-md transition"
                title="Export CSV"
              >
                CSV ↓
              </button>
            )}
          </div>
        </div>

        {/* Keywords tab */}
        {activeTab === "keywords" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                {keywordTable.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-elevated/50">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                        className={cn(
                          "px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap",
                          h.column.getCanSort() && "cursor-pointer select-none hover:text-foreground"
                        )}
                        style={{ width: h.getSize() }}
                      >
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
                {keywordTable.getRowModel().rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={cn("border-b border-border/50 hover:bg-elevated/30 transition-colors", i % 2 === 0 ? "bg-card" : "bg-elevated/10")}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-3 py-2.5 whitespace-nowrap"
                        onClick={cell.column.id === "keywordText" ? () => handleClickKeyword(row.original) : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {keywordTable.getRowModel().rows.length === 0 && (
              <div className="px-6 py-12">
                <EmptyState title="No keywords found" description="No keyword data available for this period and filters." />
              </div>
            )}
          </div>
        )}

        {/* Search Terms tab */}
        {activeTab === "searchterms" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                {searchTermTable.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-elevated/50">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                        className={cn(
                          "px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap",
                          h.column.getCanSort() && "cursor-pointer select-none hover:text-foreground"
                        )}
                        style={{ width: h.getSize() }}
                      >
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
                {searchTermTable.getRowModel().rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={cn("border-b border-border/50 hover:bg-elevated/30 transition-colors", i % 2 === 0 ? "bg-card" : "bg-elevated/10")}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {searchTermTable.getRowModel().rows.length === 0 && (
              <div className="px-6 py-12">
                <EmptyState title="No search terms found" description="No search term data available for this period and filters." />
              </div>
            )}
          </div>
        )}

        {/* Negative Keywords tab */}
        {activeTab === "negative" && (
          <div className="px-6 py-12">
            <EmptyState
              title="Negative keyword management coming soon"
              description="This feature is under development. You will be able to manage negative keywords across campaigns here."
            />
          </div>
        )}
      </div>

      {/* Keyword detail slide-over */}
      {detailKeyword && (
        <KeywordDetailPanel
          keywordText={detailKeyword.text}
          matchType={detailKeyword.match}
          from={from}
          to={to}
          onClose={() => setDetailKeyword(null)}
        />
      )}
    </div>
  );
}
