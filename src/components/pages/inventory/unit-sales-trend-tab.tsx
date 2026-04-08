"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { formatNumber } from "@/lib/utils/formatters";
import type { UnitSalesTrendRow, ForecastProduct } from "@/lib/services/restock-service";

type Props = {
  data: UnitSalesTrendRow[];
  forecast: ForecastProduct[];
};

type SortKey =
  | "title"
  | "fbaStock"
  | "sold_today"
  | "sold_yesterday"
  | "sold_d7"
  | "sold_d14"
  | "sold_d30"
  | "sold_d60"
  | "sold_d90"
  | "sold_d180"
  | "sold_d365"
  | "vel_d7"
  | "vel_d14"
  | "vel_d30"
  | "vel_d60"
  | "vel_d90"
  | "vel_d180"
  | "vel_d365";

function getSortValue(row: UnitSalesTrendRow, key: SortKey): number | string {
  switch (key) {
    case "title": return row.title;
    case "fbaStock": return row.fbaStock;
    case "sold_today": return row.unitsSold.today ?? -1;
    case "sold_yesterday": return row.unitsSold.yesterday ?? -1;
    case "sold_d7": return row.unitsSold.d7 ?? -1;
    case "sold_d14": return row.unitsSold.d14 ?? -1;
    case "sold_d30": return row.unitsSold.d30 ?? -1;
    case "sold_d60": return row.unitsSold.d60 ?? -1;
    case "sold_d90": return row.unitsSold.d90 ?? -1;
    case "sold_d180": return row.unitsSold.d180 ?? -1;
    case "sold_d365": return row.unitsSold.d365 ?? -1;
    case "vel_d7": return row.velocity.d7 ?? -1;
    case "vel_d14": return row.velocity.d14 ?? -1;
    case "vel_d30": return row.velocity.d30 ?? -1;
    case "vel_d60": return row.velocity.d60 ?? -1;
    case "vel_d90": return row.velocity.d90 ?? -1;
    case "vel_d180": return row.velocity.d180 ?? -1;
    case "vel_d365": return row.velocity.d365 ?? -1;
    default: return 0;
  }
}

function fmtVel(v: number | null): string {
  if (v === null) return "\u2014";
  return v.toFixed(1);
}

