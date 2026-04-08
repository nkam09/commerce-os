"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import type {
  ScenarioInputs,
  ScenarioOutputs,
  SavedScenario,
} from "@/lib/services/cashflow-service";
import { calculateScenarioOutputs } from "@/lib/services/cashflow-service";

type Props = {
  defaultInputs: ScenarioInputs;
  savedScenarios: SavedScenario[];
};

// ─── Preset templates ─────────────────────────────────────────────────────────

const PRESETS: { name: string; inputs: ScenarioInputs }[] = [
  {
    name: "Aggressive Growth",
    inputs: {
      dailyAdSpend: 280,
      monthlyRevenueGrowth: 15,
      acosTarget: 28,
      nextInventoryOrderAmount: 5000,
      inventoryOrderDate: "2026-04-01",
      additionalOrders: [{ amount: 3000, date: "2026-05-15" }],
      monthlyIndirectExpenses: 1200,
      oneTimeExpense: 500,
      revenuePauseDays: 0,
      amazonReservePct: 3,
    },
  },
  {
    name: "Conservative",
    inputs: {
      dailyAdSpend: 100,
      monthlyRevenueGrowth: 3,
      acosTarget: 20,
      nextInventoryOrderAmount: 1500,
      inventoryOrderDate: "2026-05-01",
      additionalOrders: [],
      monthlyIndirectExpenses: 600,
      oneTimeExpense: 0,
      revenuePauseDays: 0,
      amazonReservePct: 5,
    },
  },
  {
    name: "New Product Launch",
    inputs: {
      dailyAdSpend: 250,
      monthlyRevenueGrowth: 20,
      acosTarget: 35,
      nextInventoryOrderAmount: 4000,
      inventoryOrderDate: "2026-04-10",
      additionalOrders: [{ amount: 2000, date: "2026-05-20" }],
      monthlyIndirectExpenses: 1000,
      oneTimeExpense: 1500,
      revenuePauseDays: 7,
      amazonReservePct: 5,
    },
  },
  {
    name: "Stockout Recovery",
    inputs: {
      dailyAdSpend: 200,
      monthlyRevenueGrowth: 5,
      acosTarget: 22,
      nextInventoryOrderAmount: 6000,
      inventoryOrderDate: "2026-03-25",
      additionalOrders: [],
      monthlyIndirectExpenses: 800,
      oneTimeExpense: 300,
      revenuePauseDays: 14,
      amazonReservePct: 3,
    },
  },
];

