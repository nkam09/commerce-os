"use client";

import { useState } from "react";
// cn import available if needed for conditional classes

export interface PPCFilters {
  search: string;
  status: string;
  type: string;
  acosMin: string;
  acosMax: string;
  spendMin: string;
  spendMax: string;
  salesMin: string;
  salesMax: string;
}

export const DEFAULT_FILTERS: PPCFilters = {
  search: "", status: "all", type: "all",
  acosMin: "", acosMax: "", spendMin: "", spendMax: "", salesMin: "", salesMax: "",
};

interface Props {
  filters: PPCFilters;
  onApply: (f: PPCFilters) => void;
  onCancel: () => void;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function RangeInput({ label, min, max, onMinChange, onMaxChange }: { label: string; min: string; max: string; onMinChange: (v: string) => void; onMaxChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" placeholder="Min" value={min} onChange={(e) => onMinChange(e.target.value)} className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground" />
        <span className="text-muted-foreground text-xs">–</span>
        <input type="number" placeholder="Max" value={max} onChange={(e) => onMaxChange(e.target.value)} className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground" />
      </div>
    </div>
  );
}

export function PPCFilterPanel({ filters: initial, onApply, onCancel }: Props) {
  const [f, setF] = useState<PPCFilters>({ ...initial });

  const update = (key: keyof PPCFilters, val: string) => setF((prev) => ({ ...prev, [key]: val }));
  const clearAll = () => setF({ ...DEFAULT_FILTERS });
  const hasFilters = f.search || f.status !== "all" || f.type !== "all" || f.acosMin || f.acosMax || f.spendMin || f.spendMax || f.salesMin || f.salesMax;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">Advanced Filters</h3>
        {hasFilters && (
          <button onClick={clearAll} className="text-[10px] text-primary hover:underline">Clear all</button>
        )}
      </div>

      {/* Row 1: text search + dropdowns */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Search</label>
          <input
            type="text"
            placeholder="Campaign name..."
            value={f.search}
            onChange={(e) => update("search", e.target.value)}
            className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <FilterSelect label="Status" value={f.status} onChange={(v) => update("status", v)} options={[
          { value: "all", label: "All Statuses" },
          { value: "ENABLED", label: "Active" },
          { value: "PAUSED", label: "Paused" },
          { value: "ARCHIVED", label: "Archived" },
        ]} />
        <FilterSelect label="Campaign Type" value={f.type} onChange={(v) => update("type", v)} options={[
          { value: "all", label: "All Types" },
          { value: "SP", label: "Sponsored Products" },
          { value: "SB", label: "Sponsored Brands" },
          { value: "SBV", label: "Sponsored Brands Video" },
          { value: "SD", label: "Sponsored Display" },
        ]} />
      </div>

      {/* Row 2: range inputs */}
      <div className="grid grid-cols-3 gap-4">
        <RangeInput label="ACOS (%)" min={f.acosMin} max={f.acosMax} onMinChange={(v) => update("acosMin", v)} onMaxChange={(v) => update("acosMax", v)} />
        <RangeInput label="Spend ($)" min={f.spendMin} max={f.spendMax} onMinChange={(v) => update("spendMin", v)} onMaxChange={(v) => update("spendMax", v)} />
        <RangeInput label="Sales ($)" min={f.salesMin} max={f.salesMax} onMinChange={(v) => update("salesMin", v)} onMaxChange={(v) => update("salesMax", v)} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md transition">Cancel</button>
        <button onClick={() => onApply(f)} className="px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition">Apply</button>
      </div>
    </div>
  );
}
