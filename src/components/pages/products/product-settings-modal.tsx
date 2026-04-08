"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { ProductManagementRow } from "@/lib/services/products-service";

type Props = {
  open: boolean;
  onClose: () => void;
  product: ProductManagementRow;
};

const TABS = [
  "Manufacturing & Logistics",
  "Forecast",
  "Shipping to FBA",
  "Purchase Order",
] as const;
type Tab = (typeof TABS)[number];

const COUNTRIES = [
  "China",
  "United States",
  "India",
  "Vietnam",
  "Taiwan",
  "South Korea",
  "Japan",
  "Germany",
  "Mexico",
  "Thailand",
];

const SHIPPING_METHODS = ["Sea", "Air", "Express"];

const inputCls =
  "w-full rounded-md border border-border bg-elevated px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/40 transition";
const labelCls = "block text-xs text-muted-foreground mb-1";
const displayCls =
  "w-full rounded-md border border-border bg-elevated/50 px-3 py-2 text-xs text-muted-foreground cursor-default";

// ─── Default settings per product ───────────────────────────────────────────

function getDefaultSettings(product: ProductManagementRow) {
  return {
    // Manufacturing & Logistics
    unitCost: product.cogs,
    supplierName: "",
    leadTimeDays: 0,
    moq: 0,
    countryOfOrigin: "China",

    // Forecast
    dailyVelocity: 0,
    safetyStockDays: 0,
    reorderPoint: 0,
    growthRate: 0,

    // Shipping to FBA
    shippingCostPerUnit: 0,
    cartonL: 0,
    cartonW: 0,
    cartonH: 0,
    unitsPerCarton: 0,
    weightPerCarton: 0,
    prepFeePerUnit: 0,

    // Purchase Order
    lastPoDate: "",
    lastPoQty: 0,
    avgDeliveryDays: 0,
    preferredShipping: "Sea" as string,
    notes: "",
  };
}

