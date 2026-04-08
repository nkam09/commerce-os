"use client";

import { useState, useMemo, useCallback } from "react";
import { useApiData } from "@/hooks/use-api-data";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent } from "@/lib/utils/formatters";
import { AIInsightBanner } from "@/components/pages/dashboard/ai-insight-banner";
import { ProductSettingsModal } from "@/components/pages/products/product-settings-modal";
import type { ProductsPageData, ProductManagementRow } from "@/lib/services/products-service";

// ─── Sort ────────────────────────────────────────────────────────────────────

type SortKey = "title" | "price" | "cogs" | "profitPerUnit" | "unsellableReturnsPct";
type SortDir = "asc" | "desc";

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      viewBox="0 0 8 12"
      className={cn("h-3 w-2 ml-0.5 inline-block", active ? "text-foreground" : "text-tertiary")}
      fill="currentColor"
    >
      <path d="M4 0L7 4H1L4 0Z" opacity={active && dir === "asc" ? 1 : 0.3} />
      <path d="M4 12L1 8H7L4 12Z" opacity={active && dir === "desc" ? 1 : 0.3} />
    </svg>
  );
}

// ─── Tag Colors ──────────────────────────────────────────────────────────────

const tagColors: Record<string, string> = {
  FBA: "bg-blue-500/20 text-blue-400",
  FBM: "bg-orange-500/20 text-orange-400",
  PL: "bg-purple-500/20 text-purple-400",
  Kitchen: "bg-green-500/20 text-green-400",
  Fitness: "bg-cyan-500/20 text-cyan-400",
  Home: "bg-amber-500/20 text-amber-400",
  Electronics: "bg-pink-500/20 text-pink-400",
};

function TagPill({ tag }: { tag: string }) {
  const color = tagColors[tag] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold", color)}>
      {tag}
    </span>
  );
}

// ─── Editable COGS Cell ─────────────────────────────────────────────────────

function EditableCogsCell({ value }: { value: number }) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value.toFixed(2));

  if (editing) {
    return (
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditing(false);
        }}
        autoFocus
        className="w-16 rounded border border-primary bg-elevated px-1.5 py-0.5 text-xs tabular-nums text-foreground outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="tabular-nums text-foreground hover:text-primary transition cursor-pointer"
    >
      {formatCurrency(value)}
    </button>
  );
}

// ─── Product Cell ────────────────────────────────────────────────────────────

function ProductCell({ product }: { product: ProductManagementRow }) {
  const initial = product.title.charAt(0).toUpperCase();
  const badgeColor =
    product.fulfillment === "FBA"
      ? "bg-blue-500/20 text-blue-400"
      : "bg-orange-500/20 text-orange-400";

  return (
    <div className="flex items-center gap-2.5 min-w-[240px]">
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt=""
          className="h-10 w-10 rounded border border-border object-cover shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded border border-border bg-elevated flex items-center justify-center shrink-0">
          <span className="text-sm font-semibold text-muted-foreground">{initial}</span>
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground truncate max-w-[220px]">{product.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-2xs text-muted-foreground font-mono">{product.asin}</span>
          <span className="text-2xs text-muted-foreground">SKU: {product.sku}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-2xs tabular-nums text-foreground">{formatCurrency(product.price)}</span>
          <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold", badgeColor)}>
            {product.fulfillment}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Info Tooltip Icon ───────────────────────────────────────────────────────

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span className="inline-block ml-1 cursor-help" title={tooltip}>
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-muted-foreground">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a.75.75 0 110 1.5A.75.75 0 018 4zm1 8H7V7h2v5z" />
      </svg>
    </span>
  );
}

// ─── Main Table ──────────────────────────────────────────────────────────────

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z" />
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 001.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 003.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z" />
    </svg>
  );
}

