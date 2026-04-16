import { createColumnHelper } from "@tanstack/react-table";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils/formatters";
import type { ProductRow } from "./types";

const col = createColumnHelper<ProductRow>();

// ─── Helper renderers ───────────────────────────────────────────────────────

function CurrencyCell({ value }: { value: number }) {
  return <span className="text-sm tabular-nums">{formatCurrency(value)}</span>;
}

function NegativeCurrencyCell({ value }: { value: number }) {
  return (
    <span className="text-sm tabular-nums text-danger">
      {value > 0 ? `-${formatCurrency(value)}` : "$0.00"}
    </span>
  );
}

function AcosCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-sm text-muted-foreground">--</span>;
  const pct = value * 100;
  return (
    <span
      className={cn(
        "text-sm tabular-nums font-medium",
        pct < 20 ? "text-success" : pct <= 35 ? "text-warning" : "text-danger"
      )}
    >
      {pct.toFixed(1)}%
    </span>
  );
}

function TacosCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-sm text-muted-foreground">--</span>;
  const pct = value * 100;
  return (
    <span
      className={cn(
        "text-sm tabular-nums font-medium",
        pct < 15 ? "text-success" : pct <= 25 ? "text-warning" : "text-danger"
      )}
    >
      {pct.toFixed(1)}%
    </span>
  );
}

function DaysLeftBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-sm text-muted-foreground">--</span>;
  const d = Math.round(value);
  let colorClass = "bg-success/15 text-success";
  if (d === 0) colorClass = "bg-red-600/20 text-red-400 font-semibold";
  else if (d < 30) colorClass = "bg-danger/15 text-danger";
  else if (d <= 60) colorClass = "bg-warning/15 text-warning";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", colorClass)}>
      {d}d
    </span>
  );
}

// ─── Column definitions ─────────────────────────────────────────────────────

export const columns = [
  col.accessor("title", {
    id: "product",
    header: "Product",
    size: 320,
    minSize: 180,
    enableHiding: false,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex items-center gap-2 md:gap-3 min-w-[160px] md:min-w-[260px]">
          <div className="h-9 w-9 md:h-10 md:w-10 rounded-md bg-muted flex-shrink-0 overflow-hidden">
            {r.imageUrl ? (
              <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground font-medium bg-elevated">
                {(r.title ?? r.asin).charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs md:text-sm font-medium text-foreground line-clamp-2 leading-tight">
              {r.title ?? r.asin}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-2xs md:text-xs text-muted-foreground font-mono">{r.asin}</span>
              {r.sku && (
                <>
                  <span className="text-muted-foreground/40 hidden md:inline">|</span>
                  <span className="text-xs text-muted-foreground hidden md:inline">{r.sku}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {r.price > 0 && (
                <span className="text-2xs md:text-xs text-muted-foreground">{formatCurrency(r.price)}</span>
              )}
              {r.cogs > 0 && (
                <span className="inline-flex items-center rounded bg-elevated px-1 md:px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  COGS {formatCurrency(r.cogs)}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    },
    sortingFn: (a, b) => {
      const at = (a.original.title ?? a.original.asin).toLowerCase();
      const bt = (b.original.title ?? b.original.asin).toLowerCase();
      return at.localeCompare(bt);
    },
  }),

  col.accessor("grossSales", {
    header: "Gross Sales",
    cell: ({ getValue }) => <CurrencyCell value={getValue()} />,
    meta: { align: "right" },
  }),

  col.accessor("netRevenue", {
    header: "Net Revenue",
    cell: ({ getValue }) => <CurrencyCell value={getValue()} />,
    meta: { align: "right" },
  }),

  col.accessor("units", {
    header: "Units",
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums">{formatNumber(getValue())}</span>
    ),
    meta: { align: "right" },
  }),

  col.accessor("fees", {
    header: "Fees",
    cell: ({ getValue }) => <NegativeCurrencyCell value={getValue()} />,
    meta: { align: "right" },
  }),

  col.accessor("cogs", {
    id: "totalCogs",
    header: "COGS",
    cell: ({ row }) => {
      const total = row.original.cogs * row.original.units;
      return <NegativeCurrencyCell value={total} />;
    },
    sortingFn: (a, b) => {
      const aVal = a.original.cogs * a.original.units;
      const bVal = b.original.cogs * b.original.units;
      return aVal - bVal;
    },
    meta: { align: "right" },
  }),

  col.accessor("adSpend", {
    header: "Ad Spend",
    cell: ({ getValue }) => <CurrencyCell value={getValue()} />,
    meta: { align: "right" },
  }),

  col.accessor("acos", {
    header: "ACOS",
    cell: ({ getValue }) => <AcosCell value={getValue()} />,
    sortUndefined: "last",
    meta: { align: "right" },
  }),

  col.accessor("tacos", {
    header: "TACOS",
    cell: ({ getValue }) => <TacosCell value={getValue()} />,
    sortUndefined: "last",
    meta: { align: "right" },
  }),

  col.accessor("netProfit", {
    header: "Net Profit",
    cell: ({ getValue }) => {
      const v = getValue();
      return (
        <span className={cn("text-sm tabular-nums font-semibold", v >= 0 ? "text-success" : "text-danger")}>
          {formatCurrency(v)}
        </span>
      );
    },
    meta: { align: "right" },
  }),

  col.accessor("margin", {
    header: "Margin",
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null) return <span className="text-sm text-muted-foreground">--</span>;
      return <span className="text-sm tabular-nums">{formatPercent(v)}</span>;
    },
    sortUndefined: "last",
    meta: { align: "right" },
  }),

  col.accessor("stock", {
    header: "Stock",
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums">
        {formatNumber(getValue())} <span className="text-muted-foreground text-xs">units</span>
      </span>
    ),
    meta: { align: "right" },
  }),

  col.accessor("daysLeft", {
    header: "Days Left",
    cell: ({ getValue }) => <DaysLeftBadge value={getValue()} />,
    sortUndefined: "last",
    meta: { align: "right" },
  }),

  col.accessor("refundCount", {
    id: "refunds",
    header: "Refunds",
    cell: ({ row }) => {
      const count = row.original.refundCount;
      const amount = row.original.refunds;
      if (count === 0 && amount === 0) {
        return <span className="text-sm tabular-nums text-muted-foreground">0</span>;
      }
      return (
        <div className="text-right">
          <span className="text-sm tabular-nums font-medium text-warning">
            {formatNumber(count)}
          </span>
          {amount > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground ml-1">
              (-{formatCurrency(amount)})
            </span>
          )}
        </div>
      );
    },
    sortingFn: (a, b) => a.original.refundCount - b.original.refundCount,
    meta: { align: "right" },
  }),

  col.accessor("refundPct", {
    header: "% Refunds",
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null) return <span className="text-sm text-muted-foreground">--</span>;
      return <span className="text-sm tabular-nums">{formatPercent(v)}</span>;
    },
    sortUndefined: "last",
    meta: { align: "right" },
  }),

  col.accessor("amazonFees", {
    header: "Amazon Fees",
    cell: ({ getValue }) => <CurrencyCell value={getValue()} />,
    meta: { align: "right" },
  }),

  col.accessor("estPayout", {
    header: "Est. Payout",
    cell: ({ getValue }) => <CurrencyCell value={getValue()} />,
    meta: { align: "right" },
  }),

  col.accessor("roi", {
    header: "ROI",
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null) return <span className="text-sm text-muted-foreground">--</span>;
      return <span className="text-sm tabular-nums">{formatPercent(v)}</span>;
    },
    sortUndefined: "last",
    meta: { align: "right" },
  }),
];

