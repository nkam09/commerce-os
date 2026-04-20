/**
 * Shared types for supplier orders used by API routes and UI components.
 */

export type SupplierOrderItem = {
  id?: string;
  asin: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  isOneTimeFee: boolean;
  sortOrder: number;
};

export type SupplierOrderPayment = {
  id?: string;
  label: string;
  amount: number;
  paidDate: string | null;
  sortOrder: number;
};

export type SupplierOrderShipmentItem = {
  id?: string;
  asin: string;
  units: number;
};

export type SupplierOrderShipment = {
  id?: string;
  /** Total units across all items — derived (sum of items.units), but stored for backwards compat. */
  units: number;
  destination: string;
  amazonShipId: string | null;
  shipDate: string | null;
  receivedDate: string | null;
  status: string;
  notes: string | null;
  sortOrder: number;
  items: SupplierOrderShipmentItem[];
};

export type SupplierOrderData = {
  id: string;
  spaceId: string;
  orderNumber: string;
  supplier: string;
  orderDate: string;
  deliveryAddress: string | null;
  amazonOrderId: string | null;
  amazonRefId: string | null;
  terms: string;
  currency: string;
  exchangeRate: number | null;
  shippingCost: number;
  shippingCurrency: string;
  shipToAddress: string | null;
  shipMethod: string | null;
  transactionFeePct: number;
  warehouseName: string | null;
  totalUnitsReceived: number;
  estProductionDays: number | null;
  estDeliveryDays: number | null;
  actProductionEnd: string | null;
  actDeliveryDate: string | null;
  status: string;
  notes: string | null;
  lineItems: SupplierOrderItem[];
  payments: SupplierOrderPayment[];
  shipments: SupplierOrderShipment[];
  createdAt: string;
  updatedAt: string;
};

export type SupplierTemplate = {
  name: string;
  currency: string;
  terms: string[];
  products: {
    asin: string;
    description: string;
    unitPrice: number;
    unit: string;
  }[];
};

export type PrefillData = {
  suppliers: SupplierTemplate[];
  estimates: {
    avgProductionDays: number;
    avgDeliveryDays: number;
  };
};

export const ORDER_STATUSES = [
  "Pending",
  "In Production",
  "Shipped",
  "Delivered",
  "Cancelled",
] as const;

export const SHIPMENT_STATUSES = ["Pending", "Shipped", "Received", "Cancelled"] as const;

export const CURRENCIES = ["USD", "JPY", "EUR", "CNY"] as const;

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  JPY: "¥",
  EUR: "€",
  CNY: "¥",
};

export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  JPY: 0.006667,
  CNY: 0.1389,
  EUR: 1.08,
};

export const SHIP_METHODS = ["SEA", "AIR", "EXPRESS"] as const;

export const TRANSACTION_FEE_RATE = 0.029901;

export function calculateOrderTotals(items: SupplierOrderItem[], feePct: number = TRANSACTION_FEE_RATE * 100) {
  const feeRate = feePct / 100;
  const productItems = items.filter((i) => !i.isOneTimeFee);
  const feeItems = items.filter((i) => i.isOneTimeFee);
  const totalUnits = productItems.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const transactionFee = subtotal * feeRate;
  const orderTotal = subtotal + transactionFee;
  const oneTimeFees = feeItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return { totalUnits, subtotal, transactionFee, orderTotal, oneTimeFees };
}

export function formatOrderCurrency(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? "$";
  if (currency === "JPY") {
    return `${sym}${Math.round(amount).toLocaleString("en-US")}`;
  }
  return `${sym}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function toUSD(amount: number, currency: string, exchangeRate: number | null): number {
  if (currency === "USD") return amount;
  return amount * (exchangeRate ?? DEFAULT_EXCHANGE_RATES[currency] ?? 1);
}

export function parseTermsSplit(terms: string): number {
  if (terms.toLowerCase().includes("t/t in advance")) return 1.0;
  const match = terms.match(/^(\d+)\//);
  return match ? parseInt(match[1], 10) / 100 : 0.5;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

export type WarehouseAsinStats = {
  asin: string;
  ordered: number;
  shipped: number;
  received: number;
  remaining: number;
};

/**
 * Compute warehouse inventory summary from order data.
 *
 * Returns both per-ASIN breakdown and aggregated totals. `received` per ASIN is
 * pro-rated across ASINs based on ordered ratio (we don't track per-ASIN receipt
 * separately). `remaining` = received - shipped.
 *
 * Aliases `shippedToFBA` / `atWarehouse` are preserved for backwards compatibility
 * with existing list/board view callers.
 */
export function getWarehouseStats(order: SupplierOrderData) {
  const byAsin = new Map<string, { ordered: number; shipped: number; received: number; remaining: number }>();

  // Ordered: from line items (excluding one-time fees)
  for (const item of order.lineItems) {
    if (item.isOneTimeFee) continue;
    if (!item.asin) continue;
    const existing = byAsin.get(item.asin) ?? { ordered: 0, shipped: 0, received: 0, remaining: 0 };
    existing.ordered += item.quantity;
    byAsin.set(item.asin, existing);
  }

  // Shipped: sum across all non-cancelled shipments' items
  for (const shipment of order.shipments ?? []) {
    if (shipment.status === "Cancelled") continue;
    for (const item of shipment.items ?? []) {
      if (!item.asin) continue;
      const existing = byAsin.get(item.asin) ?? { ordered: 0, shipped: 0, received: 0, remaining: 0 };
      existing.shipped += item.units;
      byAsin.set(item.asin, existing);
    }
  }

  const totalOrdered = Array.from(byAsin.values()).reduce((s, b) => s + b.ordered, 0);
  const totalReceived = order.totalUnitsReceived ?? 0;

  // Pro-rate received across ASINs based on ordered ratio; compute remaining.
  for (const stats of byAsin.values()) {
    stats.received = totalOrdered > 0
      ? Math.round((stats.ordered / totalOrdered) * totalReceived)
      : 0;
    stats.remaining = stats.received - stats.shipped;
  }

  const totalShipped = Array.from(byAsin.values()).reduce((s, b) => s + b.shipped, 0);
  const totalAtWarehouse = totalReceived - totalShipped;

  const byAsinArr: WarehouseAsinStats[] = Array.from(byAsin.entries()).map(([asin, stats]) => ({
    asin,
    ...stats,
  }));

  return {
    byAsin: byAsinArr,
    totalOrdered,
    totalShipped,
    totalReceived,
    totalAtWarehouse,
    // Backwards-compat aliases
    shippedToFBA: totalShipped,
    atWarehouse: totalAtWarehouse,
  };
}
