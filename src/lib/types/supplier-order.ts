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
  sortOrder: number;
};

export type SupplierOrderPayment = {
  id?: string;
  label: string;
  amount: number;
  paidDate: string | null;
  sortOrder: number;
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
  estProductionDays: number | null;
  estDeliveryDays: number | null;
  actProductionEnd: string | null;
  actDeliveryDate: string | null;
  status: string;
  notes: string | null;
  lineItems: SupplierOrderItem[];
  payments: SupplierOrderPayment[];
  createdAt: string;
  updatedAt: string;
};

export type PrefillData = {
  supplier: string;
  terms: string[];
  products: {
    asin: string;
    description: string;
    unitPrice: number;
    unit: string;
  }[];
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

export const TRANSACTION_FEE_RATE = 0.029901;

export function calculateOrderTotals(items: SupplierOrderItem[]) {
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const transactionFee = subtotal * TRANSACTION_FEE_RATE;
  const orderTotal = subtotal + transactionFee;
  return { totalUnits, subtotal, transactionFee, orderTotal };
}

export function parseTermsSplit(terms: string): number {
  // "50/50 Upfront/Before Delivery" → 50, "30/70 Upfront/Before Delivery" → 30
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
