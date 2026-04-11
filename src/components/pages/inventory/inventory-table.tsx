"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/formatters";
import type { InventoryProductRow } from "@/lib/services/inventory-service";

type Props = {
  products: InventoryProductRow[];
  onOpenSettings: (productId: string) => void;
};

type SortKey =
  | "title"
  | "fbaStock"
  | "fbmStock"
  | "daysOfStockLeft"
  | "salesVelocity"
  | "sentToFba"
  | "ordered"
  | "daysUntilNextOrder"
  | "recommendedReorderQty"
  | "stockValue"
  | "roi";
type SortDir = "asc" | "desc";

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      viewBox="0 0 8 12"
      className={cn(
        "h-3 w-2 ml-0.5 inline-block",
        active ? "text-foreground" : "text-tertiary"
      )}
      fill="currentColor"
    >
      <path d="M4 0L7 4H1L4 0Z" opacity={active && dir === "asc" ? 1 : 0.3} />
      <path d="M4 12L1 8H7L4 12Z" opacity={active && dir === "desc" ? 1 : 0.3} />
    </svg>
  );
}

function MiniSparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block ml-1.5 align-middle">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-teal-400"
      />
    </svg>
  );
}

function DaysOfStockBadge({ days }: { days: number }) {
  const color =
    days > 60
      ? "bg-green-500/20 text-green-400"
      : days >= 30
      ? "bg-yellow-500/20 text-yellow-400"
      : "bg-red-500/20 text-red-400";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold tabular-nums",
        color
      )}
    >
      {days}d
    </span>
  );
}

function FulfillmentBadge({ type }: { type: string }) {
  const color =
    type === "FBA"
      ? "bg-blue-500/20 text-blue-400"
      : "bg-orange-500/20 text-orange-400";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold",
        color
      )}
    >
      {type}
    </span>
  );
}

function ProductCell({ product }: { product: InventoryProductRow }) {
  const initial = product.title.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2 md:gap-2.5 min-w-[200px] md:min-w-[240px] max-w-[260px] md:max-w-none">
      {/* Image or letter fallback */}
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt=""
          className="h-8 w-8 md:h-10 md:w-10 rounded border border-border object-cover shrink-0"
        />
      ) : (
        <div className="h-8 w-8 md:h-10 md:w-10 rounded border border-border bg-elevated flex items-center justify-center shrink-0">
          <span className="text-xs md:text-sm font-semibold text-muted-foreground">
            {initial}
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-2xs md:text-xs font-medium text-foreground truncate max-w-[160px] md:max-w-[200px]">
          {product.title}
        </p>
        <div className="flex items-center gap-1.5 md:gap-2 mt-0.5">
          <span className="text-[10px] md:text-2xs text-muted-foreground font-mono truncate">
            {product.asin}
          </span>
          <FulfillmentBadge type={product.fulfillment} />
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 mt-0.5 min-w-0">
          <span className="text-[10px] md:text-2xs text-muted-foreground truncate max-w-[80px] md:max-w-none">
            FNSKU: {product.fnsku}
          </span>
          <span className="text-[10px] md:text-2xs text-muted-foreground truncate max-w-[80px] md:max-w-none">
            SKU: {product.sku}
          </span>
        </div>
        <span className="text-[10px] md:text-2xs text-muted-foreground">
          COGS: {formatCurrency(product.cogs)}
        </span>
      </div>
    </div>
  );
}

