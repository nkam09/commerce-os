"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Dialog } from "@/components/shared/dialog";
import { Button } from "@/components/shared/button";

type Props = {
  open: boolean;
  onClose: () => void;
  productId: string;
  productTitle: string;
};

const TABS = [
  "Manufacturing & Logistics",
  "Forecast",
  "Shipping to FBA",
  "Purchase Order",
] as const;
type Tab = (typeof TABS)[number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "Prepaid"];

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/20";
const labelCls = "block text-xs text-muted-foreground mb-1";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ProductSettingsModal({ open, onClose, productId: _productId, productTitle }: Props) {
  const [tab, setTab] = useState<Tab>("Manufacturing & Logistics");

  // Manufacturing & Logistics
  const [mfgDays, setMfgDays] = useState(30);
  const [usePrepCenter, setUsePrepCenter] = useState(false);
  const [shipToPrepDays, setShipToPrepDays] = useState(0);
  const [shipToFbaDays, setShipToFbaDays] = useState(35);
  const [fbaBuffer, setFbaBuffer] = useState(10);
  const [targetStockRange, setTargetStockRange] = useState(60);
  const [applyToAll, setApplyToAll] = useState(false);

  // Forecast
  const [overrideVelocity, setOverrideVelocity] = useState("");
  const [seasonalMultipliers, setSeasonalMultipliers] = useState<number[]>(
    Array(12).fill(1.0)
  );
  const [minOrderQty, setMinOrderQty] = useState(100);
  const [orderQtyIncrement, setOrderQtyIncrement] = useState(50);

  // Shipping to FBA
  const [shippingMethod, setShippingMethod] = useState("Sea");
  const [carrierName, setCarrierName] = useState("Flexport");
  const [shippingCostPerUnit, setShippingCostPerUnit] = useState(1.25);
  const [customsDutyCost, setCustomsDutyCost] = useState(0.45);

  // Purchase Order
  const [supplierName, setSupplierName] = useState("Guangzhou Kitchen Co.");
  const [supplierEmail, setSupplierEmail] = useState("orders@gzkitchen.com");
  const [supplierLeadTime, setSupplierLeadTime] = useState("");
  const [unitCost, setUnitCost] = useState(3.8);
  const [minOrderValue, setMinOrderValue] = useState(2000);
  const [paymentTerms, setPaymentTerms] = useState("Net 30");

  function handleSeasonalChange(idx: number, val: string) {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    setSeasonalMultipliers((prev) => {
      const next = [...prev];
      next[idx] = num;
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Product Settings"
      description={productTitle}
      className="max-w-2xl"
    >
      {/* Tab pills */}
      <div className="flex gap-1 mb-5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              tab === t
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab 1 — Manufacturing & Logistics */}
      {tab === "Manufacturing & Logistics" && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Manufacturing time (days)</label>
            <input
              type="number"
              value={mfgDays}
              onChange={(e) => setMfgDays(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={usePrepCenter}
              onChange={(e) => setUsePrepCenter(e.target.checked)}
              className="rounded border-border"
            />
            I use a Prep Center
          </label>

          <div>
            <label className={labelCls}>Shipping to Prep Center (days)</label>
            <input
              type="number"
              value={shipToPrepDays}
              onChange={(e) => setShipToPrepDays(Number(e.target.value))}
              disabled={!usePrepCenter}
              className={cn(inputCls, !usePrepCenter && "opacity-40 cursor-not-allowed")}
            />
          </div>

          <div>
            <label className={labelCls}>Shipping to FBA (days)</label>
            <input
              type="number"
              value={shipToFbaDays}
              onChange={(e) => setShipToFbaDays(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>FBA Buffer (days)</label>
            <input
              type="number"
              value={fbaBuffer}
              onChange={(e) => setFbaBuffer(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Target stock range (days)</label>
            <input
              type="number"
              value={targetStockRange}
              onChange={(e) => setTargetStockRange(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="rounded border-border"
            />
            Apply these settings to all products
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={onClose}>
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Tab 2 — Forecast */}
      {tab === "Forecast" && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Override sales velocity (units/day)</label>
            <input
              type="number"
              step="0.1"
              value={overrideVelocity}
              onChange={(e) => setOverrideVelocity(e.target.value)}
              placeholder="Calculated: 5.2"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Seasonal multipliers</label>
            <div className="grid grid-cols-4 gap-2">
              {MONTHS.map((m, i) => (
                <div key={m}>
                  <span className="text-2xs text-muted-foreground">{m}</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={seasonalMultipliers[i]}
                    onChange={(e) => handleSeasonalChange(i, e.target.value)}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Minimum order quantity</label>
              <input
                type="number"
                value={minOrderQty}
                onChange={(e) => setMinOrderQty(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Order quantity increment</label>
              <input
                type="number"
                value={orderQtyIncrement}
                onChange={(e) => setOrderQtyIncrement(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>

          {/* AI recommendation */}
          <div className="rounded-md border border-ai/20 bg-ai-muted border-l-[3px] border-l-ai px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-ai">
                <path d="M8 .5a.5.5 0 0 1 .47.33l1.71 4.72 4.72 1.71a.5.5 0 0 1 0 .94l-4.72 1.71-1.71 4.72a.5.5 0 0 1-.94 0L5.82 9.91 1.1 8.2a.5.5 0 0 1 0-.94l4.72-1.71L7.53.83A.5.5 0 0 1 8 .5Z" />
              </svg>
              <span className="text-2xs font-semibold uppercase tracking-wider text-ai">AI Insight</span>
            </div>
            <p className="text-xs text-foreground">
              Based on your 90-day trend, we suggest 5.2 units/day. November and December typically
              see a 40-80% increase for kitchen products.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={onClose}>
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Tab 3 — Shipping to FBA */}
      {tab === "Shipping to FBA" && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Preferred shipping method</label>
            <div className="flex gap-3 mt-1">
              {["Sea", "Air", "Ground"].map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="shippingMethod"
                    value={m}
                    checked={shippingMethod === m}
                    onChange={(e) => setShippingMethod(e.target.value)}
                    className="accent-primary"
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Carrier name</label>
            <input
              type="text"
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Shipping cost per unit ($)</label>
            <input
              type="number"
              step="0.01"
              value={shippingCostPerUnit}
              onChange={(e) => setShippingCostPerUnit(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Customs / duties cost per unit ($)</label>
            <input
              type="number"
              step="0.01"
              value={customsDutyCost}
              onChange={(e) => setCustomsDutyCost(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={onClose}>
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Tab 4 — Purchase Order */}
      {tab === "Purchase Order" && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Supplier name</label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Supplier email</label>
            <input
              type="email"
              value={supplierEmail}
              onChange={(e) => setSupplierEmail(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Supplier lead time override (days)</label>
            <input
              type="number"
              value={supplierLeadTime}
              onChange={(e) => setSupplierLeadTime(e.target.value)}
              placeholder="Use profile default"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Unit cost / COGS ($)</label>
            <input
              type="number"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Minimum order value ($)</label>
            <input
              type="number"
              value={minOrderValue}
              onChange={(e) => setMinOrderValue(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Payment terms</label>
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className={inputCls}
            >
              {PAYMENT_TERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={onClose}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
