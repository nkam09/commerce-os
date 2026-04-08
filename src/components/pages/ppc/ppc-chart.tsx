"use client";

import { useState, useRef, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils/cn";
import type { PPCChartDataPoint } from "@/lib/services/ppc-service";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PPCChartProps {
  data: PPCChartDataPoint[];
  onTimeRangeChange: (range: string) => void;
  activeRange: string;
}

type MetricKey = "adSpend" | "profit" | "ppcSales" | "acos" | "cpc" | "ctr" | "impressions" | "roas";

const TIME_PILLS = ["7d", "14d", "30d", "90d", "6m", "12m"] as const;

const TOGGLE_METRICS: { key: MetricKey; label: string; default: boolean }[] = [
  { key: "ppcSales", label: "Sales", default: false },
  { key: "cpc", label: "CPC", default: false },
  { key: "ctr", label: "CTR", default: false },
  { key: "impressions", label: "Impressions", default: false },
  { key: "roas", label: "ROAS", default: false },
];

// ─── Custom tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-foreground mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground tabular-nums">
            {p.name.includes("%") || p.name === "ACOS" || p.name === "CTR"
              ? `${p.value.toFixed(1)}%`
              : p.name === "Impressions"
              ? p.value.toLocaleString()
              : p.name === "ROAS"
              ? `${p.value.toFixed(2)}x`
              : `$${p.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PPCChart({ data, onTimeRangeChange, activeRange }: PPCChartProps) {
  const [visibleMetrics, setVisibleMetrics] = useState<Set<MetricKey>>(new Set(["adSpend", "profit", "acos"]));
  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleMetric = (key: MetricKey) => {
    setVisibleMetrics((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const has = (k: MetricKey) => visibleMetrics.has(k);

  // Format x-axis labels
  const chartData = data.map((d) => {
    const dt = new Date(d.date + "T00:00:00Z");
    const label = `${dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return { ...d, label, ctr: d.clicks > 0 && d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0, roas: d.adSpend > 0 ? d.ppcSales / d.adSpend : 0, cpc: d.clicks > 0 ? d.adSpend / d.clicks : 0 };
  });

  const hasNegativeProfit = chartData.some((d) => d.profit < 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Performance Chart</h3>
        <div className="flex items-center gap-2">
          {/* Time pills */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-elevated/50 p-0.5">
            {TIME_PILLS.map((pill) => (
              <button
                key={pill}
                onClick={() => onTimeRangeChange(pill)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                  activeRange === pill ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {pill}
              </button>
            ))}
          </div>
          {/* Config gear */}
          <div ref={gearRef} className="relative">
            <button onClick={() => setGearOpen(!gearOpen)} className="p-1.5 rounded-md hover:bg-elevated text-muted-foreground hover:text-foreground transition-colors">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492ZM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0Z" /><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319Zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116l.094-.318Z" /></svg>
            </button>
            {gearOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-border bg-card shadow-lg p-3 w-48">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Metrics</div>
                {[
                  { key: "adSpend" as MetricKey, label: "Ad Spend" },
                  { key: "profit" as MetricKey, label: "Profit" },
                  { key: "acos" as MetricKey, label: "ACOS %" },
                  ...TOGGLE_METRICS,
                ].map((m) => (
                  <label key={m.key} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input type="checkbox" checked={has(m.key)} onChange={() => toggleMetric(m.key)} className="rounded border-border" />
                    <span className="text-xs text-foreground">{m.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 450 }}>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No chart data for this period</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />

              {hasNegativeProfit && <ReferenceLine yAxisId="left" y={0} stroke="var(--border)" strokeDasharray="3 3" />}

              {has("adSpend") && <Bar yAxisId="left" dataKey="adSpend" name="Ad Spend" fill="#22c55e" barSize={12} radius={[2, 2, 0, 0]} />}
              {has("profit") && <Bar yAxisId="left" dataKey="profit" name="Profit" fill="#3b82f6" barSize={12} radius={[2, 2, 0, 0]} />}
              {has("ppcSales") && <Bar yAxisId="left" dataKey="ppcSales" name="Sales" fill="#8b5cf6" barSize={12} radius={[2, 2, 0, 0]} />}
              {has("acos") && <Line yAxisId="right" dataKey="acos" name="ACOS" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />}
              {has("ctr") && <Line yAxisId="right" dataKey="ctr" name="CTR" stroke="#ec4899" strokeWidth={2} dot={{ r: 2 }} />}
              {has("cpc") && <Line yAxisId="left" dataKey="cpc" name="CPC" stroke="#14b8a6" strokeWidth={2} dot={{ r: 2 }} />}
              {has("roas") && <Line yAxisId="right" dataKey="roas" name="ROAS" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} />}
              {has("impressions") && <Line yAxisId="right" dataKey="impressions" name="Impressions" stroke="#6366f1" strokeWidth={1.5} dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
