"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { PPCSummaryMetrics } from "@/lib/services/ppc-service";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PPCSummaryPanelProps {
  summary: PPCSummaryMetrics;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtD = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtP = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
const fmtI = (v: number) => v.toLocaleString("en-US");

// ─── Expandable row ──────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  bold,
  large,
  color,
  expandable,
  children,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
  color?: string;
  expandable?: boolean;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={expandable ? () => setExpanded(!expanded) : undefined}
        className={cn(
          "w-full flex items-center justify-between py-2.5 px-3 text-left transition-colors",
          expandable && "hover:bg-elevated/30 cursor-pointer",
          !expandable && "cursor-default"
        )}
      >
        <span className="flex items-center gap-1.5">
          {expandable && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              className={cn("text-muted-foreground transition-transform", expanded && "rotate-90")}
            >
              <path d="M3 1l4 4-4 4" />
            </svg>
          )}
          <span className={cn("text-xs", bold ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
        </span>
        <span
          className={cn(
            "tabular-nums text-right",
            large ? "text-lg font-bold" : bold ? "text-sm font-semibold" : "text-xs",
            color ?? "text-foreground"
          )}
        >
          {value}
        </span>
      </button>
      {expanded && children && <div className="pl-6 pb-1">{children}</div>}
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PPCSummaryPanel({ summary: s }: PPCSummaryPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-card max-h-[500px] overflow-y-auto">
      <div className="px-3 py-2.5 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</h3>
      </div>

      <MetricRow label="PPC Sales" value={fmtD(s.ppcSales)} bold />

      <MetricRow label="Orders" value={fmtI(s.orders)} expandable>
        <SubRow label="Conversion Rate" value={fmtP(s.conversionRate)} />
        <SubRow label="Total Clicks" value={fmtI(s.clicks)} />
      </MetricRow>

      <MetricRow label="Ad Spend" value={fmtD(s.adSpend)} bold color="text-red-400" />

      <MetricRow
        label="Profit"
        value={fmtD(s.profit)}
        bold
        large
        color={s.profit >= 0 ? "text-green-400" : "text-red-400"}
      />

      <MetricRow label="Average CPC" value={s.cpc != null ? `$${s.cpc.toFixed(2)}` : "—"} />

      <MetricRow
        label="ACOS"
        value={fmtP(s.acos)}
        bold
        color={s.acos != null && s.acos < 25 ? "text-green-400" : s.acos != null && s.acos < 40 ? "text-amber-400" : "text-red-400"}
      />

      <MetricRow
        label="TACOS"
        value={fmtP(s.tacos)}
        color={s.tacos != null && s.tacos < 10 ? "text-green-400" : s.tacos != null && s.tacos < 15 ? "text-amber-400" : "text-foreground"}
      />

      <MetricRow label="CTR" value={fmtP(s.ctr)} />

      <MetricRow label="Impressions" value={fmtI(s.impressions)} />

      <MetricRow
        label="ROAS"
        value={s.roas != null ? `${s.roas.toFixed(2)}x` : "—"}
        color={s.roas != null && s.roas >= 3 ? "text-green-400" : s.roas != null && s.roas >= 2 ? "text-amber-400" : "text-foreground"}
      />
    </div>
  );
}
