"use client";

import { useApiData } from "@/hooks/use-api-data";
import { PageLoading } from "@/components/shared/loading";
import { PageError } from "@/components/shared/error";
import { StatusBadge, productStatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/formatters";
import type { ProductDrawerPayload } from "@/lib/services/product-drawer-service";

type Props = {
  productId: string;
  onClose: () => void;
};

export function ProductDrawer({ productId, onClose }: Props) {
  const { data, isLoading, isError, error } =
    useApiData<ProductDrawerPayload>(`/api/products/${productId}/drawer`);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-[480px] bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            {data ? (
              <>
                <p className="text-sm font-semibold">{data.identity.title ?? data.identity.asin}</p>
                <p className="text-xs text-muted-foreground font-mono">{data.identity.asin}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground">Loading…</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && <PageLoading message="Loading product…" />}
          {isError && <PageError message={error ?? undefined} />}
          {data && (
            <div className="p-5 space-y-5">
              {/* Identity */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  {data.identity.brand && (
                    <p className="text-xs text-muted-foreground">{data.identity.brand}</p>
                  )}
                  {data.identity.sku && (
                    <p className="text-xs text-muted-foreground">SKU: {data.identity.sku}</p>
                  )}
                  {data.identity.fnsku && (
                    <p className="text-xs text-muted-foreground">FNSKU: {data.identity.fnsku}</p>
                  )}
                  {data.identity.category && (
                    <p className="text-xs text-muted-foreground">{data.identity.category}</p>
                  )}
                </div>
                {productStatusBadge(data.identity.status)}
              </div>

              {/* Summary cards */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">30-Day Performance</p>
                <div className="grid grid-cols-2 gap-3">
                  <Tile label="Gross Sales" value={formatCurrency(data.summaryCards.grossSales30d)} />
                  <Tile label="Units Sold" value={formatNumber(data.summaryCards.unitsSold30d)} />
                  <Tile label="Ad Spend" value={formatCurrency(data.summaryCards.adSpend30d)} />
                  <Tile
                    label="ACOS"
                    value={data.summaryCards.acos30d != null ? formatPercent(data.summaryCards.acos30d) : "—"}
                  />
                  <Tile label="Total Fees" value={formatCurrency(data.summaryCards.totalFees30d)} />
                  <Tile
                    label="Net Profit"
                    value={formatCurrency(data.summaryCards.netProfit30d)}
                    highlight={data.summaryCards.netProfit30d >= 0 ? "positive" : "negative"}
                  />
                </div>
              </div>

              {/* Inventory block */}
              {data.inventory && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Inventory</p>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <SmallStat label="Available" value={formatNumber(data.inventory.available)} />
                      <SmallStat label="Reserved" value={formatNumber(data.inventory.reserved)} />
                      <SmallStat label="Inbound" value={formatNumber(data.inventory.inbound)} />
                      <SmallStat label="AWD" value={formatNumber(data.inventory.awd)} />
                    </div>
                    <div className="border-t border-border pt-3 grid grid-cols-2 gap-2">
                      <SmallStat
                        label="Days Left"
                        value={data.inventory.daysLeft != null ? `${data.inventory.daysLeft}d` : "—"}
                        alert={data.inventory.isStockoutRisk}
                      />
                      <SmallStat
                        label="Reorder Point"
                        value={data.inventory.reorderPoint != null ? formatNumber(data.inventory.reorderPoint) : "—"}
                      />
                      <SmallStat
                        label="Suggested Qty"
                        value={data.inventory.suggestedQty != null ? formatNumber(data.inventory.suggestedQty) : "—"}
                      />
                      <SmallStat
                        label="Reorder Cash"
                        value={data.inventory.reorderCashNeeded != null ? formatCurrency(data.inventory.reorderCashNeeded) : "—"}
                      />
                    </div>
                    {data.inventory.isUnderReorderPoint && (
                      <div className="rounded bg-yellow-50 border border-yellow-200 px-3 py-2">
                        <p className="text-xs font-medium text-yellow-800">Below reorder point — consider placing PO</p>
                      </div>
                    )}
                    {data.inventory.isStockoutRisk && (
                      <div className="rounded bg-red-50 border border-red-200 px-3 py-2">
                        <p className="text-xs font-medium text-red-700">Stockout risk — urgent action needed</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Profit block */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Profit Settings</p>
                <div className="grid grid-cols-2 gap-3">
                  <Tile label="Landed COGS" value={data.profitBlock.landedCogs != null ? formatCurrency(data.profitBlock.landedCogs) : "Not set"} />
                  <Tile label="Avg Referral Fee" value={data.profitBlock.avgReferralFee != null ? formatCurrency(data.profitBlock.avgReferralFee) : "—"} />
                  <Tile label="Avg FBA Fee" value={data.profitBlock.avgFbaFee != null ? formatCurrency(data.profitBlock.avgFbaFee) : "—"} />
                  <Tile
                    label="Est. Net Margin"
                    value={data.profitBlock.estimatedNetMarginPct != null ? formatPercent(data.profitBlock.estimatedNetMarginPct) : "—"}
                    highlight={
                      data.profitBlock.estimatedNetMarginPct != null
                        ? data.profitBlock.estimatedNetMarginPct >= 0.2
                          ? "positive"
                          : "negative"
                        : undefined
                    }
                  />
                </div>
              </div>

              {/* Alerts */}
              {data.alerts.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Open Alerts ({data.aiBlock.openCount})
                  </p>
                  <div className="space-y-2">
                    {data.alerts.map((alert) => (
                      <div key={alert.id} className="flex items-start justify-between gap-2 rounded border border-border px-3 py-2">
                        <p className="text-sm leading-snug">{alert.title}</p>
                        <StatusBadge
                          label={alert.severity}
                          variant={
                            alert.severity === "CRITICAL" ? "danger" : alert.severity === "WARNING" ? "warning" : "info"
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, highlight }: { label: string; value: string; highlight?: "positive" | "negative" }) {
  return (
    <div className="rounded border border-border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium mt-0.5 ${highlight === "positive" ? "text-green-600" : highlight === "negative" ? "text-red-500" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function SmallStat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium tabular-nums ${alert ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}
