"use client";

import { useState } from "react";
import { Button } from "@/components/shared/button";
import type { ForecastProduct } from "@/lib/services/restock-service";

type Props = {
  products: ForecastProduct[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/20";
const labelCls = "block text-xs text-muted-foreground mb-1";

export function CustomizeForecastTab({ products }: Props) {
  const [selectedAsin, setSelectedAsin] = useState<string>(
    products[0]?.asin ?? ""
  );
  const [overrideVelocity, setOverrideVelocity] = useState("");
  const [seasonalMultipliers, setSeasonalMultipliers] = useState<number[]>(
    Array(12).fill(1.0)
  );
  const [weight, setWeight] = useState(50);

  const selected = products.find((p) => p.asin === selectedAsin);

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
    <div className="space-y-5 max-w-2xl">
      {/* Product selector */}
      <div>
        <label className={labelCls}>Select product</label>
        <select
          value={selectedAsin}
          onChange={(e) => setSelectedAsin(e.target.value)}
          className={inputCls}
        >
          {products.map((p) => (
            <option key={p.asin} value={p.asin}>
              {p.title} ({p.asin})
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          {/* Current velocity */}
          <div className="rounded-md border border-border bg-card p-4">
            <span className="text-2xs text-muted-foreground">
              Current calculated velocity
            </span>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {selected.salesVelocity.toFixed(1)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                units/day
              </span>
            </p>
          </div>

          {/* Override velocity */}
          <div>
            <label className={labelCls}>Override velocity (units/day)</label>
            <input
              type="number"
              step="0.1"
              value={overrideVelocity}
              onChange={(e) => setOverrideVelocity(e.target.value)}
              placeholder={`Calculated: ${selected.salesVelocity.toFixed(1)}`}
              className={inputCls}
            />
          </div>

          {/* Seasonal multipliers */}
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

          {/* Weight slider */}
          <div>
            <label className={labelCls}>Forecast weight preference</label>
            <div className="flex items-center gap-3">
              <span className="text-2xs text-muted-foreground whitespace-nowrap">
                Recent data
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-2xs text-muted-foreground whitespace-nowrap">
                Long-term data
              </span>
            </div>
          </div>

          {/* AI recommendation */}
          <div className="rounded-md border border-ai/20 bg-ai-muted border-l-[3px] border-l-ai px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-3.5 w-3.5 text-ai"
              >
                <path d="M8 .5a.5.5 0 0 1 .47.33l1.71 4.72 4.72 1.71a.5.5 0 0 1 0 .94l-4.72 1.71-1.71 4.72a.5.5 0 0 1-.94 0L5.82 9.91 1.1 8.2a.5.5 0 0 1 0-.94l4.72-1.71L7.53.83A.5.5 0 0 1 8 .5Z" />
              </svg>
              <span className="text-2xs font-semibold uppercase tracking-wider text-ai">
                AI Insight
              </span>
            </div>
            <p className="text-xs text-foreground">
              Based on your 90-day trend, we suggest{" "}
              <strong>{selected.salesVelocity.toFixed(1)} units/day</strong>.
              Your Q4 historically shows a 40% volume increase — consider
              adjusting Nov/Dec multipliers to 1.4-1.8x.
            </p>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <Button size="sm">Save Forecast Settings</Button>
          </div>
        </>
      )}
    </div>
  );
}
