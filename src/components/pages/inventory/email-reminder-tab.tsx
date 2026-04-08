"use client";

import { useState } from "react";
import { Button } from "@/components/shared/button";
import type { ForecastProduct } from "@/lib/services/restock-service";

type Props = {
  products: ForecastProduct[];
};

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/20";
const labelCls = "block text-xs text-muted-foreground mb-1";

export function EmailReminderTab({ products }: Props) {
  const [daysBefore, setDaysBefore] = useState(14);
  const [frequency, setFrequency] = useState<"daily" | "critical">("daily");
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  function handleOverride(asin: string, val: number) {
    setOverrides((prev) => ({ ...prev, [asin]: val }));
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Global threshold */}
      <div>
        <label className={labelCls}>
          Notify me this many days before projected stockout
        </label>
        <input
          type="number"
          value={daysBefore}
          onChange={(e) => setDaysBefore(Number(e.target.value))}
          className={inputCls + " max-w-[160px]"}
          min={1}
        />
      </div>

      {/* Email frequency */}
      <div>
        <label className={labelCls}>Email frequency</label>
        <div className="flex gap-4 mt-1">
          <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
            <input
              type="radio"
              name="frequency"
              checked={frequency === "daily"}
              onChange={() => setFrequency("daily")}
              className="accent-primary"
            />
            Daily digest
          </label>
          <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
            <input
              type="radio"
              name="frequency"
              checked={frequency === "critical"}
              onChange={() => setFrequency("critical")}
              className="accent-primary"
            />
            Critical only
          </label>
        </div>
      </div>

      {/* Per-product overrides */}
      <div>
        <label className={labelCls}>Per-product threshold overrides</label>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="text-left px-3 py-2 text-2xs font-medium text-muted-foreground">
                  Product
                </th>
                <th className="text-right px-3 py-2 text-2xs font-medium text-muted-foreground w-32">
                  Threshold (days)
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={p.asin}
                  className="border-b border-border last:border-0 hover:bg-elevated/20 transition"
                >
                  <td className="px-3 py-2">
                    <p className="text-xs text-foreground truncate max-w-[320px]">
                      {p.title}
                    </p>
                    <p className="text-2xs text-muted-foreground">{p.asin}</p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={overrides[p.asin] ?? daysBefore}
                      onChange={(e) =>
                        handleOverride(p.asin, Number(e.target.value))
                      }
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs w-20 text-right outline-none focus:ring-1 focus:ring-primary/20 tabular-nums"
                      min={1}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button size="sm">Save Settings</Button>
      </div>
    </div>
  );
}
