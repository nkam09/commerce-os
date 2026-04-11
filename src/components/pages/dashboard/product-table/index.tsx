"use client";

import { useState, useMemo, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useApiData } from "@/hooks/use-api-data";
import { cn } from "@/lib/utils/cn";
import { SkeletonTable } from "@/components/ui/skeleton-loader";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { DateRangeDropdown } from "@/components/ui/date-range-dropdown";
import { pacificDateStr, subDays, parseYearMonth, toISODate } from "@/lib/utils/pacific-date";

import type { ProductRow, GroupByKey, TabKey } from "./types";
import { columns, DEFAULT_VISIBLE_COLUMNS } from "./column-defs";
import {
  TabSelector,
  GroupByDropdown,
  ColumnsDropdown,
  ExportDropdown,
} from "./table-controls";
import { ProductSlideOver } from "./product-slideover";

// ─── Date range presets ─────────────────────────────────────────────────────

const TABLE_DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last_7" },
  { label: "Last 30 days", value: "last_30" },
  { label: "MTD", value: "mtd" },
  { label: "Last Month", value: "last_month" },
];

function computePresetDates(preset: string): { from: string; to: string } | null {
  const today = pacificDateStr();
  const { year, month } = parseYearMonth(today);
  switch (preset) {
    case "today": return { from: today, to: today };
    case "yesterday": { const y = subDays(today, 1); return { from: y, to: y }; }
    case "last_7": return { from: subDays(today, 6), to: today };
    case "last_30": return { from: subDays(today, 29), to: today };
    case "mtd": return { from: toISODate(new Date(Date.UTC(year, month, 1))), to: today };
    case "last_month": {
      const firstOfLastMonth = new Date(Date.UTC(year, month - 1, 1));
      const lastOfLastMonth = new Date(Date.UTC(year, month, 0));
      return { from: toISODate(firstOfLastMonth), to: toISODate(lastOfLastMonth) };
    }
    default: return null;
  }
}

// ─── Mobile column visibility ───────────────────────────────────────────────

/** On mobile (<768px), show only essential columns to avoid a cramped table */
const MOBILE_VISIBLE_COLUMNS: Record<string, boolean> = {
  product: true,
  grossSales: true,
  units: true,
  netProfit: true,
  margin: true,
  // everything else hidden on mobile
  netRevenue: false,
  fees: false,
  totalCogs: false,
  adSpend: false,
  acos: false,
  tacos: false,
  stock: false,
  daysLeft: false,
  refunds: false,
  refundPct: false,
  amazonFees: false,
  estPayout: false,
  roi: false,
};

// ─── Main component ─────────────────────────────────────────────────────────

type Props = {
  /** Optional: pass products from parent to avoid double-fetch on initial load */
  initialProducts?: ProductRow[];
  onRowClick?: (product: ProductRow) => void;
  className?: string;
};