function ThreeDotMenu({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="rounded p-1 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] rounded-md border border-border bg-card shadow-lg py-1">
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-elevated transition"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onOpenSettings();
              }}
            >
              Product Settings
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function InventoryTable({ products, onOpenSettings }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("daysOfStockLeft");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.asin.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.fnsku.toLowerCase().includes(q)
    );
  }, [products, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av) ?? 0;
      const bn = Number(bv) ?? 0;
      return sortDir === "asc" ? an - bn : bn - an;
    });
  }, [filtered, sortKey, sortDir]);

  const downloadCSV = useCallback(() => {
    const headers = [
      "Title",
      "ASIN",
      "SKU",
      "FNSKU",
      "COGS",
      "Fulfillment",
      "FBA Stock",
      "FBM Stock",
      "Reserved",
      "Sales Velocity",
      "Days of Stock",
      "Sent to FBA",
      "Prep Center",
      "Ordered",
      "Days Until Order",
      "Reorder Qty",
      "Stock Value",
      "ROI",
      "Comment",
    ];
    const rows = sorted.map((p) => [
      `"${p.title}"`,
      p.asin,
      p.sku,
      p.fnsku,
      p.cogs.toFixed(2),
      p.fulfillment,
      p.fbaStock,
      p.fbmStock,
      p.reserved,
      p.salesVelocity.toFixed(1),
      p.daysOfStockLeft,
      p.sentToFba,
      p.prepCenterStock,
      p.ordered,
      p.daysUntilNextOrder ?? "",
      p.recommendedReorderQty,
      p.stockValue.toFixed(2),
      p.roi.toFixed(1),
      `"${p.comment}"`,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-planner.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted]);

  const thClass =
    "px-2 md:px-3 py-2 text-left text-2xs font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition min-w-[60px]";
  const tdClass = "px-2 md:px-3 py-2 text-2xs md:text-xs whitespace-nowrap min-w-[60px]";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-border gap-2 md:gap-3">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-[240px] md:w-64 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center gap-2">
          <span className="text-2xs text-muted-foreground">
            {sorted.length} product{sorted.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={downloadCSV}
            className="rounded-md border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-3.5 w-3.5 inline-block mr-1"
            >
              <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3M8 2v9M5 8l3 3 3-3" />
            </svg>
            CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1400px]">
          <thead>
            <tr className="bg-elevated/50">
              <th className={cn(thClass, "sticky left-0 z-10 bg-elevated/50")} onClick={() => handleSort("title")}>
                Product
                <SortArrow active={sortKey === "title"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("fbaStock")}>
                FBA Stock
                <SortArrow active={sortKey === "fbaStock"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("fbmStock")}>
                FBM Stock
                <SortArrow active={sortKey === "fbmStock"} dir={sortDir} />
              </th>
              <th className={thClass}>Reserved</th>
              <th className={thClass} onClick={() => handleSort("salesVelocity")}>
                Velocity
                <SortArrow active={sortKey === "salesVelocity"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("daysOfStockLeft")}>
                Days Left
                <SortArrow active={sortKey === "daysOfStockLeft"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("sentToFba")}>
                Sent to FBA
                <SortArrow active={sortKey === "sentToFba"} dir={sortDir} />
              </th>
              <th className={thClass}>Prep Center</th>
              <th className={thClass} onClick={() => handleSort("ordered")}>
                Ordered
                <SortArrow active={sortKey === "ordered"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("daysUntilNextOrder")}>
                Next Order
                <SortArrow active={sortKey === "daysUntilNextOrder"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("recommendedReorderQty")}>
                Reorder Qty
                <SortArrow active={sortKey === "recommendedReorderQty"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("stockValue")}>
                Stock Value
                <SortArrow active={sortKey === "stockValue"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("roi")}>
                ROI
                <SortArrow active={sortKey === "roi"} dir={sortDir} />
              </th>
              <th className={thClass}>Comment</th>
              <th className={cn(thClass, "w-10")} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.id}
                className="border-t border-border hover:bg-elevated/20 transition"
              >
                <td className={cn(tdClass, "sticky left-0 z-10 bg-card")}>
                  <ProductCell product={p} />
                </td>
                <td className={cn(tdClass, "tabular-nums")}>
                  {formatNumber(p.fbaStock)}
                  <MiniSparkline data={p.stockHistory} />
                </td>
                <td className={cn(tdClass, "tabular-nums")}>
                  {formatNumber(p.fbmStock)}
                </td>
                <td className={cn(tdClass, "tabular-nums text-muted-foreground")}>
                  {formatNumber(p.reserved)}
                </td>
                <td className={cn(tdClass, "tabular-nums")}>
                  {p.salesVelocity.toFixed(1)}/d
                </td>
                <td className={tdClass}>
                  <DaysOfStockBadge days={p.daysOfStockLeft} />
                </td>
                <td className={tdClass}>
                  <div className="flex items-center gap-1.5">
                    <span className="tabular-nums">
                      {formatNumber(p.sentToFba)}
                    </span>
                    {p.sentToFbaStatus !== "None" && (
                      <span
                        className={cn(
                          "text-2xs",
                          p.sentToFbaStatus === "In Transit"
                            ? "text-yellow-400"
                            : "text-green-400"
                        )}
                      >
                        {p.sentToFbaStatus}
                      </span>
                    )}
                  </div>
                </td>
                <td className={cn(tdClass, "tabular-nums")}>
                  {formatNumber(p.prepCenterStock)}
                </td>
                <td className={cn(tdClass, "tabular-nums")}>
                  {formatNumber(p.ordered)}
                </td>
                <td className={tdClass}>
                  {p.daysUntilNextOrder != null ? (
                    <DaysOfStockBadge days={p.daysUntilNextOrder} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={cn(tdClass, "tabular-nums font-medium")}>
                  {formatNumber(p.recommendedReorderQty)}
                </td>
                <td className={cn(tdClass, "tabular-nums")}>
                  {formatCurrency(p.stockValue)}
                </td>
                <td className={cn(tdClass, "tabular-nums")}>
                  <span
                    className={cn(
                      p.roi >= 3 ? "text-green-400" : p.roi >= 2 ? "text-yellow-400" : "text-red-400"
                    )}
                  >
                    {p.roi.toFixed(1)}x
                  </span>
                </td>
                <td className={tdClass}>
                  <input
                    type="text"
                    defaultValue={p.comment}
                    placeholder="Add comment..."
                    className="w-40 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-2xs text-muted-foreground outline-none hover:border-border focus:border-border focus:bg-elevated focus:text-foreground transition"
                  />
                </td>
                <td className={tdClass}>
                  <ThreeDotMenu onOpenSettings={() => onOpenSettings(p.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border text-2xs text-muted-foreground">
        <span>{sorted.length} products</span>
        <span>
          Total stock value:{" "}
          <span className="tabular-nums text-foreground">
            {formatCurrency(sorted.reduce((s, p) => s + p.stockValue, 0))}
          </span>
        </span>
      </div>
    </div>
  );
}
