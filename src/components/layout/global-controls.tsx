"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { useDashboardStore, DATE_PRESETS } from "@/lib/stores/dashboard-store";
import { DateRangePicker } from "@/components/ui/date-range-picker";

type GlobalControlsProps = { className?: string };

export function GlobalControls({ className }: GlobalControlsProps) {
  const [search, setSearch] = useState("");
  const [marketplace, setMarketplace] = useState("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const { datePreset, dateFrom, dateTo, setDatePreset, setCustomDateRange } = useDashboardStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Display label for the dropdown button
  const displayLabel = datePreset === "custom"
    ? `${formatShort(dateFrom)} – ${formatShort(dateTo)}`
    : DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? "Last 30 days";

  return (
    <div className={cn("border-b border-border bg-card/50 px-6 py-2.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Search */}
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <svg viewBox="0 0 16 16" fill="currentColor" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1ZM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, ASINs, SKUs…"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground outline-none transition placeholder:text-tertiary focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Date preset dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-muted-foreground">
                <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5ZM2 2a1 1 0 0 0-1 1v1h14V3a1 1 0 0 0-1-1H2Zm13 3H1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5Z" />
              </svg>
              {displayLabel}
              <svg viewBox="0 0 12 12" fill="none" className="h-2.5 w-2.5 text-muted-foreground">
                <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border border-border bg-card shadow-lg py-1">
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => {
                      setDatePreset(preset.value);
                      setDropdownOpen(false);
                    }}
                    className={cn(
                      "block w-full text-left px-3 py-1.5 text-xs transition",
                      datePreset === preset.value
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    setShowCustomPicker(true);
                  }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-elevated hover:text-foreground"
                >
                  Custom range…
                </button>
              </div>
            )}
          </div>

          {/* Marketplace filter */}
          <select
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground outline-none transition hover:border-primary/40"
          >
            <option value="all">All marketplaces</option>
            <option value="us">Amazon.com (US)</option>
            <option value="ca">Amazon.ca (CA)</option>
            <option value="uk">Amazon.co.uk (UK)</option>
            <option value="de">Amazon.de (DE)</option>
          </select>

          {/* Filters button */}
          <button className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .389.812l-4.64 5.8V12.5a.5.5 0 0 1-.223.416l-3 2A.5.5 0 0 1 5.75 14.5v-6.888l-4.64-5.8A.5.5 0 0 1 1.5 1.5Z" />
            </svg>
            Filters
          </button>

          {/* Refresh */}
          <button className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/40 hover:text-foreground" title="Refresh data">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M8 3a5 5 0 0 1 4.546 2.914.5.5 0 0 0 .908-.418A6 6 0 0 0 2 8a6 6 0 0 0 6 6 5.97 5.97 0 0 0 4.244-1.758.5.5 0 0 0-.708-.708A4.97 4.97 0 0 1 8 13a5 5 0 0 1 0-10Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Custom date range picker */}
      {showCustomPicker && (
        <DateRangePicker
          from={null}
          to={null}
          onApply={(from, to) => {
            setCustomDateRange(from, to);
            setShowCustomPicker(false);
          }}
          onCancel={() => setShowCustomPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