export function ProductPerformanceTable({
  initialProducts,
  onRowClick,
  className,
}: Props) {
  // ─── Local state ──────────────────────────────────────────────────────────
  const [datePreset, setDatePreset] = useState<string>("last_30");
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("products");
  const [groupBy, setGroupBy] = useState<GroupByKey>("asin");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "netProfit", desc: true },
  ]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => ({ ...DEFAULT_VISIBLE_COLUMNS })
  );
  const [slideoverProduct, setSlideoverProduct] = useState<ProductRow | null>(
    null
  );

  // ─── Set mobile-friendly column defaults on mount ─────────────────────────
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      setColumnVisibility({ ...MOBILE_VISIBLE_COLUMNS });
    }
  }, []);

  // ─── Compute date range for API call ──────────────────────────────────────
  const dateRange = useMemo(() => {
    if (datePreset === "custom" && customFrom && customTo) {
      return { from: toISODate(customFrom), to: toISODate(customTo) };
    }
    return computePresetDates(datePreset);
  }, [datePreset, customFrom, customTo]);

  // ─── Data fetching ────────────────────────────────────────────────────────
  const productsUrl = dateRange
    ? `/api/dashboard/tiles/products?period=${datePreset}&from=${dateRange.from}&to=${dateRange.to}`
    : `/api/dashboard/tiles/products?period=last_30`;

  console.log("[product-table] fetching data for:", { datePreset, ...dateRange });

  const {
    data: products,
    isLoading,
    isError,
    error,
    refetch,
  } = useApiData<ProductRow[]>(productsUrl);

  const tableData = useMemo(() => products ?? [], [products]);

  // ─── Table instance ───────────────────────────────────────────────────────
  const table = useReactTable<ProductRow>({
    data: tableData,
    columns,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableSortingRemoval: false,
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "bg-card rounded-lg border border-border overflow-visible",
        className
      )}
    >
      {/* ── Header Bar ─────────────────────────────────────────────────────── */}
      <div className="px-3 md:px-4 py-2.5 md:py-3 border-b border-border space-y-2 md:space-y-0">
        {/* Top row: title + right controls */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="flex items-center gap-2 md:gap-4 flex-wrap">
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Product Performance
            </h2>
            <DateRangeDropdown
              presets={TABLE_DATE_PRESETS}
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
            <TabSelector value={activeTab} onChange={setActiveTab} />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
            <GroupByDropdown value={groupBy} onChange={setGroupBy} />
            <ColumnsDropdown
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
            />
            <ExportDropdown data={tableData} />
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {activeTab === "order_items" ? (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">Coming soon</p>
          <p className="text-xs text-tertiary mt-1">
            Order Items view is under development
          </p>
        </div>
      ) : isLoading ? (
        <div className="p-4">
          <SkeletonTable />
        </div>
      ) : isError ? (
        <ErrorState
          message={error ?? "Failed to load product data"}
          onRetry={() => refetch()}
        />
      ) : tableData.length === 0 ? (
        <EmptyState
          title="No products found"
          description="No product data available for this period."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* ── Table Header ──────────────────────────────────────────── */}
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, idx) => {
                    const meta = header.column.columnDef.meta as
                      | { align?: string }
                      | undefined;
                    const isProductCol = idx === 0;
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "bg-elevated text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-3 border-b border-border whitespace-nowrap select-none",
                          meta?.align === "right" ? "text-right" : "text-left",
                          header.column.getCanSort() &&
                            "cursor-pointer hover:text-foreground transition",
                          isProductCol &&
                            "sticky left-0 z-20 bg-elevated"
                        )}
                        style={{
                          width: header.getSize(),
                          minWidth: header.column.columnDef.minSize,
                        }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="inline-flex items-center gap-1">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                          {header.column.getIsSorted() && (
                            <SortArrow
                              direction={
                                header.column.getIsSorted() as "asc" | "desc"
                              }
                            />
                          )}
                          {!header.column.getIsSorted() &&
                            header.column.getCanSort() && (
                              <SortArrowInactive />
                            )}
                        </span>
                      </th>
                    );
                  })}
                  {/* More button column header */}
                  <th className="bg-elevated text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-3 border-b border-border w-10">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              ))}
            </thead>

            {/* ── Table Body ────────────────────────────────────────────── */}
            <tbody className="divide-y divide-border">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="bg-card hover:bg-elevated/50 transition-colors"
                >
                  {row.getVisibleCells().map((cell, idx) => {
                    const meta = cell.column.columnDef.meta as
                      | { align?: string }
                      | undefined;
                    const isProductCol = idx === 0;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-3 py-3 text-sm tabular-nums",
                          meta?.align === "right" ? "text-right" : "text-left",
                          isProductCol &&
                            "sticky left-0 z-10 bg-card group-hover:bg-elevated/50"
                        )}
                        onClick={
                          isProductCol
                            ? () => onRowClick?.(row.original)
                            : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    );
                  })}
                  {/* More button */}
                  <td className="px-2 py-3 text-center w-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSlideoverProduct(row.original);
                      }}
                      className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-elevated transition"
                      title="View details"
                    >
                      <MoreIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Slide-over Panel ───────────────────────────────────────────────── */}
      {slideoverProduct && (
        <ProductSlideOver
          product={slideoverProduct}
          onClose={() => setSlideoverProduct(null)}
        />
      )}
    </div>
  );
}

// ─── Sort indicators ────────────────────────────────────────────────────────

function SortArrow({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg viewBox="0 0 8 12" className="h-3 w-2 text-primary">
      {direction === "asc" ? (
        <path d="M4 0L7 5H1L4 0Z" fill="currentColor" />
      ) : (
        <path d="M4 12L1 7H7L4 12Z" fill="currentColor" />
      )}
    </svg>
  );
}

function SortArrowInactive() {
  return (
    <svg viewBox="0 0 8 12" className="h-3 w-2 text-muted-foreground/30">
      <path d="M4 0L7 4H1L4 0Z" fill="currentColor" />
      <path d="M4 12L1 8H7L4 12Z" fill="currentColor" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M8 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM8 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9.5 12.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
    </svg>
  );
}
