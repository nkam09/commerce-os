"use client";

import { cn } from "@/lib/utils/cn";
import type { SupplierOrderData } from "@/lib/types/supplier-order";
import { calculateOrderTotals, addDays } from "@/lib/types/supplier-order";

type OrderListViewProps = {
  orders: SupplierOrderData[];
  onOrderClick: (order: SupplierOrderData) => void;
};

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-yellow-500/20 text-yellow-500",
  "In Production": "bg-blue-500/20 text-blue-500",
  Shipped: "bg-purple-500/20 text-purple-500",
  Delivered: "bg-green-500/20 text-green-500",
  Cancelled: "bg-red-500/20 text-red-400",
};

const fmt = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function OrderListView({ orders, onOrderClick }: OrderListViewProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
        <p className="text-xs text-muted-foreground">No orders yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-elevated/50 text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Order #</th>
            <th className="px-3 py-2 text-left font-medium">Supplier</th>
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Units</th>
            <th className="px-3 py-2 text-center font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Est. Delivery</th>
            <th className="px-3 py-2 text-left font-medium">Act. Delivery</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const totals = calculateOrderTotals(order.lineItems);
            const totalUnits = order.lineItems.reduce(
              (s, i) => s + i.quantity,
              0
            );
            const estDel =
              order.estDeliveryDays && order.orderDate
                ? addDays(order.orderDate, order.estDeliveryDays)
                : null;

            return (
              <tr
                key={order.id}
                onClick={() => onOrderClick(order)}
                className="border-t border-border hover:bg-elevated/30 cursor-pointer transition"
              >
                <td className="px-3 py-2 text-foreground font-medium">
                  {order.orderNumber}
                </td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                  {order.supplier}
                </td>
                <td className="px-3 py-2 text-foreground tabular-nums">
                  {order.orderDate}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums font-medium">
                  {fmt(totals.orderTotal)}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {totalUnits.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium",
                      STATUS_COLORS[order.status] ??
                        "bg-muted text-muted-foreground"
                    )}
                  >
                    {order.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground tabular-nums">
                  {estDel ?? "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {order.actDeliveryDate ? (
                    <span className="text-green-400">
                      {order.actDeliveryDate}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
