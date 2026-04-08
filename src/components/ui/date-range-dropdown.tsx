"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { DateRangePicker } from "./date-range-picker";

type Preset = { label: string; value: string };

type Props = {
  presets: Preset[];
  selectedPreset: string;
  onPresetChange: (value: string) => void;
  customFrom: Date | null;
  customTo: Date | null;
  onCustomApply: (from: Date, to: Date) => void;
  /** Which side the calendar popup opens toward. "left" (default) or "right" */
  align?: "left" | "right";
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateRange(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromStr = `${SHORT_MONTHS[from.getMonth()]} ${from.getDate()}`;
  const toStr = sameYear
    ? `${SHORT_MONTHS[to.getMonth()]} ${to.getDate()}, ${to.getFullYear()}`
    : `${SHORT_MONTHS[to.getMonth()]} ${to.getDate()}, ${to.getFullYear()}`;
  return `${fromStr} \u2013 ${toStr}`;
}

export function DateRangeDropdown({
  presets,
  selectedPreset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomApply,
  align,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isCustom = selectedPreset === "custom";
  const customLabel =
    isCustom && customFrom && customTo
      ? formatDateRange(customFrom, customTo)
      : null;

  const buttonLabel =
    customLabel ?? presets.find((p) => p.value === selectedPreset)?.label ?? "Select range";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setShowPicker(false);
        }}
        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-elevated transition-colors"
      >
        {buttonLabel}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3 h-3 opacity-50"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && !showPicker && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-border bg-card shadow-lg py-1">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                onPresetChange(preset.value);
                setOpen(false);
              }}
              className={cn(
                "block w-full text-left px-3 py-1.5 text-xs transition-colors",
                preset.value === selectedPreset && !isCustom
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-elevated",
              )}
            >
              {preset.label}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowPicker(true);
            }}
            className={cn(
              "block w-full text-left px-3 py-1.5 text-xs transition-colors",
              isCustom
                ? "bg-primary/10 text-primary font-medium"
                : "text-foreground hover:bg-elevated",
            )}
          >
            Custom range...
          </button>
        </div>
      )}

      {showPicker && (
        <DateRangePicker
          from={customFrom}
          to={customTo}
          onApply={(from, to) => {
            onCustomApply(from, to);
            setShowPicker(false);
            setOpen(false);
          }}
          onCancel={() => {
            setShowPicker(false);
          }}
          align={align}
        />
      )}
    </div>
  );
}
