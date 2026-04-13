"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import type {
  SupplierOrderData,
  SupplierOrderItem,
  SupplierOrderPayment,
} from "@/lib/types/supplier-order";
import {
  ORDER_STATUSES,
  TRANSACTION_FEE_RATE,
  calculateOrderTotals,
  parseTermsSplit,
  addDays,
  daysBetween,
} from "@/lib/types/supplier-order";

type OrderDetailPanelProps = {
  order: SupplierOrderData | null;
  onClose: () => void;
  onSave: (order: SupplierOrderData) => void;
  onDelete: (orderId: string) => void;
};

const TERMS_OPTIONS = [
  "50/50 Upfront/Before Delivery",
  "30/70 Upfront/Before Delivery",
];

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

export function OrderDetailPanel({
  order,
  onClose,
  onSave,
  onDelete,
}: OrderDetailPanelProps) {
  if (!order) return null;

  return (
    <OrderDetailPanelInner
      key={order.id}
      order={order}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
    />
  );
}

function OrderDetailPanelInner({
  order,
  onClose,
  onSave,
  onDelete,
}: OrderDetailPanelProps & { order: SupplierOrderData }) {
  const [form, setForm] = useState({ ...order });
  const [items, setItems] = useState<SupplierOrderItem[]>(
    order.lineItems.map((i) => ({ ...i }))
  );
  const [payments, setPayments] = useState<SupplierOrderPayment[]>(
    order.payments.map((p) => ({ ...p }))
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => calculateOrderTotals(items), [items]);

  const estProdDays = form.estProductionDays ?? 36;
  const estDelDays = form.estDeliveryDays ?? 71;
  const estProdDate = form.orderDate ? addDays(form.orderDate, estProdDays) : null;
  const estDelDate = form.orderDate ? addDays(form.orderDate, estDelDays) : null;
  const prodDiff =
    form.actProductionEnd && estProdDate
      ? daysBetween(estProdDate, form.actProductionEnd)
      : null;
  const delDiff =
    form.actDeliveryDate && estDelDate
      ? daysBetween(estDelDate, form.actDeliveryDate)
      : null;

  const balance = useMemo(() => {
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    return totals.orderTotal - paid;
  }, [totals.orderTotal, payments]);

  const updateField = useCallback(
    <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const updateItem = useCallback(
    (idx: number, key: keyof SupplierOrderItem, value: number | string) => {
      setItems((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item))
      );
    },
    []
  );

  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      {
        asin: "",
        description: "",
        quantity: 0,
        unit: "pc.",
        unitPrice: 0,
        sortOrder: prev.length,
      },
    ]);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updatePayment = useCallback(
    (
      idx: number,
      key: keyof SupplierOrderPayment,
      value: string | number | null
    ) => {
      setPayments((prev) =>
        prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p))
      );
    },
    []
  );

  const addPayment = useCallback(() => {
    setPayments((prev) => [
      ...prev,
      { label: "Payment", amount: 0, paidDate: null, sortOrder: prev.length },
    ]);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated: SupplierOrderData = {
        ...form,
        lineItems: items,
        payments,
      };
      onSave(updated);
    } finally {
      setSaving(false);
    }
  }, [form, items, payments, onSave]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[600px] bg-card border-l border-border overflow-y-auto shadow-xl">
        {/* Panel header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <h2 className="text-sm font-semibold text-foreground truncate">
            Order {form.orderNumber}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-4 w-4"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* ── Header Section ────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Order Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Supplier">
                <input
                  value={form.supplier}
                  onChange={(e) => updateField("supplier", e.target.value)}
                  className="input-field"
                />
              </Field>
              <Field label="Order #">
                <input
                  value={form.orderNumber}
                  onChange={(e) => updateField("orderNumber", e.target.value)}
                  className="input-field"
                />
              </Field>
              <Field label="Order Date">
                <input
                  type="date"
                  value={form.orderDate}
                  onChange={(e) => updateField("orderDate", e.target.value)}
                  className="input-field"
                />
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value)}
                  className="input-field"
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Terms">
                <select
                  value={form.terms}
                  onChange={(e) => updateField("terms", e.target.value)}
                  className="input-field"
                >
                  {TERMS_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amazon Order ID">
                <input
                  value={form.amazonOrderId ?? ""}
                  onChange={(e) =>
                    updateField("amazonOrderId", e.target.value || null)
                  }
                  className="input-field"
                  placeholder="e.g. FBA18V3PBJ97"
                />
              </Field>
              <Field label="Amazon Ref ID">
                <input
                  value={form.amazonRefId ?? ""}
                  onChange={(e) =>
                    updateField("amazonRefId", e.target.value || null)
                  }
                  className="input-field"
                  placeholder="e.g. 747VT3OV"
                />
              </Field>
            </div>
            <Field label="Delivery Address">
              <textarea
                value={form.deliveryAddress ?? ""}
                onChange={(e) =>
                  updateField("deliveryAddress", e.target.value || null)
                }
                rows={2}
                className="input-field resize-none"
                placeholder="Warehouse address..."
              />
            </Field>
          </section>

          {/* ── Timeline Section ──────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Timeline
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Est. Production End">
                <div className="text-xs text-foreground py-1.5">
                  {estProdDate ?? "—"}
                </div>
              </Field>
              <Field label="Actual Production End">
                <input
                  type="date"
                  value={form.actProductionEnd ?? ""}
                  onChange={(e) =>
                    updateField("actProductionEnd", e.target.value || null)
                  }
                  className="input-field"
                />
              </Field>
              <Field label="Difference">
                <div
                  className={cn(
                    "text-xs py-1.5 font-medium",
                    prodDiff !== null && prodDiff > 0
                      ? "text-red-400"
                      : prodDiff !== null && prodDiff < 0
                        ? "text-green-400"
                        : "text-muted-foreground"
                  )}
                >
                  {prodDiff !== null
                    ? `${prodDiff > 0 ? "+" : ""}${prodDiff} days`
                    : "—"}
                </div>
              </Field>
              <Field label="Est. Delivery Date">
                <div className="text-xs text-foreground py-1.5">
                  {estDelDate ?? "—"}
                </div>
              </Field>
              <Field label="Actual Delivery Date">
                <input
                  type="date"
                  value={form.actDeliveryDate ?? ""}
                  onChange={(e) =>
                    updateField("actDeliveryDate", e.target.value || null)
                  }
                  className="input-field"
                />
              </Field>
              <Field label="Difference">
                <div
                  className={cn(
                    "text-xs py-1.5 font-medium",
                    delDiff !== null && delDiff > 0
                      ? "text-red-400"
                      : delDiff !== null && delDiff < 0
                        ? "text-green-400"
                        : "text-muted-foreground"
                  )}
                >
                  {delDiff !== null
                    ? `${delDiff > 0 ? "+" : ""}${delDiff} days`
                    : "—"}
                </div>
              </Field>
            </div>
          </section>

          {/* ── Line Items Table ──────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Line Items
              </h3>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-2xs text-primary hover:text-primary/80 transition"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-3 w-3"
                >
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Add Item
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-elevated/50 text-muted-foreground">
                    <th className="px-2 py-1.5 text-left font-medium">ASIN</th>
                    <th className="px-2 py-1.5 text-left font-medium">
                      Description
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                    <th className="px-2 py-1.5 text-left font-medium">Unit</th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      Unit Price
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      w/ Fee
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      Total
                    </th>
                    <th className="px-1 py-1.5 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const withFee = item.unitPrice * (1 + TRANSACTION_FEE_RATE);
                    const total = item.quantity * item.unitPrice;
                    return (
                      <tr
                        key={idx}
                        className="border-t border-border hover:bg-elevated/30"
                      >
                        <td className="px-2 py-1">
                          <input
                            value={item.asin}
                            onChange={(e) =>
                              updateItem(idx, "asin", e.target.value)
                            }
                            className="w-24 bg-transparent text-foreground outline-none"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={item.description}
                            onChange={(e) =>
                              updateItem(idx, "description", e.target.value)
                            }
                            className="w-20 bg-transparent text-foreground outline-none"
                          />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "quantity",
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-16 bg-transparent text-foreground text-right outline-none"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={item.unit}
                            onChange={(e) =>
                              updateItem(idx, "unit", e.target.value)
                            }
                            className="w-10 bg-transparent text-foreground outline-none"
                          />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "unitPrice",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-16 bg-transparent text-foreground text-right outline-none"
                          />
                        </td>
                        <td className="px-2 py-1 text-right text-muted-foreground tabular-nums">
                          {fmt(withFee)}
                        </td>
                        <td className="px-2 py-1 text-right text-foreground tabular-nums font-medium">
                          {fmt(total)}
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="rounded p-0.5 hover:bg-elevated text-muted-foreground hover:text-red-400 transition"
                          >
                            <svg
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              className="h-3 w-3"
                            >
                              <path d="M4 4l8 8M12 4l-8 8" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Totals ────────────────────────────────────────────── */}
          <section className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total Units</span>
              <span className="text-foreground tabular-nums font-medium">
                {totals.totalUnits.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground tabular-nums">
                {fmt(totals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                Transaction Fee ({(TRANSACTION_FEE_RATE * 100).toFixed(4)}%)
              </span>
              <span className="text-foreground tabular-nums">
                {fmt(totals.transactionFee)}
              </span>
            </div>
            <div className="flex justify-between text-xs border-t border-border pt-1.5">
              <span className="font-semibold text-foreground">ORDER TOTAL</span>
              <span className="font-semibold text-foreground tabular-nums">
                {fmt(totals.orderTotal)}
              </span>
            </div>
          </section>

          {/* ── Payments ──────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Payments
              </h3>
              <button
                type="button"
                onClick={addPayment}
                className="flex items-center gap-1 text-2xs text-primary hover:text-primary/80 transition"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-3 w-3"
                >
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Add Payment
              </button>
            </div>
            <div className="space-y-2">
              {payments.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
                >
                  <input
                    value={p.label}
                    onChange={(e) =>
                      updatePayment(idx, "label", e.target.value)
                    }
                    className="flex-1 text-xs bg-transparent text-foreground outline-none min-w-0"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={p.amount}
                    onChange={(e) =>
                      updatePayment(
                        idx,
                        "amount",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="w-24 text-xs text-right bg-transparent text-foreground outline-none tabular-nums"
                  />
                  <input
                    type="date"
                    value={p.paidDate ?? ""}
                    onChange={(e) =>
                      updatePayment(
                        idx,
                        "paidDate",
                        e.target.value || null
                      )
                    }
                    className="w-32 text-xs bg-transparent text-foreground outline-none"
                  />
                </div>
              ))}
            </div>
            <div
              className={cn(
                "flex justify-between text-xs font-semibold pt-1",
                balance > 0.01 ? "text-red-400" : "text-green-400"
              )}
            >
              <span>Balance</span>
              <span className="tabular-nums">{fmt(balance)}</span>
            </div>
          </section>

          {/* ── Notes ─────────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Notes
            </h3>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => updateField("notes", e.target.value || null)}
              rows={3}
              className="input-field resize-none w-full"
              placeholder="Internal notes..."
            />
          </section>

          {/* ── Actions ───────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-2 pb-4 border-t border-border">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Delete this order?</span>
                <button
                  type="button"
                  onClick={() => onDelete(order.id)}
                  className="rounded-md bg-red-500/20 px-2.5 py-1 text-2xs font-medium text-red-400 hover:bg-red-500/30 transition"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-2.5 py-1 text-2xs text-muted-foreground hover:text-foreground transition"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-2xs text-red-400 hover:text-red-300 transition"
              >
                Delete Order
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .input-field {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--elevated));
          padding: 0.375rem 0.625rem;
          font-size: 0.75rem;
          color: hsl(var(--foreground));
          outline: none;
        }
        .input-field:focus {
          box-shadow: 0 0 0 1px hsl(var(--primary));
        }
      `}</style>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-2xs font-medium text-muted-foreground mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
