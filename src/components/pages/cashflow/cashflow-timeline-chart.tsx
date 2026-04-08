"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import type { TimelinePoint } from "@/lib/services/cashflow-service";

type Props = {
  timeline: TimelinePoint[];
};

type TimeRange = "30d" | "60d" | "90d" | "180d";

const TIME_RANGES: { key: TimeRange; label: string; days: number }[] = [
  { key: "30d", label: "30d", days: 30 },
  { key: "60d", label: "60d", days: 60 },
  { key: "90d", label: "90d", days: 90 },
  { key: "180d", label: "180d", days: 180 },
];

export function CashflowTimelineChart({ timeline }: Props) {
  const [range, setRange] = useState<TimeRange>("90d");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const data = useMemo(() => {
    const days = TIME_RANGES.find((r) => r.key === range)?.days ?? 90;
    return timeline.slice(-Math.min(days, timeline.length));
  }, [timeline, range]);

  const maxCash = useMemo(
    () => Math.max(...data.map((d) => Math.max(d.cashIn, d.cashOut)), 1),
    [data]
  );

  const balanceExtent = useMemo(() => {
    const values = data.map((d) => d.netBalance);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [data]);

  const balanceRange = balanceExtent.max - balanceExtent.min || 1;

  // SVG polyline for net balance
  const balancePoints = useMemo(() => {
    if (data.length === 0) return "";
    const barWidth = 100 / data.length;
    return data
      .map((d, i) => {
        const x = barWidth * i + barWidth / 2;
        const y =
          ((balanceExtent.max - d.netBalance) / balanceRange) * 100;
        return `${x},${y}`;
      })
      .join(" ");
  }, [data, balanceExtent, balanceRange]);

  // Area fill points for cash in
  const cashInArea = useMemo(() => {
    if (data.length === 0) return "";
    const barWidth = 100 / data.length;
    const topPoints = data.map((d, i) => {
      const x = barWidth * i + barWidth / 2;
      const y = (1 - d.cashIn / maxCash) * 100;
      return `${x},${y}`;
    });
    const first = barWidth / 2;
    const last = barWidth * (data.length - 1) + barWidth / 2;
    return `${first},100 ${topPoints.join(" ")} ${last},100`;
  }, [data, maxCash]);

  // Area fill points for cash out
  const cashOutArea = useMemo(() => {
    if (data.length === 0) return "";
    const barWidth = 100 / data.length;
    const topPoints = data.map((d, i) => {
      const x = barWidth * i + barWidth / 2;
      const y = (1 - d.cashOut / maxCash) * 100;
      return `${x},${y}`;
    });
    const first = barWidth / 2;
    const last = barWidth * (data.length - 1) + barWidth / 2;
    return `${first},100 ${topPoints.join(" ")} ${last},100`;
  }, [data, maxCash]);

  const chartHeight = 380;

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const xLabelStep = data.length > 60 ? 10 : data.length > 30 ? 5 : 3;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-foreground">
          Cash Flow Timeline
        </h3>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.key}
              type="button"
              onClick={() => setRange(tr.key)}
              className={cn(
                "rounded px-2.5 py-1 text-2xs font-medium transition",
                range === tr.key
                  ? "bg-elevated text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-green-500/60" />
          <span className="text-2xs text-muted-foreground">Cash In</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-red-500/60" />
          <span className="text-2xs text-muted-foreground">Cash Out</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1 w-4 rounded-full bg-blue-400" />
          <span className="text-2xs text-muted-foreground">Net Balance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-yellow-400" />
          <span className="text-2xs text-muted-foreground">Event</span>
        </div>
      </div>

      {/* Chart area */}
      <div
        className="relative w-full"
        style={{ height: chartHeight }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Y-axis left (daily cash) — auto-scaled */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-right pr-2 w-14">
          {[1, 0.75, 0.5, 0.25, 0].map((frac) => (
            <span key={frac} className="text-2xs text-tertiary tabular-nums">
              ${Math.round(maxCash * frac).toLocaleString()}
            </span>
          ))}
        </div>

        {/* Y-axis right (balance) — auto-scaled */}
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-between text-left pl-2 w-14">
          {[1, 0.75, 0.5, 0.25, 0].map((frac) => {
            const val = balanceExtent.max - frac * (balanceExtent.max - balanceExtent.min);
            return (
              <span key={frac} className="text-2xs text-tertiary tabular-nums">
                {formatCurrency(val, "USD", true)}
              </span>
            );
          })}
        </div>

        {/* Grid lines */}
        <div className="absolute left-14 right-14 top-0 bottom-0 flex flex-col justify-between pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-b border-border/20" />
          ))}
          <div />
        </div>

        {/* SVG chart with proper viewBox and responsive sizing */}
        <svg
          className="absolute left-14 right-14 top-0 bottom-0 w-[calc(100%-7rem)] h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Cash in area — transparent green fill */}
          <polygon
            points={cashInArea}
            fill="rgba(34,197,94,0.10)"
            stroke="rgba(34,197,94,0.5)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
          {/* Cash out area — transparent red fill */}
          <polygon
            points={cashOutArea}
            fill="rgba(239,68,68,0.08)"
            stroke="rgba(239,68,68,0.4)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
          {/* Net balance line */}
          <polyline
            points={balancePoints}
            fill="none"
            stroke="#60a5fa"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Event marker dots — rendered as HTML divs to avoid SVG viewBox distortion */}
        {data.map((d, i) => {
          if (d.events.length === 0) return null;
          const barWidth = 100 / data.length;
          const xPct = barWidth * i + barWidth / 2;
          const yPct =
            ((balanceExtent.max - d.netBalance) / balanceRange) * 100;
          const isHovered = hoveredIndex === i;
          return (
            <div
              key={`dot-${d.date}`}
              className="absolute pointer-events-none"
              style={{
                left: `calc(3.5rem + (100% - 7rem) * ${xPct / 100})`,
                top: `${yPct}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {isHovered && (
                <div
                  className="absolute rounded-full"
                  style={{
                    width: 12,
                    height: 12,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    backgroundColor: "rgba(250,204,21,0.25)",
                  }}
                />
              )}
              <div
                className="rounded-full"
                style={{
                  width: isHovered ? 7 : 5,
                  height: isHovered ? 7 : 5,
                  backgroundColor: "#facc15",
                  border: isHovered ? "1px solid #000" : "0.5px solid #000",
                  transition: "width 150ms ease, height 150ms ease",
                }}
              />
            </div>
          );
        })}

        {/* Hovered point indicator on balance line (non-event days) */}
        {hoveredIndex !== null && data[hoveredIndex]?.events.length === 0 && (() => {
          const barWidth = 100 / data.length;
          const xPct = barWidth * hoveredIndex + barWidth / 2;
          const yPct =
            ((balanceExtent.max - data[hoveredIndex].netBalance) / balanceRange) * 100;
          return (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `calc(3.5rem + (100% - 7rem) * ${xPct / 100})`,
                top: `${yPct}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: 5,
                  height: 5,
                  backgroundColor: "#60a5fa",
                  border: "0.5px solid #000",
                }}
              />
            </div>
          );
        })()}

        {/* Invisible hit zones for tooltips */}
        <div
          className="absolute left-14 right-14 top-0 bottom-0 flex w-[calc(100%-7rem)]"
        >
          {data.map((d, i) => (
            <div
              key={d.date}
              className="flex-1 relative"
              onMouseEnter={() => setHoveredIndex(i)}
            >
              {hoveredIndex === i && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-md border border-border bg-card px-3 py-2.5 shadow-xl pointer-events-none">
                  <p className="text-2xs font-medium text-foreground mb-1">
                    {formatShortDate(d.date)}
                  </p>
                  <div className="space-y-0.5 text-2xs">
                    <p className="text-muted-foreground">
                      Cash In:{" "}
                      <span className="text-green-400 font-medium">
                        {formatCurrency(d.cashIn)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Cash Out:{" "}
                      <span className="text-red-400 font-medium">
                        {formatCurrency(d.cashOut)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Balance:{" "}
                      <span className="text-blue-400 font-medium">
                        {formatCurrency(d.netBalance)}
                      </span>
                    </p>
                    {d.events.length > 0 && (
                      <div className="border-t border-border/50 pt-1 mt-1">
                        {d.events.map((e, ei) => (
                          <p key={ei} className="text-yellow-400 font-medium">
                            {e.label}: {formatCurrency(e.amount)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex ml-14 mr-14 mt-1.5">
        {data
          .filter((_, i) => i % xLabelStep === 0)
          .map((d) => (
            <span
              key={d.date}
              className="text-2xs text-tertiary tabular-nums"
              style={{ flex: xLabelStep }}
            >
              {formatShortDate(d.date)}
            </span>
          ))}
      </div>
    </div>
  );
}