// ─── Default column visibility ──────────────────────────────────────────────

export const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  product: true,
  grossSales: true,
  netRevenue: true,
  units: true,
  fees: true,
  totalCogs: true,
  adSpend: true,
  acos: true,
  tacos: true,
  netProfit: true,
  margin: true,
  stock: true,
  daysLeft: true,
  refunds: true,
  refundPct: true,
  amazonFees: true,
  estPayout: true,
  roi: true,
};

// Hidden by default columns (toggled via Columns button)
export const HIDDEN_COLUMNS: string[] = [
  "sellableReturns",
  "refundCost",
  "expenses",
  "bsr",
  "realAcos",
  "sessions",
  "unitSessionPct",
  "shippingCosts",
];

// Column groups for the column picker
export const COLUMN_GROUPS: { label: string; columns: { id: string; label: string }[] }[] = [
  {
    label: "Product",
    columns: [{ id: "product", label: "Product" }],
  },
  {
    label: "Revenue",
    columns: [
      { id: "grossSales", label: "Gross Sales" },
      { id: "netRevenue", label: "Net Revenue" },
      { id: "units", label: "Units" },
    ],
  },
  {
    label: "Costs",
    columns: [
      { id: "fees", label: "Fees" },
      { id: "totalCogs", label: "COGS" },
      { id: "amazonFees", label: "Amazon Fees" },
    ],
  },
  {
    label: "Advertising",
    columns: [
      { id: "adSpend", label: "Ad Spend" },
      { id: "acos", label: "ACOS" },
      { id: "tacos", label: "TACOS" },
    ],
  },
  {
    label: "Profit",
    columns: [
      { id: "netProfit", label: "Net Profit" },
      { id: "margin", label: "Margin" },
      { id: "estPayout", label: "Est. Payout" },
      { id: "roi", label: "ROI" },
    ],
  },
  {
    label: "Inventory",
    columns: [
      { id: "stock", label: "Stock" },
      { id: "daysLeft", label: "Days Left" },
    ],
  },
  {
    label: "Returns",
    columns: [
      { id: "refunds", label: "Refunds" },
      { id: "refundPct", label: "% Refunds" },
    ],
  },
];
