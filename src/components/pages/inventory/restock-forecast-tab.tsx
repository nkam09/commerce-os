"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatNumber, formatDate } from "@/lib/utils/formatters";
import type { ForecastProduct } from "@/lib/services/restock-service";
import { ProductSettingsModal } from "./product-settings-modal";

type Props = {
  data: ForecastProduct[];
};

function urgencyColor(days: number): string {
  if (days < 21) return "text-red-400";
  if (days < 45) return "text-warning";
  return "text-green-400";
}

function runwayBarWidth(days: number): number {
  return Math.min(100, Math.max(4, (days / 180) * 100));
}

function runwayBarColor(days: number): string {
  if (days < 21) return "bg-red-500";
  if (days < 45) return "bg-amber-500";
  return "bg-green-500";
}

export function RestockForecastTab({ data }: Props) {
  const [settingsModal, setSettingsModal] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const sorted = [...data].sort((a, b) => a.stockRunwayDays - b.stockRunwayDays);

  return (
    <>
      <div className="space-y-3">
        {sorted.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-border bg-card p-4 hover:bg-elevated/20 transition"
          >
            {/* Top row: product info + CTA */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded-md object-cover shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center text-2xs text-muted-foreground shrink-0">
                    IMG
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {p.title}
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {p.asin} &middot; {p.sku}
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  setSettingsModal({ id: p.asin, title: p.title })
                }
                className="shrink-0 rounded-md px-2.5 py-1 text-2xs font-medium text-muted-foreground border border-border hover:text-foreground hover:bg-elevated transition"
              >
                Settings
              </button>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
              <div>
                <span className="text-2xs text-muted-foreground">FBA Stock</span>
                <p className="text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(p.fbaStock)}
                </p>
              </div>
              <div>
                <span className="text-2xs text-muted-foreground">
                  Velocity
                </span>
                <p className="text-xs font-semibold tabular-nums text-foreground">
                  {p.salesVelocity.toFixed(1)} /day
                </p>
              </div>
              <div>
                <span className="text-2xs text-muted-foreground">
                  Order Qty
                </span>
                <p className="text-xs font-bold tabular-nums text-primary">
                  {p.recommendedOrderQty > 0
                    ? formatNumber(p.recommendedOrderQty)
                    : "None needed"}
                </p>
              </div>
              <div>
                <span className="text-2xs text-muted-foreground">
                  Order By
                </span>
                <p className="text-xs font-semibold tabular-nums text-foreground">
                  {formatDate(p.recommendedOrderDate, "short")}
                </p>
              </div>
              <div>
                <span className="text-2xs text-muted-foreground">
                  Stockout
                </span>
                <p
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    urgencyColor(p.stockRunwayDays)
                  )}
                >
                  {formatDate(p.projectedStockoutDate, "short")} ({p.stockRunwayDays}d)
                </p>
              </div>
            </div>

            {/* Lead time breakdown */}
            <div className="flex items-center gap-1 text-2xs text-muted-foreground mb-2 flex-wrap">
              <span>Lead time:</span>
              <span className="rounded bg-muted px-1.5 py-0.5">
                Mfg {p.leadTime.manufacturingDays}d
              </span>
              <span>+</span>
              <span className="rounded bg-muted px-1.5 py-0.5">
                Ship {p.leadTime.shippingDays}d
              </span>
              <span>+</span>
              <span className="rounded bg-muted px-1.5 py-0.5">
                Buffer {p.leadTime.bufferDays}d
              </span>
              <span>=</span>
              <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 font-semibold">
                {p.leadTime.totalDays}d total
              </span>
            </div>

            {/* Visual timeline bar */}
            <div className="relative h-4 rounded-full bg-muted overflow-hidden">
              {/* Stock runway portion */}
              <div
                className={cn(
                  "absolute left-0 top-0 h-full rounded-full transition-all",
                  runwayBarColor(p.stockRunwayDays)
                )}
                style={{ width: `${runwayBarWidth(p.stockRunwayDays)}%` }}
              />
              {/* Lead time portion (after runway) */}
              <div
                className="absolute top-0 h-full bg-blue-500/40 rounded-r-full"
                style={{
                  left: `${runwayBarWidth(p.stockRunwayDays)}%`,
                  width: `${Math.min(
                    100 - runwayBarWidth(p.stockRunwayDays),
                    runwayBarWidth(p.leadTime.totalDays)
                  )}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-2xs text-muted-foreground mt-1">
              <span>Today</span>
              <span>
                {p.stockRunwayDays}d runway &rarr; {p.leadTime.totalDays}d lead
              </span>
            </div>
          </div>
        ))}
      </div>

      {settingsModal && (
        <ProductSettingsModal
          open
          onClose={() => setSettingsModal(null)}
          productId={settingsModal.id}
          productTitle={settingsModal.title}
        />
      )}
    </>
  );
}
