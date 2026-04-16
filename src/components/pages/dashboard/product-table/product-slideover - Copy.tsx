"use client";

import type { ProductRow } from "./types";
import { formatCurrency, formatNumber } from "@/lib/utils/formatters";

type Props = {
  product: ProductRow;
  onClose: () => void;
};

export function ProductSlideOver({ product, onClose }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-[480px] max-w-full bg-card border-l border-border shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {product.title ?? product.asin}
            </p>
            <p className="text-xs text-muted-foreground font-mono">{product.asin}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-3"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — placeholder for full P&L breakdown */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                P&L Summary
              </p>
              <div className="space-y-2">
                <PlRow label="Gross Sales" value={formatCurrency(product.grossSales)} />
                <PlRow label="Net Revenue" value={formatCurrency(product.netRevenue)} />
                <PlRow
                  label="Fees"
                  value={`-${formatCurrency(product.fees)}`}
                  negative
                />
                <PlRow
                  label="COGS"
                  value={`-${formatCurrency(product.cogs * product.units)}`}
                  negative
                />
                <PlRow label="Ad Spend" value={formatCurrency(product.adSpend)} />
                <div className="border-t border-border pt-2 mt-2">
                  <PlRow
                    label="Net Profit"
                    value={formatCurrency(product.netProfit)}
                    bold
                    highlight={product.netProfit >= 0 ? "positive" : "negative"}
                  />
                </div>
                {product.margin !== null && (
                  <PlRow
                    label="Margin"
                    value={`${(product.margin * 100).toFixed(1)}%`}
                  />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Inventory
              </p>
              <div className="space-y-2">
                <PlRow label="Stock" value={`${formatNumber(product.stock)} units`} />
                <PlRow
                  label="Days Left"
                  value={
                    product.daysLeft !== null ? `${Math.round(product.daysLeft)}d` : "--"
                  }
                />
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border bg-elevated/20 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Full P&L breakdown coming soon
              </p>
              <p className="text-xs text-tertiary mt-1">
                Detailed fee breakdowns, daily trends, and margin analysis
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PlRow({
  label,
  value,
  negative,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  negative?: boolean;
  bold?: boolean;
  highlight?: "positive" | "negative";
}) {
  let valueClass = "text-foreground";
  if (negative) valueClass = "text-danger";
  if (highlight === "positive") valueClass = "text-success";
  if (highlight === "negative") valueClass = "text-danger";

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-sm tabular-nums ${valueClass} ${bold ? "font-semibold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
