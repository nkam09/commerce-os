"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import type {
  SupplierOrderItem,
  SupplierOrderPayment,
  PrefillData,
} from "@/lib/types/supplier-order";
import {
  ORDER_STATUSES,
  TRANSACTION_FEE_RATE,
  calculateOrderTotals,
  parseTermsSplit,
  addDays,
} from "@/lib/types/supplier-order";

type OrderFormProps = {
  spaceId: string;
  onClose: () => void;
  onCreated: () => void;
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

export function OrderForm({ spaceId, onClose, onCreated }: OrderFormProps) {
  const today = new Date().toISOString().split("T")[0];

  const [prefill, setPrefill] = useState<PrefillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [supplier, setSupplier] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [terms, setTerms] = useState("50/50 Upfront/Before Delivery");
  const [status, setStatus] = useState("Pending");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [amazonOrderId, setAmazonOrderId] = useState("");
  const [amazonRefId, setAmazonRefId] = useState("");
  const [items, setItems] = useState<SupplierOrderItem[]>([]);
  const [estProdDays, setEstProdDays] = useState(36);
  const [estDelDays, setEstDelDays] = useState(71);

  // Fetch prefill data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pm/orders/prefill");
        const json = await res.json();
        if (json.ok) {
          const data: PrefillData = json.data;
          setPrefill(data);
          setSupplier(data.supplier);
          setEstProdDays(data.estimates.avgProductionDays);
          setEstDelDays(data.estimates.avgDeliveryDays);
          setItems(
            data.products.map((p, i) => ({
              asin: p.asin,
              description: p.description,
              quantity: 0,
              unit: p.unit,
              unitPrice: p.unitPrice,
              sortOrder: i,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load prefill:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totals = useMemo(() => calculateOrderTotals(items), [items]);

  const upfrontPct = parseTermsSplit(terms);
  const upfrontAmount = totals.orderTotal * upfrontPct;

  const estProdDate = orderDate ? addDays(orderDate, estProdDays) : null;
  const estDelDate = orderDate ? addDays(orderDate, estDelDays) : null;

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

  const handleSubmit = useCallback(async () => {
    if (!orderNumber.trim()) return;
    setSaving(true);
    try {
      const payments: SupplierOrderPayment[] = [
        {
          label: "Upfront Payment",
          amount: Math.round(upfrontAmount * 100) / 100,
          paidDate: orderDate,
          sortOrder: 0,
        },
      ];

      const res = await fetch("/api/pm/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId,
          orderNumber: orderNumber.trim(),
          supplier,
          orderDate,
          deliveryAddress: deliveryAddress || null,
          amazonOrderId: amazonOrderId || null,
          amazonRefId: amazonRefId || null,
          terms,
          estProductionDays: estProdDays,
          estDeliveryDays: estDelDays,
          status,
          lineItems: items.map((item, i) => ({
            asin: item.asin,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
          })),
          payments,
        }),
      });

      const json = await res.json();
      if (json.ok) {
        onCreated();
        onClose();
      } else {
        console.error("Create order failed:", json.error);
      }
    } catch (err) {
      console.error("Create order error:", err);
    } finally {
      setSaving(false);
    }
  }, [
    spaceId,
    orderNumber,
    supplier,
    orderDate,
    terms,
    status,
    deliveryAddress,
    amazonOrderId,
    amazonRefId,
    items,
    estProdDays,
    estDelDays,
    upfrontAmount,
    onCreated,
    onClose,
  ]);

  if (loading) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
        <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[600px] bg-card border-l border-border flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[600px] bg-card border-l border-border overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <h2 className="text-sm font-semibold text-foreground">
            New Supplier Order
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
          {/* Order details */}
          <section className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Order #">
                <input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="e.g. #12345"
                  className="input-field"
                  autoFocus
                />
              </Field>
              <Field label="Order Date">
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="input-field"
                />
              </Field>
              <Field label="Supplier">
                <input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="input-field"
                />
              </Field>
              <Field label="Terms">
                <select
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="input-field"
                >
                  {(prefill?.terms ?? [terms]).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Delivery Address">
                <input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="input-field"
                  placeholder="Warehouse address..."
                />
              </Field>
              <Field label="Status">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="input-field"
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* Timeline estimates */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Estimated Timeline
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Production End:</span>{" "}
                <span className="text-foreground font-medium">
                  {estProdDate ?? "—"}
                </span>
                <span className="text-muted-foreground ml-1">
                  ({estProdDays} days)
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Delivery:</span>{" "}
                <span className="text-foreground font-medium">
                  {estDelDate ?? "—"}
                </span>
                <span className="text-muted-foreground ml-1">
                  ({estDelDays} days)
                </span>
              </div>
            </div>
          </section>

          {/* Line items */}
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
                    <th className="px-2 py-1.5 text-right font-medium">
                      Unit Price
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-border hover:bg-elevated/30"
                    >
                      <td className="px-2 py-1 text-foreground">{item.asin}</td>
                      <td className="px-2 py-1 text-foreground">
                        {item.description}
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
                      <td className="px-2 py-1 text-right text-foreground tabular-nums">
                        ${item.unitPrice.toFixed(4)}
                      </td>
                      <td className="px-2 py-1 text-right text-foreground tabular-nums font-medium">
                        {fmt(item.quantity * item.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Totals */}
          <section className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground tabular-nums">
                {fmt(totals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction Fee</span>
              <span className="text-foreground tabular-nums">
                {fmt(totals.transactionFee)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span className="text-foreground">ORDER TOTAL</span>
              <span className="text-foreground tabular-nums">
                {fmt(totals.orderTotal)}
              </span>
            </div>
            <div className="flex justify-between text-primary">
              <span>Upfront ({(upfrontPct * 100).toFixed(0)}%)</span>
              <span className="tabular-nums">{fmt(upfrontAmount)}</span>
            </div>
          </section>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2 pb-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !orderNumber.trim()}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Order"}
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