export function ProductSettingsModal({ open, onClose, product }: Props) {
  const defaults = getDefaultSettings(product);

  const [tab, setTab] = useState<Tab>("Manufacturing & Logistics");

  // Manufacturing & Logistics
  const [unitCost, setUnitCost] = useState(defaults.unitCost.toFixed(2));
  const [supplierName, setSupplierName] = useState(defaults.supplierName);
  const [leadTimeDays, setLeadTimeDays] = useState(defaults.leadTimeDays);
  const [moq, setMoq] = useState(defaults.moq);
  const [countryOfOrigin, setCountryOfOrigin] = useState(defaults.countryOfOrigin);

  // Forecast
  const [safetyStockDays, setSafetyStockDays] = useState(defaults.safetyStockDays);
  const [growthRate, setGrowthRate] = useState(defaults.growthRate);

  // Shipping to FBA
  const [shippingCostPerUnit, setShippingCostPerUnit] = useState(
    defaults.shippingCostPerUnit.toFixed(2)
  );
  const [cartonL, setCartonL] = useState(defaults.cartonL);
  const [cartonW, setCartonW] = useState(defaults.cartonW);
  const [cartonH, setCartonH] = useState(defaults.cartonH);
  const [unitsPerCarton, setUnitsPerCarton] = useState(defaults.unitsPerCarton);
  const [weightPerCarton, setWeightPerCarton] = useState(defaults.weightPerCarton);
  const [prepFeePerUnit, setPrepFeePerUnit] = useState(
    defaults.prepFeePerUnit.toFixed(2)
  );

  // Purchase Order
  const [preferredShipping, setPreferredShipping] = useState(
    defaults.preferredShipping
  );
  const [notes, setNotes] = useState(defaults.notes);

  // Computed values
  const dailyVelocity = defaults.dailyVelocity;
  const reorderPoint = Math.ceil(dailyVelocity * (leadTimeDays + safetyStockDays));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="relative z-10 bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              Product Settings
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-md">
              {product.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-elevated"
            aria-label="Close"
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

        {/* Tab pills */}
        <div className="flex gap-1 px-6 pt-4 pb-2 flex-wrap border-b border-border">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                tab === t
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-elevated"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {/* Tab 1 -- Manufacturing & Logistics */}
          {tab === "Manufacturing & Logistics" && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Unit cost ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    className={cn(inputCls, "pl-6")}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Supplier name</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Lead time (days)</label>
                  <input
                    type="number"
                    value={leadTimeDays}
                    onChange={(e) => setLeadTimeDays(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>MOQ (Min Order Qty)</label>
                  <input
                    type="number"
                    value={moq}
                    onChange={(e) => setMoq(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Country of origin</label>
                <select
                  value={countryOfOrigin}
                  onChange={(e) => setCountryOfOrigin(e.target.value)}
                  className={inputCls}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Tab 2 -- Forecast */}
          {tab === "Forecast" && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Daily velocity (units/day)</label>
                <div className={displayCls}>
                  {dailyVelocity.toFixed(1)} units/day
                  <span className="ml-2 text-2xs text-tertiary">
                    (calculated from 90-day avg)
                  </span>
                </div>
              </div>

              <div>
                <label className={labelCls}>Safety stock (days)</label>
                <input
                  type="number"
                  value={safetyStockDays}
                  onChange={(e) => setSafetyStockDays(Number(e.target.value))}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Reorder point (units)</label>
                <div className={displayCls}>
                  {reorderPoint} units
                  <span className="ml-2 text-2xs text-tertiary">
                    = velocity x (lead time + safety stock)
                  </span>
                </div>
              </div>

              <div>
                <label className={labelCls}>Growth rate (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={growthRate}
                    onChange={(e) => setGrowthRate(Number(e.target.value))}
                    className={inputCls}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3 -- Shipping to FBA */}
          {tab === "Shipping to FBA" && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Shipping cost per unit ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={shippingCostPerUnit}
                    onChange={(e) => setShippingCostPerUnit(e.target.value)}
                    className={cn(inputCls, "pl-6")}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Carton dimensions (inches)</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-2xs text-tertiary">L</span>
                    <input
                      type="number"
                      value={cartonL}
                      onChange={(e) => setCartonL(Number(e.target.value))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <span className="text-2xs text-tertiary">W</span>
                    <input
                      type="number"
                      value={cartonW}
                      onChange={(e) => setCartonW(Number(e.target.value))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <span className="text-2xs text-tertiary">H</span>
                    <input
                      type="number"
                      value={cartonH}
                      onChange={(e) => setCartonH(Number(e.target.value))}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Units per carton</label>
                  <input
                    type="number"
                    value={unitsPerCarton}
                    onChange={(e) => setUnitsPerCarton(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Weight per carton (lbs)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={weightPerCarton}
                    onChange={(e) => setWeightPerCarton(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Prep fee per unit ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={prepFeePerUnit}
                    onChange={(e) => setPrepFeePerUnit(e.target.value)}
                    className={cn(inputCls, "pl-6")}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 4 -- Purchase Order */}
          {tab === "Purchase Order" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Last PO date</label>
                  <div className={displayCls}>{defaults.lastPoDate || "No PO recorded"}</div>
                </div>
                <div>
                  <label className={labelCls}>Last PO quantity</label>
                  <div className={displayCls}>
                    {defaults.lastPoQty > 0 ? `${defaults.lastPoQty.toLocaleString()} units` : "No data"}
                  </div>
                </div>
              </div>

              <div>
                <label className={labelCls}>Avg delivery time (days)</label>
                <div className={displayCls}>{defaults.avgDeliveryDays > 0 ? `${defaults.avgDeliveryDays} days` : "No data"}</div>
              </div>

              <div>
                <label className={labelCls}>Preferred shipping method</label>
                <select
                  value={preferredShipping}
                  onChange={(e) => setPreferredShipping(e.target.value)}
                  className={inputCls}
                >
                  {SHIPPING_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className={cn(inputCls, "resize-none")}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 transition"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