function ProductsTable({ products }: { products: ProductManagementRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [settingsProduct, setSettingsProduct] = useState<ProductManagementRow | null>(null);

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedRows((prev) => {
      if (prev.size === products.length) return new Set();
      return new Set(products.map((p) => p.id));
    });
  }, [products]);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.asin.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
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
    const headers = ["Title", "ASIN", "SKU", "Price", "Fulfillment", "Tags", "COGS", "Unsellable %", "Shipping", "Profit/Unit"];
    const rows = sorted.map((p) => [
      `"${p.title}"`,
      p.asin,
      p.sku,
      p.price.toFixed(2),
      p.fulfillment,
      `"${p.tags.join(", ")}"`,
      p.cogs.toFixed(2),
      (p.unsellableReturnsPct * 100).toFixed(1) + "%",
      p.shippingProfile,
      p.profitPerUnit.toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted]);

  const thClass =
    "px-3 py-2 text-left text-2xs font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition";
  const tdClass = "px-3 py-2 text-xs whitespace-nowrap";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-3">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
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
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr className="bg-elevated/50">
              <th className={cn(thClass, "w-10")}>
                <input
                  type="checkbox"
                  checked={selectedRows.size === products.length && products.length > 0}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-border"
                />
              </th>
              <th className={thClass} onClick={() => handleSort("title")}>
                Product
                <SortArrow active={sortKey === "title"} dir={sortDir} />
              </th>
              <th className={thClass}>Tags</th>
              <th className={thClass} onClick={() => handleSort("cogs")}>
                COGS
                <SortArrow active={sortKey === "cogs"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("unsellableReturnsPct")}>
                Unsellable %
                <InfoIcon tooltip="Percentage of returns that are unsellable and cannot be resold" />
                <SortArrow active={sortKey === "unsellableReturnsPct"} dir={sortDir} />
              </th>
              <th className={thClass}>Shipping Profile</th>
              <th className={thClass} onClick={() => handleSort("profitPerUnit")}>
                Profit / Unit
                <SortArrow active={sortKey === "profitPerUnit"} dir={sortDir} />
              </th>
              <th className={cn(thClass, "w-10")} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-elevated/20 transition">
                <td className={tdClass}>
                  <input
                    type="checkbox"
                    checked={selectedRows.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                </td>
                <td className={tdClass}>
                  <ProductCell product={p} />
                </td>
                <td className={tdClass}>
                  <div className="flex items-center gap-1 flex-wrap max-w-[180px]">
                    {p.tags.map((tag) => (
                      <TagPill key={tag} tag={tag} />
                    ))}
                  </div>
                </td>
                <td className={tdClass}>
                  <EditableCogsCell value={p.cogs} />
                </td>
                <td className={cn(tdClass, "tabular-nums text-muted-foreground")}>
                  {formatPercent(p.unsellableReturnsPct)}
                </td>
                <td className={tdClass}>
                  <select
                    defaultValue={p.shippingProfile}
                    className="bg-transparent text-xs text-foreground outline-none cursor-pointer border-none"
                  >
                    <option value="Default">Default</option>
                    <option value="Oversized">Oversized</option>
                    <option value="Small & Light">Small &amp; Light</option>
                    <option value="Custom">Custom</option>
                  </select>
                </td>
                <td className={tdClass}>
                  <span
                    className={cn(
                      "tabular-nums font-medium",
                      p.profitPerUnit >= 0 ? "text-green-400" : "text-red-400"
                    )}
                  >
                    {formatCurrency(p.profitPerUnit)}
                  </span>
                </td>
                <td className={tdClass}>
                  <button
                    type="button"
                    onClick={() => setSettingsProduct(p)}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated transition"
                    title="Product settings"
                  >
                    <GearIcon className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border text-2xs text-muted-foreground">
        <span>
          {selectedRows.size > 0
            ? `${selectedRows.size} selected`
            : `${sorted.length} products`}
        </span>
        <span>
          Avg profit/unit:{" "}
          <span className="tabular-nums text-foreground">
            {formatCurrency(
              sorted.length > 0
                ? sorted.reduce((s, p) => s + p.profitPerUnit, 0) / sorted.length
                : 0
            )}
          </span>
        </span>
      </div>

      {/* Product Settings Modal */}
      {settingsProduct && (
        <ProductSettingsModal
          open={!!settingsProduct}
          onClose={() => setSettingsProduct(null)}
          product={settingsProduct}
        />
      )}
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-lg border border-border bg-card h-16" />
      <div className="rounded-lg border border-border bg-card h-96" />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProductsManagement({ initialData }: { initialData?: ProductsPageData }) {
  const { data: apiData, isLoading, isError, error, refetch } =
    useApiData<ProductsPageData>(initialData ? null : "/api/pages/products-management");
  const data = initialData ?? apiData;

  const [cogsFilter, setCogsFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");

  const selectClass =
    "rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary cursor-pointer";

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-sm text-red-400 font-medium">Failed to load products</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <button
            onClick={refetch}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-elevated transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const missingCogsCount = data.products.filter((p) => p.cogs === 0).length;

  return (
    <div className="space-y-4 p-6">
     <AIInsightBanner
        message={`${data.products.length} products tracked. Average profit per unit: ${formatCurrency(data.products.reduce((s, p) => s + p.profitPerUnit, 0) / data.products.length)}. ${data.products.sort((a, b) => b.profitPerUnit - a.profitPerUnit)[0]?.title ?? "N/A"} has the highest profit margin at ${formatCurrency(data.products.sort((a, b) => b.profitPerUnit - a.profitPerUnit)[0]?.profitPerUnit ?? 0)}/unit. ${missingCogsCount > 0 ? `${missingCogsCount} products are missing COGS data.` : "All products have COGS configured."}`}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={cogsFilter} onChange={(e) => setCogsFilter(e.target.value)} className={selectClass}>
          <option value="all">All COGS</option>
          <option value="set">COGS Set</option>
          <option value="missing">COGS Missing</option>
        </select>

        <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className={selectClass}>
          <option value="all">All Types</option>
          <option value="fba">FBA Only</option>
          <option value="fbm">FBM Only</option>
        </select>
      </div>

      {data.products.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm font-medium text-foreground">No products</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your first product to get started.
          </p>
        </div>
      ) : (
        <ProductsTable products={data.products} />
      )}
    </div>
  );
}
