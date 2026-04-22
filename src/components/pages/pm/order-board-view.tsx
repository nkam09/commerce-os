"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import type { SupplierOrderData } from "@/lib/types/supplier-order";
import { calculateOrderTotals, formatOrderCurrency, toUSD, getWarehouseStats } from "@/lib/types/supplier-order";
import type { ExperimentData } from "@/lib/types/experiment";
import { ExperimentStrip } from "./experiment-strip";

type OrderBoardViewProps = {
  orders: SupplierOrderData[];
  experiments?: ExperimentData[];
  onOrderClick: (order: SupplierOrderData) => void;
  onExperimentClick?: (exp: ExperimentData) => void;
};

const COLUMNS = ["Pending", "In Production", "Shipped", "Delivered"] as const;

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-yellow-500/20 text-yellow-500",
  "In Production": "bg-blue-500/20 text-blue-500",
  Shipped: "bg-purple-500/20 text-purple-500",
  Delivered: "bg-green-500/20 text-green-500",
  Cancelled: "bg-red-500/20 text-red-400",
};

const fmtUSD = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OrderBoardView({ orders, experiments, onOrderClick, onExperimentClick }: OrderBoardViewProps) {
  const grouped = useMemo(() => {
    const map: Record<string, SupplierOrderData[]> = {};
    for (const col of COLUMNS) map[col] = [];
    for (const o of orders) {
      const bucket = COLUMNS.includes(o.status as (typeof COLUMNS)[number])
        ? o.status
        : "Pending";
      (map[bucket] ??= []).push(o);
    }
    return map;
  }, [orders]);

  return (
    <div>
      {experiments && experiments.length > 0 && (
        <ExperimentStrip experiments={experiments} onExperimentClick={onExperimentClick} />
      )}
    <div className="flex gap-4 overflow-x-auto pb-4 pr-4 snap-x snap-mandatory md:snap-none">
      {COLUMNS.map((col) => (
        <div
          key={col}
          className="w-[85vw] max-w-[300px] sm:w-[300px] flex-shrink-0 space-y-2 snap-start"
        >
          {/* Column header */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium",
                STATUS_COLORS[col] ?? "bg-muted text-muted-foreground"
              )}
            >
              {col}
            </span>
            <span className="text-2xs text-muted-foreground tabular-nums">
              {grouped[col]?.length ?? 0}
            </span>
          </div>

          {/* Cards */}
          <div className="space-y-2">
            {(grouped[col] ?? []).map((order) => {
              const totals = calculateOrderTotals(order.lineItems, order.transactionFeePct);
              const totalUnits = order.lineItems
                .filter((i) => !i.isOneTimeFee)
                .reduce((s, i) => s + i.quantity, 0);
              const cur = order.currency ?? "USD";
              const isNonUSD = cur !== "USD";
              const wh = getWarehouseStats(order);
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onOrderClick(order)}
                  className="w-full text-left rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {order.orderNumber}
                    </span>
                    <span className="text-2xs text-muted-foreground flex-shrink-0">
                      {order.orderDate}
                    </span>
                  </div>
                  <div className="text-2xs text-muted-foreground truncate">
                    {order.supplier}
                  </div>
                  <div className="flex items-center gap-3 text-2xs">
                    <span className="text-foreground tabular-nums font-medium">
                      {formatOrderCurrency(totals.orderTotal, cur)}
                    </span>
                    {isNonUSD && order.exchangeRate && (
                      <span className="text-muted-foreground tabular-nums">
                        ({fmtUSD(toUSD(totals.orderTotal, cur, order.exchangeRate))})
                      </span>
                    )}
                    <span className="text-muted-foreground tabular-nums">
                      {totalUnits.toLocaleString()} units
                    </span>
                  </div>
                  {order.totalUnitsReceived > 0 && (
                    <div className="text-2xs text-muted-foreground">
                      {wh.atWarehouse > 0 ? `${wh.atWarehouse.toLocaleString()} at warehouse` : ""}
                      {wh.shippedToFBA > 0 ? `${wh.atWarehouse > 0 ? " · " : ""}${wh.shippedToFBA.toLocaleString()} shipped to FBA` : ""}
                    </div>
                  )}
                  {order.actDeliveryDate && (
                    <div className="text-2xs text-green-400">
                      Delivered {order.actDeliveryDate}
                    </div>
                  )}
                  {!order.actDeliveryDate && order.estDeliveryDays && order.orderDate && (
                    <div className="text-2xs text-muted-foreground">
                      Est. delivery:{" "}
                      {addDaysSimple(order.orderDate, order.estDeliveryDays)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}

function addDaysSimple(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
