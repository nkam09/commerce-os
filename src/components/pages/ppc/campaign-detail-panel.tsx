"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton-loader";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import type { CampaignDetail } from "@/lib/services/ppc-service";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  campaignName: string;
  from: string;
  to: string;
  onClose: () => void;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtD = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtP = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
const fmtI = (v: number) => v.toLocaleString("en-US");

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function MiniTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5 shadow text-[10px]">
      <div className="font-medium text-foreground mb-0.5">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground tabular-nums">
            {p.name === "ACOS" ? `${p.value.toFixed(1)}%` : `$${p.value.toFixed(2)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat row ────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium tabular-nums", color ?? "text-foreground")}>{value}</span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CampaignDetailPanel({ campaignName, from, to, onClose }: Props) {
  const { data, isLoading } = useQuery<CampaignDetail>({
    queryKey: ["ppc-campaign-detail", campaignName, from, to],
    queryFn: async () => {
      const url = `/api/ppc/campaign/${encodeURIComponent(campaignName)}?from=${from}&to=${to}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Chart data with labels
  const chartData = data?.dailyData.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  })) ?? [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[500px] bg-card border-l border-border shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-4 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate" title={campaignName}>{campaignName}</h2>
            {data && (
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold uppercase",
                  data.campaignType === "SP" ? "bg-blue-500/20 text-blue-400" :
                  data.campaignType === "SB" ? "bg-purple-500/20 text-purple-400" :
                  data.campaignType === "SD" ? "bg-amber-500/20 text-amber-400" :
                  "bg-green-500/20 text-green-400"
                )}>{data.campaignType}</span>
                <span className="text-[10px] text-muted-foreground">{from} → {to}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="ml-3 p-1 rounded-md hover:bg-elevated text-muted-foreground hover:text-foreground">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-[200px] rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : data ? (
          <div className="p-5 space-y-5">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-elevated/30 p-3 text-center">
                <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Spend</div>
                <div className="text-sm font-bold text-red-400 tabular-nums">{fmtD(data.totalSpend)}</div>
              </div>
              <div className="rounded-lg border border-border bg-elevated/30 p-3 text-center">
                <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Sales</div>
                <div className="text-sm font-bold text-foreground tabular-nums">{fmtD(data.totalSales)}</div>
              </div>
              <div className="rounded-lg border border-border bg-elevated/30 p-3 text-center">
                <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Profit</div>
                <div className={cn("text-sm font-bold tabular-nums", data.totalProfit >= 0 ? "text-green-400" : "text-red-400")}>{fmtD(data.totalProfit)}</div>
              </div>
            </div>

            {/* Mini chart */}
            <div className="rounded-lg border border-border bg-elevated/20 p-3">
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Daily Performance</h3>
              {chartData.length > 0 ? (
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                      <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                      <Tooltip content={<MiniTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line yAxisId="left" dataKey="adSpend" name="Spend" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} />
                      <Line yAxisId="right" dataKey="acos" name="ACOS" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">No daily data</div>
              )}
            </div>

            {/* Key metrics */}
            <div className="rounded-lg border border-border p-3 divide-y divide-border/30">
              <Stat label="ACOS" value={fmtP(data.acos)} color={data.acos != null && data.acos < 25 ? "text-green-400" : "text-amber-400"} />
              <Stat label="ROAS" value={data.roas != null ? `${data.roas.toFixed(2)}x` : "—"} />
              <Stat label="CPC" value={data.cpc != null ? `$${data.cpc.toFixed(2)}` : "—"} />
              <Stat label="CTR" value={fmtP(data.ctr)} />
              <Stat label="Conv. Rate" value={fmtP(data.conversionRate)} />
              <Stat label="Impressions" value={fmtI(data.impressions)} />
              <Stat label="Clicks" value={fmtI(data.clicks)} />
              <Stat label="Orders" value={fmtI(data.orders)} />
            </div>

            {/* Product breakdown */}
            {data.productBreakdown.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 bg-elevated/30 border-b border-border">
                  <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Per-Product Breakdown</h3>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-elevated/20">
                      <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">Product</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase text-muted-foreground font-semibold">Spend</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase text-muted-foreground font-semibold">Sales</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase text-muted-foreground font-semibold">ACOS</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase text-muted-foreground font-semibold">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.productBreakdown.map((p) => (
                      <tr key={p.productId} className="border-b border-border/30 hover:bg-elevated/20">
                        <td className="px-3 py-2">
                          <div className="font-mono text-[10px] text-muted-foreground">{p.asin}</div>
                          <div className="text-xs text-foreground truncate max-w-[180px]">{p.title}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtD(p.adSpend)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtD(p.ppcSales)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <span className={cn(p.acos != null && p.acos < 25 ? "text-green-400" : "text-amber-400")}>{fmtP(p.acos)}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <span className={p.profit >= 0 ? "text-green-400" : "text-red-400"}>{fmtD(p.profit)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5 text-sm text-muted-foreground">No data available</div>
        )}
      </div>
    </>
  );
}
