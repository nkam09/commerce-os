"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils/cn";

/* ─── Types ──────────────────────────────────────────── */

export type SortDirection = "asc" | "desc" | null;

export type ColumnDef<T> = {
  id: string;
  header: string;
  /** Accessor function to get cell value */
  accessorFn: (row: T) => string | number | null | undefined;
  /** Custom cell renderer */
  cell?: (row: T) => React.ReactNode;
  /** Allow sorting */
  sortable?: boolean;
  /** Column visible by default */
  defaultVisible?: boolean;
  /** Alignment */
  align?: "left" | "center" | "right";
  /** Min width */
  minWidth?: number;
};

type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  data: T[];
  /** Unique key accessor per row */
  rowKey: (row: T) => string;
  /** Click handler for rows */
  onRowClick?: (row: T) => void;
  /** Table title */
  title?: string;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Show the column visibility toggle */
  showColumnToggle?: boolean;
  /** Show CSV export button */
  showExport?: boolean;
  /** Additional toolbar actions */
  toolbarActions?: React.ReactNode;
  className?: string;
};

/* ─── Component ──────────────────────────────────────── */

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  title,
  searchPlaceholder = "Search\u2026",
  showColumnToggle = true,
  showExport = true,
  toolbarActions,
  className,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultVisible !== false).map((c) => c.id))
  );
  const [showColPicker, setShowColPicker] = useState(false);

  const activeColumns = useMemo(
    () => columns.filter((c) => visibleCols.has(c.id)),
    [columns, visibleCols]
  );

  const toggleSort = useCallback(
    (colId: string) => {
      if (sortCol === colId) {
        setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
        if (sortDir === "desc") setSortCol(null);
      } else {
        setSortCol(colId);
        setSortDir("asc");
      }
    },
    [sortCol, sortDir]
  );

  const filteredData = useMemo(() => {
    let result = data;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const val = col.accessorFn(row);
          return val != null && String(val).toLowerCase().includes(q);
        })
      );
    }

    if (sortCol && sortDir) {
      const col = columns.find((c) => c.id === sortCol);
      if (col) {
        result = [...result].sort((a, b) => {
          const aVal = col.accessorFn(a) ?? "";
          const bVal = col.accessorFn(b) ?? "";
          const cmp = typeof aVal === "number" && typeof bVal === "number"
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [data, search, sortCol, sortDir, columns]);

  const handleExportCSV = useCallback(() => {
    const headers = activeColumns.map((c) => c.header).join(",");
    const rows = filteredData.map((row) =>
      activeColumns.map((col) => {
        const val = col.accessorFn(row);
        const str = val == null ? "" : String(val);
        return str.includes(",") ? `"${str}"` : str;
      }).join(",")
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeColumns, filteredData, title]);

  const handleCopyClipboard = useCallback(() => {
    const headers = activeColumns.map((c) => c.header).join("\t");
    const rows = filteredData.map((row) =>
      activeColumns.map((col) => col.accessorFn(row) ?? "").join("\t")
    );
    navigator.clipboard.writeText([headers, ...rows].join("\n"));
  }, [activeColumns, filteredData]);

  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          {title && (
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          )}
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground outline-none transition placeholder:text-tertiary focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {toolbarActions}

          {showColumnToggle && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColPicker(!showColPicker)}
                className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                Columns
              </button>
              {showColPicker && (
                <ColumnPicker
                  columns={columns}
                  visible={visibleCols}
                  onToggle={(id) =>
                    setVisibleCols((prev) => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    })
                  }
                  onClose={() => setShowColPicker(false)}
                />
              )}
            </div>
          )}

          {showExport && (
            <>
              <button
                type="button"
                onClick={handleExportCSV}
                className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={handleCopyClipboard}
                className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                Copy
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-elevated/40">
              {activeColumns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    "whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground",
                    col.sortable && "cursor-pointer select-none hover:text-foreground",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center"
                  )}
                  style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                  onClick={() => col.sortable && toggleSort(col.id)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortCol === col.id && (
                      <SortArrow dir={sortDir} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={activeColumns.length}
                  className="px-4 py-12 text-center text-xs text-muted-foreground"
                >
                  No results found.
                </td>
              </tr>
            ) : (
              filteredData.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "border-b border-border transition last:border-b-0",
                    onRowClick && "cursor-pointer hover:bg-elevated/30"
                  )}
                >
                  {activeColumns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        "whitespace-nowrap px-4 py-2.5 tabular-nums",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center"
                      )}
                    >
                      {col.cell ? col.cell(row) : String(col.accessorFn(row) ?? "\u2014")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2 text-2xs text-muted-foreground">
        {filteredData.length} {filteredData.length === 1 ? "row" : "rows"}
        {search && ` (filtered from ${data.length})`}
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────── */

function ColumnPicker<T>({
  columns,
  visible,
  onToggle,
  onClose,
}: {
  columns: ColumnDef<T>[];
  visible: Set<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-56 animate-fade-in rounded-lg border border-border bg-card p-2 shadow-xl">
        <p className="mb-2 px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Toggle columns
        </p>
        {columns.map((col) => (
          <label
            key={col.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground transition hover:bg-elevated"
          >
            <input
              type="checkbox"
              checked={visible.has(col.id)}
              onChange={() => onToggle(col.id)}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            {col.header}
          </label>
        ))}
      </div>
    </>
  );
}

function SortArrow({ dir }: { dir: SortDirection }) {
  if (!dir) return null;
  return (
    <svg viewBox="0 0 8 10" fill="currentColor" className="h-2.5 w-2">
      {dir === "asc" ? (
        <path d="M4 0L8 6H0z" />
      ) : (
        <path d="M4 10L0 4h8z" />
      )}
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1ZM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
    </svg>
  );
}