function fmtSold(v: number | null): string {
  if (v === null) return "\u2014";
  return formatNumber(v);
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function UnitSalesTrendTab({ data, forecast }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("fbaStock");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let rows = data;
    if (q) {
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.asin.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc"
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number);
    });
    return rows;
  }, [data, search, sortKey, sortDir]);

  function handleDownloadForecast() {
    const headers = [
      "ASIN", "SKU", "Title", "FBA Stock", "Order Qty", "Order Date",
      "Stockout Date", "Velocity", "Lead Time (days)", "Runway (days)",
    ];
    const rows = forecast.map((p) => [
      p.asin, p.sku, `"${p.title}"`, String(p.fbaStock),
      String(p.recommendedOrderQty), p.recommendedOrderDate,
      p.projectedStockoutDate, p.salesVelocity.toFixed(1),
      String(p.leadTime.totalDays), String(p.stockRunwayDays),
    ]);
    downloadCsv("restock-forecast.csv", headers, rows);
  }

  function handleDownloadTrend() {
    const headers = [
      "ASIN", "SKU", "Title", "FBA Stock",
      "Sold Today", "Sold Yesterday", "Sold 7d", "Sold 14d", "Sold 30d",
      "Sold 60d", "Sold 90d", "Sold 180d", "Sold 365d",
      "Vel 7d", "Vel 14d", "Vel 30d", "Vel 60d", "Vel 90d", "Vel 180d", "Vel 365d",
    ];
    const rows = data.map((r) => [
      r.asin, r.sku, `"${r.title}"`, String(r.fbaStock),
      String(r.unitsSold.today ?? ""), String(r.unitsSold.yesterday ?? ""),
      String(r.unitsSold.d7 ?? ""), String(r.unitsSold.d14 ?? ""),
      String(r.unitsSold.d30 ?? ""), String(r.unitsSold.d60 ?? ""),
      String(r.unitsSold.d90 ?? ""), String(r.unitsSold.d180 ?? ""),
      String(r.unitsSold.d365 ?? ""),
      fmtVel(r.velocity.d7), fmtVel(r.velocity.d14), fmtVel(r.velocity.d30),
      fmtVel(r.velocity.d60), fmtVel(r.velocity.d90),
      fmtVel(r.velocity.d180), fmtVel(r.velocity.d365),
    ]);
    downloadCsv("unit-sales-trend.csv", headers, rows);
  }

  const thCls =
    "px-2 py-2 text-2xs font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition";

  function SortArrow({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return (
      <span className="ml-0.5 text-primary">
        {sortDir === "asc" ? "\u25B2" : "\u25BC"}
      </span>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/20 w-56"
        />
        <div className="flex-1" />
        <button
          onClick={handleDownloadForecast}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-elevated transition"
        >
          Download forecast as CSV
        </button>
        <button
          onClick={handleDownloadTrend}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-elevated transition"
        >
          Download unit sales trend as CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            {/* Group headers */}
            <tr className="border-b border-border bg-card">
              <th className="px-2 py-1.5 text-left text-2xs font-medium text-muted-foreground" colSpan={4}>
                Product
              </th>
              <th className="px-2 py-1.5 text-center text-2xs font-medium text-muted-foreground border-l border-border" colSpan={9}>
                Units Sold
              </th>
              <th className="px-2 py-1.5 text-center text-2xs font-medium text-muted-foreground border-l border-border" colSpan={7}>
                Sales Velocity (units/day)
              </th>
            </tr>
            {/* Column headers */}
            <tr className="border-b border-border bg-card">
              <th className={cn(thCls, "text-left")} onClick={() => handleSort("title")}>
                Product <SortArrow col="title" />
              </th>
              <th className={cn(thCls, "text-left")}>SKU</th>
              <th className={cn(thCls, "text-left")}>ASIN</th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("fbaStock")}>
                FBA <SortArrow col="fbaStock" />
              </th>
              {/* Units Sold columns */}
              <th className={cn(thCls, "text-right border-l border-border")} onClick={() => handleSort("sold_today")}>
                Today <SortArrow col="sold_today" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("sold_yesterday")}>
                Yest. <SortArrow col="sold_yesterday" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("sold_d7")}>
                7d <SortArrow col="sold_d7" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("sold_d14")}>
                14d <SortArrow col="sold_d14" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("sold_d30")}>
                30d <SortArrow col="sold_d30" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("sold_d60")}>
                60d <SortArrow col="sold_d60" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("sold_d90")}>
                90d <SortArrow col="sold_d90" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("sold_d180")}>
                180d <SortArrow col="sold_d180" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("sold_d365")}>
                365d <SortArrow col="sold_d365" />
              </th>
              {/* Velocity columns */}
              <th className={cn(thCls, "text-right border-l border-border")} onClick={() => handleSort("vel_d7")}>
                7d <SortArrow col="vel_d7" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("vel_d14")}>
                14d <SortArrow col="vel_d14" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("vel_d30")}>
                30d <SortArrow col="vel_d30" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("vel_d60")}>
                60d <SortArrow col="vel_d60" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("vel_d90")}>
                90d <SortArrow col="vel_d90" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("vel_d180")}>
                180d <SortArrow col="vel_d180" />
              </th>
              <th className={cn(thCls, "text-right")} onClick={() => handleSort("vel_d365")}>
                365d <SortArrow col="vel_d365" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border last:border-0 hover:bg-elevated/20 transition"
              >
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-2xs text-muted-foreground shrink-0">
                      IMG
                    </div>
                    <span className="truncate max-w-[180px] text-foreground">
                      {r.title}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                  {r.sku}
                </td>
                <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                  {r.asin}
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground">
                  {formatNumber(r.fbaStock)}
                </td>
                {/* Units Sold */}
                <td className="px-2 py-2 text-right tabular-nums border-l border-border">
                  {fmtSold(r.unitsSold.today)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtSold(r.unitsSold.yesterday)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtSold(r.unitsSold.d7)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtSold(r.unitsSold.d14)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtSold(r.unitsSold.d30)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtSold(r.unitsSold.d60)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtSold(r.unitsSold.d90)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtSold(r.unitsSold.d180)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtSold(r.unitsSold.d365)}
                </td>
                {/* Velocity */}
                <td className="px-2 py-2 text-right tabular-nums border-l border-border">
                  {fmtVel(r.velocity.d7)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtVel(r.velocity.d14)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtVel(r.velocity.d30)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtVel(r.velocity.d60)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtVel(r.velocity.d90)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtVel(r.velocity.d180)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtVel(r.velocity.d365)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
