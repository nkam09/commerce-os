"use client";

import { create } from "zustand";

// ─── Date presets ────────────────────────────────────────────────────────────

export const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last14", label: "Last 14 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "mtd", label: "MTD" },
  { value: "lastMonth", label: "Last month" },
  { value: "last3months", label: "Last 3 months" },
  { value: "last12months", label: "Last 12 months" },
] as const;

export type DatePresetValue = (typeof DATE_PRESETS)[number]["value"] | "custom";

// ─── Compute date range from preset ─────────────────────────────────────────

function toStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeDateRange(preset: DatePresetValue): { from: string; to: string } {
  const now = new Date();
  const todayStr = toStr(now);
  const sub = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return toStr(d);
  };

  switch (preset) {
    case "today": return { from: todayStr, to: todayStr };
    case "yesterday": { const y = sub(1); return { from: y, to: y }; }
    case "last7": return { from: sub(6), to: todayStr };
    case "last14": return { from: sub(13), to: todayStr };
    case "last30": return { from: sub(29), to: todayStr };
    case "mtd": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toStr(first), to: todayStr };
    }
    case "lastMonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toStr(first), to: toStr(last) };
    }
    case "last3months": return { from: sub(89), to: todayStr };
    case "last12months": return { from: sub(364), to: todayStr };
    default: return { from: todayStr, to: todayStr };
  }
}

// ─── Store ──────────────────────────────────────────────────────────────────

interface DashboardState {
  datePreset: DatePresetValue;
  dateFrom: string;  // YYYY-MM-DD
  dateTo: string;    // YYYY-MM-DD
  customDateFrom: string | null;
  customDateTo: string | null;

  setDatePreset: (preset: DatePresetValue) => void;
  setCustomDateRange: (from: Date, to: Date) => void;
}

const initialRange = computeDateRange("last30");

export const useDashboardStore = create<DashboardState>()((set) => ({
  datePreset: "last30",
  dateFrom: initialRange.from,
  dateTo: initialRange.to,
  customDateFrom: null,
  customDateTo: null,

  setDatePreset: (preset) => {
    const range = computeDateRange(preset);
    console.log("[dashboard-store] preset:", preset, range);
    set({
      datePreset: preset,
      dateFrom: range.from,
      dateTo: range.to,
      customDateFrom: null,
      customDateTo: null,
    });
  },

  setCustomDateRange: (from, to) => {
    const fromStr = toStr(from);
    const toStr2 = toStr(to);
    console.log("[dashboard-store] custom range:", fromStr, "→", toStr2);
    set({
      datePreset: "custom",
      dateFrom: fromStr,
      dateTo: toStr2,
      customDateFrom: fromStr,
      customDateTo: toStr2,
    });
  },
}));
