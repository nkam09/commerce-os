"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import type { PeriodKey, GroupByKey, TabKey, ProductRow } from "./types";
import { PERIOD_OPTIONS, GROUP_BY_OPTIONS } from "./types";
import { COLUMN_GROUPS, DEFAULT_VISIBLE_COLUMNS } from "./column-defs";
import type { VisibilityState } from "@tanstack/react-table";

// ─── Period Selector ───────────��─────────────────────────────────────────────

export function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (v: PeriodKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const label = PERIOD_OPTIONS.find((o) => o.value === value)?.label ?? "Today";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-elevated/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition"
      >
        {label}
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-[160px] rounded-lg border border-border bg-card py-1 shadow-xl animate-fade-in">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-elevated/50 transition",
                opt.value === value
                  ? "text-primary font-medium"
                  : "text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab Selector ────────────────────────────────────────────────────────────

export function TabSelector({
  value,
  onChange,
}: {
  value: TabKey;
  onChange: (v: TabKey) => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border bg-elevated/30 p-0.5">
      <button
        type="button"
        onClick={() => onChange("products")}
        className={cn(
          "rounded px-3 py-1 text-xs font-medium transition",
          value === "products"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Products
      </button>
      <button
        type="button"
        onClick={() => onChange("order_items")}
        className={cn(
          "rounded px-3 py-1 text-xs font-medium transition",
          value === "order_items"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Order Items
      </button>
    </div>
  );
}

// ─── Group By Dropdown ───────────────────────────────────────────────────────

export function GroupByDropdown({
  value,
  onChange,
}: {
  value: GroupByKey;
  onChange: (v: GroupByKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const label = GROUP_BY_OPTIONS.find((o) => o.value === value)?.label ?? "ASIN";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-elevated/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition"
      >
        <GroupIcon />
        Group by: {label}
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-[9999] min-w-[140px] rounded-lg border border-border bg-card py-1 shadow-xl animate-fade-in">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-elevated/50 transition",
                opt.value === value
                  ? "text-primary font-medium"
                  : "text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Columns Toggle ──────────────────────────────────────────────────────────

export function ColumnsDropdown({
  columnVisibility,
  onColumnVisibilityChange,
}: {
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (v: VisibilityState) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleColumn(id: string) {
    if (id === "product") return; // always visible
    const current = columnVisibility[id] ?? true;
    onColumnVisibilityChange({ ...columnVisibility, [id]: !current });
  }

  function resetColumns() {
    onColumnVisibilityChange({ ...DEFAULT_VISIBLE_COLUMNS });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-elevated/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition"
      >
        <ColumnsIcon />
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-[9999] w-60 rounded-lg border border-border bg-card p-3 shadow-xl animate-fade-in max-h-[400px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">Toggle Columns</span>
            <button
              type="button"
              onClick={resetColumns}
              className="text-[10px] text-primary hover:underline"
            >
              Reset
            </button>
          </div>
          {COLUMN_GROUPS.map((group) => (
            <div key={group.label} className="mb-2.5 last:mb-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-1">
                {group.label}
              </p>
              {group.columns.map((col) => {
                const visible = columnVisibility[col.id] ?? true;
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 rounded px-1 py-1 text-xs text-foreground hover:bg-elevated/50 cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleColumn(col.id)}
                      disabled={col.id === "product"}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-50"
                    />
                    {col.label}
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CSV Helper ─────────────────────────────────────────────────────────────

const CSV_COLUMNS: { header: string; accessor: (r: ProductRow) => string }[] = [
  { header: "ASIN", accessor: (r) => r.asin },
  { header: "Title", accessor: (r) => r.title ?? "" },
  { header: "Units Sold", accessor: (r) => String(r.units) },
  { header: "Gross Sales", accessor: (r) => r.grossSales.toFixed(2) },
  { header: "Refund Units", accessor: (r) => String(r.refundCount) },
  { header: "Refund Amount", accessor: (r) => r.refunds.toFixed(2) },
  { header: "Net Revenue", accessor: (r) => r.netRevenue.toFixed(2) },
  { header: "Ad Spend", accessor: (r) => r.adSpend.toFixed(2) },
  { header: "ACOS", accessor: (r) => r.acos != null ? (r.acos * 100).toFixed(1) + "%" : "" },
  { header: "TACOS", accessor: (r) => r.tacos != null ? (r.tacos * 100).toFixed(1) + "%" : "" },
  { header: "Total Fees", accessor: (r) => r.fees.toFixed(2) },
  { header: "Amazon Fees", accessor: (r) => r.amazonFees.toFixed(2) },
  { header: "COGS", accessor: (r) => r.cogs.toFixed(2) },
  { header: "Net Profit", accessor: (r) => r.netProfit.toFixed(2) },
  { header: "Margin", accessor: (r) => r.margin != null ? (r.margin * 100).toFixed(1) + "%" : "" },
  { header: "ROI", accessor: (r) => r.roi != null ? (r.roi * 100).toFixed(1) + "%" : "" },
  { header: "Stock", accessor: (r) => String(r.stock) },
  { header: "Days Left", accessor: (r) => r.daysLeft != null ? String(r.daysLeft) : "" },
  { header: "Est Payout", accessor: (r) => r.estPayout.toFixed(2) },
];

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(data: ProductRow[]): string {
  const headerRow = CSV_COLUMNS.map((c) => escapeCsvField(c.header)).join(",");
  const dataRows = data.map((row) =>
    CSV_COLUMNS.map((c) => escapeCsvField(c.accessor(row))).join(",")
  );
  return [headerRow, ...dataRows].join("\n");
}

function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Export Dropdown ──────────────────────────────────────────────────────────

export function ExportDropdown({ data }: { data: ProductRow[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExport = useCallback(
    (type: "daily" | "monthly") => {
      const date = todayStr();
      const filename =
        type === "daily"
          ? `commerce-os-daily-report-${date}.csv`
          : `commerce-os-monthly-report-${date}.csv`;
      const csv = buildCsv(data);
      downloadCsv(csv, filename);
      setOpen(false);
    },
    [data]
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-elevated/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition"
      >
        <DownloadIcon />
        Export
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-[9999] min-w-[220px] rounded-lg border border-border bg-card py-1 shadow-xl animate-fade-in">
          <button
            type="button"
            onClick={() => handleExport("daily")}
            className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-elevated/50 transition flex items-center gap-2"
          >
            <FileIcon />
            Download Daily Report (CSV)
          </button>
          <button
            type="button"
            onClick={() => handleExport("monthly")}
            className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-elevated/50 transition flex items-center gap-2"
          >
            <FileIcon />
            Download Monthly Report (CSV)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 opacity-60">
      <path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M0 2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V2zm5.5 0h-4v12h4V2zm1 12h4V2h-4v12zm5 0h3.5V2H11.5v12z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14H2.75Z" />
      <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-muted-foreground">
      <path d="M3.75 1.5a.25.25 0 00-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25V1.75z" />
    </svg>
  );
}