// ─── Slider + Number Input ────────────────────────────────────────────────────

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-2xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1.5 rounded-full appearance-none bg-muted accent-primary cursor-pointer"
        />
        <div className="flex items-center rounded-md border border-border bg-elevated px-2 py-1 min-w-[80px]">
          {prefix && (
            <span className="text-2xs text-muted-foreground mr-0.5">
              {prefix}
            </span>
          )}
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            className="w-full bg-transparent text-xs tabular-nums text-foreground outline-none"
          />
          {suffix && (
            <span className="text-2xs text-muted-foreground ml-0.5">
              {suffix}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Output Card ──────────────────────────────────────────────────────────────

function OutputCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-elevated px-3 py-2">
      <p className="text-2xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums", color ?? "text-foreground")}>
        {value}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ScenarioPlanner({ defaultInputs, savedScenarios }: Props) {
  const [inputs, setInputs] = useState<ScenarioInputs>(defaultInputs);
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState<SavedScenario[]>(savedScenarios);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const update = useCallback(
    (patch: Partial<ScenarioInputs>) => {
      setInputs((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const outputs: ScenarioOutputs = useMemo(
    () => calculateScenarioOutputs(inputs),
    [inputs]
  );

  const handleSave = () => {
    if (!saveName.trim()) return;
    const newScenario: SavedScenario = {
      id: `sc-${Date.now()}`,
      name: saveName.trim(),
      inputs: { ...inputs },
      outputs: { ...outputs },
    };
    setSaved((prev) => [...prev, newScenario]);
    setSaveName("");
  };

  const loadScenario = (id: string) => {
    const sc = saved.find((s) => s.id === id);
    if (sc) setInputs({ ...sc.inputs });
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
  };

  const addOrder = () => {
    if (inputs.additionalOrders.length >= 3) return;
    update({
      additionalOrders: [
        ...inputs.additionalOrders,
        { amount: 1000, date: "2026-05-01" },
      ],
    });
  };

  const removeOrder = (index: number) => {
    update({
      additionalOrders: inputs.additionalOrders.filter((_, i) => i !== index),
    });
  };

  const updateOrder = (
    index: number,
    patch: Partial<{ amount: number; date: string }>
  ) => {
    const orders = [...inputs.additionalOrders];
    orders[index] = { ...orders[index], ...patch };
    update({ additionalOrders: orders });
  };

  const comparedScenarios = saved.filter((s) => compareIds.has(s.id));

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-foreground">
          Scenario Planner
        </h3>
        {saved.length > 0 && (
          <select
            className="rounded-md border border-border bg-elevated px-2 py-1 text-2xs text-foreground"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) loadScenario(e.target.value);
            }}
          >
            <option value="">Load saved...</option>
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setInputs({ ...p.inputs })}
            className="rounded-md border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition"
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Inputs grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SliderInput
          label="Daily Ad Spend"
          value={inputs.dailyAdSpend}
          onChange={(v) => update({ dailyAdSpend: v })}
          min={0}
          max={1000}
          step={5}
          prefix="$"
        />
        <SliderInput
          label="Monthly Revenue Growth"
          value={inputs.monthlyRevenueGrowth}
          onChange={(v) => update({ monthlyRevenueGrowth: v })}
          min={-20}
          max={50}
          step={1}
          suffix="%"
        />
        <SliderInput
          label="ACOS Target"
          value={inputs.acosTarget}
          onChange={(v) => update({ acosTarget: v })}
          min={5}
          max={60}
          step={1}
          suffix="%"
        />
        <SliderInput
          label="Next Inventory Order"
          value={inputs.nextInventoryOrderAmount}
          onChange={(v) => update({ nextInventoryOrderAmount: v })}
          min={0}
          max={20000}
          step={100}
          prefix="$"
        />

        <div className="space-y-1">
          <label className="text-2xs font-medium text-muted-foreground">
            Inventory Order Date
          </label>
          <input
            type="date"
            value={inputs.inventoryOrderDate}
            onChange={(e) => update({ inventoryOrderDate: e.target.value })}
            className="w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-xs text-foreground"
          />
        </div>

        <SliderInput
          label="Monthly Indirect Expenses"
          value={inputs.monthlyIndirectExpenses}
          onChange={(v) => update({ monthlyIndirectExpenses: v })}
          min={0}
          max={5000}
          step={50}
          prefix="$"
        />
        <SliderInput
          label="One-time Expense"
          value={inputs.oneTimeExpense}
          onChange={(v) => update({ oneTimeExpense: v })}
          min={0}
          max={10000}
          step={100}
          prefix="$"
        />
        <SliderInput
          label="Revenue Pause Days"
          value={inputs.revenuePauseDays}
          onChange={(v) => update({ revenuePauseDays: v })}
          min={0}
          max={30}
          step={1}
          suffix="days"
        />
        <SliderInput
          label="Amazon Reserve"
          value={inputs.amazonReservePct}
          onChange={(v) => update({ amazonReservePct: v })}
          min={0}
          max={15}
          step={0.5}
          suffix="%"
        />
      </div>

      {/* Additional orders */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xs font-medium text-muted-foreground">
            Additional Inventory Orders
          </span>
          {inputs.additionalOrders.length < 3 && (
            <button
              type="button"
              onClick={addOrder}
              className="rounded-md border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:text-foreground hover:bg-elevated transition"
            >
              + Add
            </button>
          )}
        </div>
        {inputs.additionalOrders.map((order, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <div className="flex items-center rounded-md border border-border bg-elevated px-2 py-1">
              <span className="text-2xs text-muted-foreground mr-0.5">$</span>
              <input
                type="number"
                value={order.amount}
                onChange={(e) =>
                  updateOrder(i, { amount: Number(e.target.value) })
                }
                className="w-20 bg-transparent text-xs tabular-nums text-foreground outline-none"
              />
            </div>
            <input
              type="date"
              value={order.date}
              onChange={(e) => updateOrder(i, { date: e.target.value })}
              className="rounded-md border border-border bg-elevated px-2 py-1 text-xs text-foreground"
            />
            <button
              type="button"
              onClick={() => removeOrder(i)}
              className="rounded-md px-1.5 py-0.5 text-2xs text-red-400 hover:bg-red-500/10 transition"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Outputs */}
      <div className="border-t border-border pt-4 mb-4">
        <h4 className="text-2xs font-semibold text-foreground mb-3 uppercase tracking-wider">
          Projected Outcomes
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <OutputCard
            label="Days to Break-even"
            value={`${outputs.daysToBreakeven}d`}
            color={
              outputs.daysToBreakeven <= 30
                ? "text-green-400"
                : outputs.daysToBreakeven <= 60
                ? "text-yellow-400"
                : "text-red-400"
            }
          />
          <OutputCard
            label="Min Cash Needed"
            value={formatCurrency(outputs.minimumCashNeeded)}
            color="text-foreground"
          />
          <OutputCard
            label="Cash-positive Date"
            value={outputs.cashPositiveDate}
            color="text-foreground"
          />
          <OutputCard
            label="90-Day Ending Balance"
            value={formatCurrency(outputs.ninetyDayEndingBalance)}
            color={
              outputs.ninetyDayEndingBalance >= 0
                ? "text-green-400"
                : "text-red-400"
            }
          />
          <OutputCard
            label="Inventory ROI"
            value={`${outputs.inventoryRoi}%`}
            color={
              outputs.inventoryRoi >= 100
                ? "text-green-400"
                : outputs.inventoryRoi >= 0
                ? "text-yellow-400"
                : "text-red-400"
            }
          />
        </div>
      </div>

      {/* Save scenario */}
      <div className="flex items-center gap-2 border-t border-border pt-4 mb-4">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="Scenario name..."
          className="flex-1 rounded-md border border-border bg-elevated px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!saveName.trim()}
          className={cn(
            "rounded-md px-3 py-1.5 text-2xs font-medium transition",
            saveName.trim()
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          Save Scenario
        </button>
      </div>

      {/* Compare toggle */}
      {saved.length >= 2 && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-2xs font-semibold text-foreground uppercase tracking-wider">
              Compare Scenarios
            </h4>
            <button
              type="button"
              onClick={() => setShowCompare(!showCompare)}
              className="text-2xs text-primary hover:underline"
            >
              {showCompare ? "Hide" : "Show"} comparison
            </button>
          </div>

          {showCompare && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {saved.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleCompare(s.id)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-2xs font-medium transition",
                      compareIds.has(s.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-elevated"
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {comparedScenarios.length >= 2 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-2xs font-medium text-muted-foreground px-3 py-2">
                          Metric
                        </th>
                        {comparedScenarios.map((s) => (
                          <th
                            key={s.id}
                            className="text-right text-2xs font-medium text-muted-foreground px-3 py-2"
                          >
                            {s.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-muted-foreground">
                          Days to Break-even
                        </td>
                        {comparedScenarios.map((s) => (
                          <td
                            key={s.id}
                            className="px-3 py-2 text-right tabular-nums text-foreground"
                          >
                            {s.outputs.daysToBreakeven}d
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-muted-foreground">
                          Min Cash Needed
                        </td>
                        {comparedScenarios.map((s) => (
                          <td
                            key={s.id}
                            className="px-3 py-2 text-right tabular-nums text-foreground"
                          >
                            {formatCurrency(s.outputs.minimumCashNeeded)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-muted-foreground">
                          90-Day Balance
                        </td>
                        {comparedScenarios.map((s) => (
                          <td
                            key={s.id}
                            className={cn(
                              "px-3 py-2 text-right tabular-nums font-medium",
                              s.outputs.ninetyDayEndingBalance >= 0
                                ? "text-green-400"
                                : "text-red-400"
                            )}
                          >
                            {formatCurrency(s.outputs.ninetyDayEndingBalance)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-muted-foreground">
                          Inventory ROI
                        </td>
                        {comparedScenarios.map((s) => (
                          <td
                            key={s.id}
                            className="px-3 py-2 text-right tabular-nums text-foreground"
                          >
                            {s.outputs.inventoryRoi}%
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground">
                          Daily Ad Spend
                        </td>
                        {comparedScenarios.map((s) => (
                          <td
                            key={s.id}
                            className="px-3 py-2 text-right tabular-nums text-foreground"
                          >
                            {formatCurrency(s.inputs.dailyAdSpend)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
