"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import type {
  SupplierOrderData,
  SupplierOrderItem,
  SupplierOrderPayment,
  SupplierOrderShipment,
  SupplierOrderShipmentItem,
} from "@/lib/types/supplier-order";
import {
  ORDER_STATUSES,
  SHIPMENT_STATUSES,
  CURRENCIES,
  SHIP_METHODS,
  DEFAULT_EXCHANGE_RATES,
  calculateOrderTotals,
  formatOrderCurrency,
  toUSD,
  getWarehouseStats,
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
  "T/T in advance",
];

const fmtUSD = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OrderDetailPanel({ order, onClose, onSave, onDelete }: OrderDetailPanelProps) {
  if (!order) return null;
  return <OrderDetailPanelInner key={order.id} order={order} onClose={onClose} onSave={onSave} onDelete={onDelete} />;
}

function OrderDetailPanelInner({
  order, onClose, onSave, onDelete,
}: OrderDetailPanelProps & { order: SupplierOrderData }) {
  const [form, setForm] = useState({ ...order });
  const [items, setItems] = useState<SupplierOrderItem[]>(order.lineItems.map((i) => ({ ...i })));
  const [payments, setPayments] = useState<SupplierOrderPayment[]>(order.payments.map((p) => ({ ...p })));
  const [shipments, setShipments] = useState<SupplierOrderShipment[]>(
    (order.shipments ?? []).map((s) => ({
      ...s,
      placementFee: s.placementFee ?? 0,
      shippingCost: s.shippingCost ?? 0,
      items: (s.items ?? []).map((it) => ({ ...it })),
    }))
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxUpdated, setFxUpdated] = useState<string | null>(null);

  const feePct = form.transactionFeePct ?? 2.9901;
  const totals = useMemo(() => calculateOrderTotals(items, feePct), [items, feePct]);
  const cur = form.currency ?? "USD";
  const rate = form.exchangeRate;
  const isNonUSD = cur !== "USD";
  const fmt = useCallback((n: number) => formatOrderCurrency(n, cur), [cur]);

  const whStats = useMemo(() => getWarehouseStats({ ...form, lineItems: items, shipments, payments }), [form, items, shipments, payments]);

  // ASIN → description & unit price lookups, built from current line items (excluding one-time fees)
  const asinToDescription = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of items) {
      if (item.isOneTimeFee) continue;
      if (item.asin && item.description) m.set(item.asin, item.description);
    }
    return m;
  }, [items]);
  const asinToUnitPrice = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of items) {
      if (item.isOneTimeFee) continue;
      if (item.asin) m.set(item.asin, item.unitPrice);
    }
    return m;
  }, [items]);

  const productionComplete = Boolean(form.actProductionEnd && form.actProductionEnd !== "");

  const estProdDays = form.estProductionDays ?? 36;
  const estDelDays = form.estDeliveryDays ?? 71;
  const estProdDate = form.orderDate ? addDays(form.orderDate, estProdDays) : null;
  const estDelDate = form.orderDate ? addDays(form.orderDate, estDelDays) : null;
  const prodDiff = form.actProductionEnd && estProdDate ? daysBetween(estProdDate, form.actProductionEnd) : null;
  const delDiff = form.actDeliveryDate && estDelDate ? daysBetween(estDelDate, form.actDeliveryDate) : null;

  const balance = useMemo(() => {
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    return totals.orderTotal - paid;
  }, [totals.orderTotal, payments]);

  const updateField = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateItem = useCallback((idx: number, key: keyof SupplierOrderItem, value: number | string | boolean) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item)));
  }, []);
  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { asin: "", description: "", quantity: 0, unit: "pc.", unitPrice: 0, isOneTimeFee: false, sortOrder: prev.length }]);
  }, []);
  const removeItem = useCallback((idx: number) => { setItems((prev) => prev.filter((_, i) => i !== idx)); }, []);

  const updatePayment = useCallback((idx: number, key: keyof SupplierOrderPayment, value: string | number | null) => {
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  }, []);
  const addPayment = useCallback(() => {
    setPayments((prev) => [...prev, { label: "Payment", amount: 0, paidDate: null, sortOrder: prev.length }]);
  }, []);

  const updateShipment = useCallback((idx: number, key: keyof SupplierOrderShipment, value: string | number | null) => {
    setShipments((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s)));
  }, []);
  const addShipment = useCallback(() => {
    // Pre-populate item rows for each product ASIN (excluding one-time fees)
    const productAsins: string[] = [];
    const seen = new Set<string>();
    for (const li of items) {
      if (li.isOneTimeFee || !li.asin) continue;
      if (seen.has(li.asin)) continue;
      seen.add(li.asin);
      productAsins.push(li.asin);
    }
    const newItems: SupplierOrderShipmentItem[] = productAsins.map((asin) => ({ asin, units: 0 }));
    setShipments((prev) => [
      ...prev,
      {
        units: 0,
        destination: "FBA",
        amazonShipId: null,
        shipDate: null,
        receivedDate: null,
        status: "Pending",
        notes: null,
        sortOrder: prev.length,
        placementFee: 0,
        shippingCost: 0,
        items: newItems,
      },
    ]);
  }, [items]);
  const removeShipment = useCallback((idx: number) => { setShipments((prev) => prev.filter((_, i) => i !== idx)); }, []);

  const updateShipmentItem = useCallback((shipIdx: number, itemIdx: number, units: number) => {
    setShipments((prev) =>
      prev.map((s, i) =>
        i === shipIdx
          ? {
              ...s,
              items: s.items.map((it, j) => (j === itemIdx ? { ...it, units } : it)),
            }
          : s
      )
    );
  }, []);

  const refreshExchangeRate = useCallback(async () => {
    setFxLoading(true);
    setFxUpdated(null);
    try {
      const res = await fetch(`/api/pm/orders/exchange-rate?currency=${cur}`);
      const json = await res.json();
      if (json.rate) {
        updateField("exchangeRate", json.rate);
        setFxUpdated(new Date().toLocaleTimeString());
      }
    } catch { /* ignore */ } finally { setFxLoading(false); }
  }, [cur, updateField]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Recompute each shipment's total units from its items before save
      const normalizedShipments = shipments.map((s) => ({
        ...s,
        units: s.items.reduce((sum, it) => sum + (it.units || 0), 0),
      }));
      onSave({ ...form, transactionFeePct: feePct, lineItems: items, payments, shipments: normalizedShipments });
    } finally { setSaving(false); }
  }, [form, feePct, items, payments, shipments, onSave]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[600px] bg-card border-l border-border overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <h2 className="text-sm font-semibold text-foreground truncate">
            Order {form.orderNumber}
            {isNonUSD && <span className="ml-2 text-2xs font-normal text-muted-foreground">({cur})</span>}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-elevated text-muted-foreground hover:text-foreground transition">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* ── Order Details ─────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Supplier"><input value={form.supplier} onChange={(e) => updateField("supplier", e.target.value)} className="input-field" /></Field>
              <Field label="Order #"><input value={form.orderNumber} onChange={(e) => updateField("orderNumber", e.target.value)} className="input-field" /></Field>
              <Field label="Order Date"><input type="date" value={form.orderDate} onChange={(e) => updateField("orderDate", e.target.value)} className="input-field" /></Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => updateField("status", e.target.value)} className="input-field">
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Terms">
                <select value={form.terms} onChange={(e) => updateField("terms", e.target.value)} className="input-field">
                  {TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Currency">
                <select value={cur} onChange={(e) => { const c = e.target.value; updateField("currency", c); if (c !== "USD") updateField("exchangeRate", DEFAULT_EXCHANGE_RATES[c] ?? 1); else updateField("exchangeRate", null); }} className="input-field">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              {isNonUSD && (
                <Field label={`Exchange Rate (${cur} → USD)`}>
                  <div className="flex gap-1">
                    <input type="number" step="0.000001" value={rate ?? ""} onChange={(e) => updateField("exchangeRate", parseFloat(e.target.value) || null)} className="input-field flex-1" />
                    <button type="button" onClick={refreshExchangeRate} disabled={fxLoading} className="shrink-0 rounded-md border border-border px-2 hover:bg-elevated transition disabled:opacity-50" title="Fetch live rate">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("h-3.5 w-3.5", fxLoading && "animate-spin")}><path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4" /><path d="M12.5 1v3h-3M3.5 15v-3h3" /></svg>
                    </button>
                  </div>
                  {fxUpdated && <span className="text-2xs text-green-400 mt-0.5 block">Updated {fxUpdated}</span>}
                </Field>
              )}
              <Field label="Amazon Order ID"><input value={form.amazonOrderId ?? ""} onChange={(e) => updateField("amazonOrderId", e.target.value || null)} className="input-field" /></Field>
              <Field label="Amazon Ref ID"><input value={form.amazonRefId ?? ""} onChange={(e) => updateField("amazonRefId", e.target.value || null)} className="input-field" /></Field>
            </div>
            <Field label="Delivery Address"><textarea value={form.deliveryAddress ?? ""} onChange={(e) => updateField("deliveryAddress", e.target.value || null)} rows={2} className="input-field resize-none" /></Field>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Ship Method"><select value={form.shipMethod ?? ""} onChange={(e) => updateField("shipMethod", e.target.value || null)} className="input-field"><option value="">—</option>{SHIP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
              <Field label="Shipping Cost"><input type="number" step="0.01" value={form.shippingCost ?? 0} onChange={(e) => updateField("shippingCost", parseFloat(e.target.value) || 0)} className="input-field" /></Field>
              <Field label="Ship Currency"><select value={form.shippingCurrency ?? "USD"} onChange={(e) => updateField("shippingCurrency", e.target.value)} className="input-field">{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            </div>
            <Field label="Ship-To Address (Freight Forwarder)"><textarea value={form.shipToAddress ?? ""} onChange={(e) => updateField("shipToAddress", e.target.value || null)} rows={2} className="input-field resize-none" /></Field>
          </section>

          {/* ── Timeline ──────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeline</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Est. Production End"><div className="text-xs text-foreground py-1.5">{estProdDate ?? "—"}</div></Field>
              <Field label="Actual Production End"><input type="date" value={form.actProductionEnd ?? ""} onChange={(e) => updateField("actProductionEnd", e.target.value || null)} className="input-field" /></Field>
              <Field label="Difference"><div className={cn("text-xs py-1.5 font-medium", prodDiff !== null && prodDiff > 0 ? "text-red-400" : prodDiff !== null && prodDiff < 0 ? "text-green-400" : "text-muted-foreground")}>{prodDiff !== null ? `${prodDiff > 0 ? "+" : ""}${prodDiff} days` : "—"}</div></Field>
              <Field label="Est. Delivery Date"><div className="text-xs text-foreground py-1.5">{estDelDate ?? "—"}</div></Field>
              <Field label="Actual Delivery Date"><input type="date" value={form.actDeliveryDate ?? ""} onChange={(e) => updateField("actDeliveryDate", e.target.value || null)} className="input-field" /></Field>
              <Field label="Difference"><div className={cn("text-xs py-1.5 font-medium", delDiff !== null && delDiff > 0 ? "text-red-400" : delDiff !== null && delDiff < 0 ? "text-green-400" : "text-muted-foreground")}>{delDiff !== null ? `${delDiff > 0 ? "+" : ""}${delDiff} days` : "—"}</div></Field>
            </div>
          </section>

          {/* ── Line Items ────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Line Items</h3>
              <button type="button" onClick={addItem} className="flex items-center gap-1 text-2xs text-primary hover:text-primary/80 transition">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3"><path d="M8 3v10M3 8h10" /></svg>Add Item
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead><tr className="bg-elevated/50 text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">ASIN</th><th className="px-2 py-1.5 text-left font-medium">Description</th><th className="px-2 py-1.5 text-right font-medium">Qty</th><th className="px-2 py-1.5 text-left font-medium">Unit</th><th className="px-2 py-1.5 text-right font-medium">Price</th><th className="px-2 py-1.5 text-right font-medium">Total</th>
                  {isNonUSD && <th className="px-2 py-1.5 text-right font-medium">USD</th>}
                  <th className="px-2 py-1.5 text-center font-medium w-10">Fee</th><th className="px-1 py-1.5 w-6"></th>
                </tr></thead>
                <tbody>
                  {items.map((item, idx) => {
                    const total = item.quantity * item.unitPrice;
                    return (
                      <tr key={idx} className="border-t border-border hover:bg-elevated/30">
                        <td className="px-2 py-1"><input value={item.asin} onChange={(e) => updateItem(idx, "asin", e.target.value)} className="w-24 bg-transparent text-foreground outline-none" /></td>
                        <td className="px-2 py-1"><input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="w-20 bg-transparent text-foreground outline-none" /></td>
                        <td className="px-2 py-1 text-right"><input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)} className="w-16 bg-transparent text-foreground text-right outline-none" /></td>
                        <td className="px-2 py-1"><input value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="w-10 bg-transparent text-foreground outline-none" /></td>
                        <td className="px-2 py-1 text-right"><input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} className="w-16 bg-transparent text-foreground text-right outline-none" /></td>
                        <td className="px-2 py-1 text-right text-foreground tabular-nums font-medium">{fmt(total)}</td>
                        {isNonUSD && <td className="px-2 py-1 text-right text-muted-foreground tabular-nums">{fmtUSD(toUSD(total, cur, rate))}</td>}
                        <td className="px-2 py-1 text-center"><input type="checkbox" checked={item.isOneTimeFee} onChange={(e) => updateItem(idx, "isOneTimeFee", e.target.checked)} className="rounded" title="One-time fee" /></td>
                        <td className="px-1 py-1"><button type="button" onClick={() => removeItem(idx)} className="rounded p-0.5 hover:bg-elevated text-muted-foreground hover:text-red-400 transition"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3"><path d="M4 4l8 8M12 4l-8 8" /></svg></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Totals ────────────────────────────────────────── */}
          <section className="space-y-1.5">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total Units</span><span className="text-foreground tabular-nums font-medium">{totals.totalUnits.toLocaleString()}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal</span><span className="text-foreground tabular-nums">{fmt(totals.subtotal)}</span></div>
            {form.shippingCost > 0 && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Shipping</span><span className="text-foreground tabular-nums">{formatOrderCurrency(form.shippingCost, form.shippingCurrency ?? "USD")}</span></div>}
            <div className="flex justify-between text-xs items-center gap-2">
              <span className="text-muted-foreground flex items-center gap-1">
                Transaction Fee (
                <input type="number" step="0.01" value={feePct} onChange={(e) => updateField("transactionFeePct", parseFloat(e.target.value) || 0)} className="w-14 bg-transparent text-foreground text-center outline-none border-b border-border" />
                %)
              </span>
              <span className="text-foreground tabular-nums">{fmt(totals.transactionFee)}</span>
            </div>
            <div className="flex justify-between text-xs border-t border-border pt-1.5"><span className="font-semibold text-foreground">ORDER TOTAL</span><span className="font-semibold text-foreground tabular-nums">{fmt(totals.orderTotal)}</span></div>
            {isNonUSD && rate && <div className="flex justify-between text-xs text-muted-foreground"><span>USD Equivalent (rate: {rate})</span><span className="tabular-nums">{fmtUSD(toUSD(totals.orderTotal, cur, rate))}</span></div>}
            {isNonUSD && rate && totals.totalUnits > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>Per-unit landed cost (USD)</span><span className="tabular-nums">{fmtUSD(toUSD(totals.subtotal - totals.oneTimeFees, cur, rate) / totals.totalUnits)}</span></div>}
          </section>

          {/* ── Payments ──────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payments</h3>
              <button type="button" onClick={addPayment} className="flex items-center gap-1 text-2xs text-primary hover:text-primary/80 transition"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3"><path d="M8 3v10M3 8h10" /></svg>Add Payment</button>
            </div>
            <div className="space-y-2">
              {payments.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <input value={p.label} onChange={(e) => updatePayment(idx, "label", e.target.value)} className="flex-1 text-xs bg-transparent text-foreground outline-none min-w-0" />
                  <input type="number" step="0.01" value={p.amount} onChange={(e) => updatePayment(idx, "amount", parseFloat(e.target.value) || 0)} className="w-28 text-xs text-right bg-transparent text-foreground outline-none tabular-nums" />
                  {isNonUSD && rate && <span className="text-2xs text-muted-foreground tabular-nums w-20 text-right">{fmtUSD(toUSD(p.amount, cur, rate))}</span>}
                  <input type="date" value={p.paidDate ?? ""} onChange={(e) => updatePayment(idx, "paidDate", e.target.value || null)} className="w-32 text-xs bg-transparent text-foreground outline-none" />
                </div>
              ))}
            </div>
            <div className={cn("flex justify-between text-xs font-semibold pt-1", balance > 0.01 ? "text-red-400" : "text-green-400")}><span>Balance</span><span className="tabular-nums">{fmt(balance)}</span></div>
          </section>

          {/* ── Inventory & Shipments ─────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inventory &amp; Shipments</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Warehouse Name"><input value={form.warehouseName ?? ""} onChange={(e) => updateField("warehouseName", e.target.value || null)} className="input-field" placeholder="e.g. Rivera Air Freight Corp" /></Field>
              <Field label="Total Units Received at Warehouse">
                <input type="number" value={form.totalUnitsReceived ?? 0} onChange={(e) => updateField("totalUnitsReceived", parseInt(e.target.value) || 0)} className="input-field" />
                {!productionComplete && (
                  <p className="mt-1 text-2xs text-muted-foreground italic">
                    Set &ldquo;Actual Production End&rdquo; in the timeline to enable warehouse tracking
                  </p>
                )}
              </Field>
            </div>

            {/* Warehouse summary — per-ASIN breakdown + totals */}
            <div className="rounded-md border border-border overflow-hidden">
              {whStats.byAsin.length === 0 ? (
                <div className="p-3 text-2xs text-muted-foreground text-center">No product line items yet</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-elevated/50 text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-medium">ASIN</th>
                      <th className="px-2 py-1.5 text-left font-medium">Description</th>
                      <th className="px-2 py-1.5 text-right font-medium">Ordered</th>
                      <th className="px-2 py-1.5 text-right font-medium">Shipped</th>
                      <th className="px-2 py-1.5 text-right font-medium">At Warehouse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whStats.byAsin.map((b) => {
                      const overShipped = b.shipped > b.ordered;
                      const description = asinToDescription.get(b.asin) ?? "—";
                      return (
                        <tr key={b.asin} className="border-t border-border">
                          <td className="px-2 py-1 font-mono text-foreground">{b.asin}</td>
                          <td className="px-2 py-1 text-foreground max-w-[180px] truncate" title={description}>{description}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{b.ordered.toLocaleString()}</td>
                          <td className={cn("px-2 py-1 text-right tabular-nums", overShipped && "text-red-400 font-medium")}>
                            {b.shipped.toLocaleString()}
                          </td>
                          <td className={cn("px-2 py-1 text-right tabular-nums", productionComplete && b.remaining < 0 && "text-red-400 font-medium", !productionComplete && "text-muted-foreground italic")}>
                            {productionComplete ? b.remaining.toLocaleString() : "Pending"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border bg-elevated/30 font-semibold">
                      <td className="px-2 py-1.5 text-foreground">Total</td>
                      <td className="px-2 py-1.5 text-muted-foreground text-2xs">&nbsp;</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{whStats.totalOrdered.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{whStats.totalShipped.toLocaleString()}</td>
                      <td className={cn("px-2 py-1.5 text-right tabular-nums", productionComplete ? (whStats.totalAtWarehouse < 0 ? "text-red-400" : "text-foreground") : "text-muted-foreground italic font-normal")}>
                        {productionComplete ? whStats.totalAtWarehouse.toLocaleString() : "Pending production complete"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            {productionComplete && whStats.totalOrdered > 0 && (
              <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (whStats.totalShipped / whStats.totalOrdered) * 100)}%` }} />
              </div>
            )}
            {productionComplete && whStats.totalAtWarehouse < 0 && <p className="text-2xs text-red-400">Warning: shipped more units than received at warehouse</p>}
            {whStats.byAsin.some((b) => b.shipped > b.ordered) && <p className="text-2xs text-red-400">Warning: some ASINs shipped more than ordered</p>}

            {/* FBA Shipments — one card per shipment, with per-ASIN item rows */}
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium text-muted-foreground">FBA Shipments</span>
              {(() => {
                const productCount = items.filter((i) => !i.isOneTimeFee && i.asin).length;
                const disabled = productCount === 0;
                return (
                  <button
                    type="button"
                    onClick={addShipment}
                    disabled={disabled}
                    title={disabled ? "Add line items first" : undefined}
                    className={cn(
                      "flex items-center gap-1 text-2xs transition",
                      disabled ? "text-muted-foreground/50 cursor-not-allowed" : "text-primary hover:text-primary/80"
                    )}
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3"><path d="M8 3v10M3 8h10" /></svg>
                    Add Shipment
                  </button>
                );
              })()}
            </div>
            {shipments.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-2xs text-muted-foreground">No shipments yet — add one when you send units to FBA</div>
            ) : (
              <div className="space-y-3">
                {shipments.map((s, idx) => {
                  const shipTotal = s.items.reduce((sum, it) => sum + (it.units || 0), 0);
                  const asinCount = s.items.length;
                  // Shipment item value = sum(units * unitPrice) over items, plus placement + shipping
                  const itemsValue = s.items.reduce(
                    (sum, it) => sum + (it.units || 0) * (asinToUnitPrice.get(it.asin) ?? 0),
                    0
                  );
                  const shipmentTotalCost = itemsValue + (s.placementFee ?? 0) + (s.shippingCost ?? 0);
                  // Per-ASIN validation: warn if item units exceed available at warehouse
                  const availableByAsin = new Map<string, number>();
                  for (const b of whStats.byAsin) {
                    // "Available" for this shipment = received - shipped in OTHER shipments
                    const shippedElsewhere = b.shipped - (s.items.find((it) => it.asin === b.asin)?.units ?? 0);
                    availableByAsin.set(b.asin, b.received - shippedElsewhere);
                  }
                  return (
                    <div key={idx} className="rounded-lg border border-border overflow-hidden">
                      <div className="flex flex-wrap items-center gap-2 bg-elevated/30 px-3 py-2 border-b border-border">
                        <span className="text-2xs font-semibold text-muted-foreground">Shipment {idx + 1}</span>
                        <input
                          value={s.amazonShipId ?? ""}
                          onChange={(e) => updateShipment(idx, "amazonShipId", e.target.value || null)}
                          className="flex-1 min-w-[110px] text-xs bg-transparent text-foreground outline-none border-b border-border focus:border-primary"
                          placeholder="FBA ID…"
                        />
                        <input
                          type="date"
                          value={s.shipDate ?? ""}
                          onChange={(e) => updateShipment(idx, "shipDate", e.target.value || null)}
                          className="text-xs bg-transparent text-foreground outline-none"
                          title="Ship date"
                        />
                        <select
                          value={s.status}
                          onChange={(e) => updateShipment(idx, "status", e.target.value)}
                          className="text-xs bg-transparent text-foreground outline-none"
                        >
                          {SHIPMENT_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeShipment(idx)}
                          className="ml-auto rounded p-0.5 hover:bg-elevated text-muted-foreground hover:text-red-400 transition"
                          title="Delete shipment"
                        >
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                        </button>
                      </div>
                      {s.items.length === 0 ? (
                        <div className="px-3 py-2 text-2xs text-muted-foreground">
                          No ASIN rows. Add line items to the order first, then re-create this shipment.
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground">
                              <th className="px-3 py-1.5 text-left font-medium">ASIN</th>
                              <th className="px-3 py-1.5 text-left font-medium">Description</th>
                              <th className="px-3 py-1.5 text-right font-medium w-24">Units</th>
                              <th className="px-3 py-1.5 text-right font-medium w-20">Avail.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.items.map((it, itemIdx) => {
                              const available = availableByAsin.get(it.asin) ?? 0;
                              const over = it.units > available;
                              const description = asinToDescription.get(it.asin) ?? "—";
                              return (
                                <tr key={itemIdx} className="border-t border-border">
                                  <td className="px-3 py-1 font-mono text-foreground">{it.asin}</td>
                                  <td className="px-3 py-1 text-foreground max-w-[160px] truncate" title={description}>{description}</td>
                                  <td className="px-3 py-1 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      value={it.units}
                                      onChange={(e) => updateShipmentItem(idx, itemIdx, parseInt(e.target.value) || 0)}
                                      className={cn(
                                        "w-20 bg-transparent text-right outline-none tabular-nums border-b border-border focus:border-primary",
                                        over ? "text-red-400" : "text-foreground"
                                      )}
                                    />
                                  </td>
                                  <td className={cn("px-3 py-1 text-right tabular-nums text-muted-foreground", over && "text-red-400")}>
                                    {available.toLocaleString()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}

                      {/* Costs row */}
                      <div className="grid grid-cols-2 gap-3 px-3 py-2 border-t border-border bg-card">
                        <div>
                          <label className="block text-2xs font-medium text-muted-foreground mb-0.5">Placement Fee</label>
                          <input
                            type="number"
                            step="0.01"
                            value={s.placementFee ?? 0}
                            onChange={(e) => updateShipment(idx, "placementFee", parseFloat(e.target.value) || 0)}
                            className="w-full rounded-md border border-border bg-elevated px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-2xs font-medium text-muted-foreground mb-0.5">Shipping Cost</label>
                          <input
                            type="number"
                            step="0.01"
                            value={s.shippingCost ?? 0}
                            onChange={(e) => updateShipment(idx, "shippingCost", parseFloat(e.target.value) || 0)}
                            className="w-full rounded-md border border-border bg-elevated px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-border bg-elevated/20 text-2xs">
                        <span className="text-muted-foreground">
                          Total: <span className="text-foreground font-medium tabular-nums">{shipTotal.toLocaleString()}</span> units across {asinCount} ASIN{asinCount === 1 ? "" : "s"}
                        </span>
                        <span className="text-muted-foreground">
                          Cost: <span className="text-foreground font-medium tabular-nums">{fmt(shipmentTotalCost)}</span>
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <label className="text-muted-foreground">Received:</label>
                          <input
                            type="date"
                            value={s.receivedDate ?? ""}
                            onChange={(e) => updateShipment(idx, "receivedDate", e.target.value || null)}
                            className="text-xs bg-transparent text-foreground outline-none"
                          />
                        </div>
                      </div>
                      {s.notes !== null && s.notes !== "" ? (
                        <div className="px-3 py-2 border-t border-border">
                          <input
                            value={s.notes}
                            onChange={(e) => updateShipment(idx, "notes", e.target.value || null)}
                            className="w-full text-2xs bg-transparent text-foreground outline-none"
                            placeholder="Notes…"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => updateShipment(idx, "notes", "")}
                          className="px-3 py-1 text-2xs text-muted-foreground hover:text-foreground transition border-t border-border w-full text-left"
                        >
                          + Add note
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Notes ─────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h3>
            <textarea value={form.notes ?? ""} onChange={(e) => updateField("notes", e.target.value || null)} rows={3} className="input-field resize-none w-full" placeholder="Internal notes..." />
          </section>

          {/* ── Actions ───────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-2 pb-4 border-t border-border">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Delete this order?</span>
                <button type="button" onClick={() => onDelete(order.id)} className="rounded-md bg-red-500/20 px-2.5 py-1 text-2xs font-medium text-red-400 hover:bg-red-500/30 transition">Yes</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-2.5 py-1 text-2xs text-muted-foreground hover:text-foreground transition">No</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="text-2xs text-red-400 hover:text-red-300 transition">Delete Order</button>
            )}
            <button type="button" onClick={handleSave} disabled={saving} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
          </div>
        </div>
      </div>
      <style jsx>{`
        .input-field { width:100%; border-radius:0.375rem; border:1px solid hsl(var(--border)); background:hsl(var(--elevated)); padding:0.375rem 0.625rem; font-size:0.75rem; color:hsl(var(--foreground)); outline:none; }
        .input-field:focus { box-shadow:0 0 0 1px hsl(var(--primary)); }
      `}</style>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-2xs font-medium text-muted-foreground mb-1">{label}</label>{children}</div>;
}
