"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils/cn";

export type PeriodPreset = {
  label: string;
  value: string;
  /** Start and end date getters */
  getRange: () => { from: Date; to: Date };
};

export type PeriodPresetGroup = {
  label: string;
  presets: PeriodPreset[];
};

type CompareMode = "none" | "previous" | "last_year";

type PeriodSelectorProps = {
  /** Currently selected preset value */
  value?: string;
  /** Custom date range override */
  customRange?: { from: Date; to: Date };
  /** Compare mode */
  compareMode?: CompareMode;
  onSelectPreset?: (preset: PeriodPreset) => void;
  onSelectCustomRange?: (from: Date, to: Date) => void;
  onCompareChange?: (mode: CompareMode) => void;
  className?: string;
};

/* ─── Default preset groups (spec §3: Configure Tiles) ─── */

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysAgo = (n: number) => {
  const d = today();
  d.setDate(d.getDate() - n);
  return d;
};

const monthStart = () => {
  const d = today();
  d.setDate(1);
  return d;
};

const lastMonthRange = () => {
  const start = new Date(today().getFullYear(), today().getMonth() - 1, 1);
  const end = new Date(today().getFullYear(), today().getMonth(), 0);
  return { from: start, to: end };
};

export const DEFAULT_PRESETS: PeriodPresetGroup[] = [
  {
    label: "Quick ranges",
    presets: [
      { label: "Today", value: "today", getRange: () => ({ from: today(), to: today() }) },
      { label: "Yesterday", value: "yesterday", getRange: () => ({ from: daysAgo(1), to: daysAgo(1) }) },
      { label: "Last 7 days", value: "7d", getRange: () => ({ from: daysAgo(6), to: today() }) },
      { label: "Last 14 days", value: "14d", getRange: () => ({ from: daysAgo(13), to: today() }) },
      { label: "Last 30 days", value: "30d", getRange: () => ({ from: daysAgo(29), to: today() }) },
    ],
  },
  {
    label: "Month",
    presets: [
      { label: "Month to date", value: "mtd", getRange: () => ({ from: monthStart(), to: today() }) },
      { label: "Last month", value: "last_month", getRange: () => lastMonthRange() },
    ],
  },
  {
    label: "Tiles preset",
    presets: [
      { label: "Today", value: "tiles_today", getRange: () => ({ from: today(), to: today() }) },
      { label: "Yesterday", value: "tiles_yesterday", getRange: () => ({ from: daysAgo(1), to: daysAgo(1) }) },
      { label: "Month to date", value: "tiles_mtd", getRange: () => ({ from: monthStart(), to: today() }) },
      { label: "This month (forecast)", value: "tiles_forecast", getRange: () => {
        const end = new Date(today().getFullYear(), today().getMonth() + 1, 0);
        return { from: monthStart(), to: end };
      }},
      { label: "Last month", value: "tiles_last_month", getRange: () => lastMonthRange() },
    ],
  },
];

const compareModes: { label: string; value: CompareMode }[] = [
  { label: "Do not compare", value: "none" },
  { label: "Previous period", value: "previous" },
  { label: "Same period last year", value: "last_year" },
];

/**
 * Period selector dropdown with preset ranges, comparison mode,
 * and custom date picker. Per spec §3.
 */
export function PeriodSelector({
  value,
  compareMode = "none",
  onSelectPreset,
  onCompareChange,
  className,
}: PeriodSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedLabel =
    DEFAULT_PRESETS
      .flatMap((g) => g.presets)
      .find((p) => p.value === value)?.label ?? "Select period";

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40"
      >
        <CalendarIcon />
        <span>{selectedLabel}</span>
        <svg viewBox="0 0 16 16" fill="currentColor" className={cn("h-3 w-3 text-muted-foreground transition", open && "rotate-180")}>
          <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 animate-fade-in rounded-lg border border-border bg-card p-3 shadow-xl">
          {DEFAULT_PRESETS.map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <p className="mb-1.5 px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              {group.presets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    onSelectPreset?.(preset);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-elevated",
                    value === preset.value
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-foreground"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ))}

          {/* Compare mode */}
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Comparison
            </p>
            {compareModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => onCompareChange?.(mode.value)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-elevated",
                  compareMode === mode.value
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground"
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-muted-foreground">
      <path d="M4.5 1a.5.5 0 0 1 .5.5V2h6v-.5a.5.5 0 0 1 1 0V2h1.5A1.5 1.5 0 0 1 15 3.5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-10A1.5 1.5 0 0 1 2.5 2H4v-.5a.5.5 0 0 1 .5-.5ZM2.5 3a.5.5 0 0 0-.5.5V5h12V3.5a.5.5 0 0 0-.5-.5h-11ZM2 6v7.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V6H2Z" />
    </svg>
  );
}
