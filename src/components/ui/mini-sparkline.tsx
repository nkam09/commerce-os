"use client";

import { cn } from "@/lib/utils/cn";

type MiniSparklineProps = {
  /** Array of numeric data points */
  data: number[];
  /** Width in px */
  width?: number;
  /** Height in px */
  height?: number;
  /** Line color — defaults to accent blue */
  color?: string;
  /** Show a filled area under the line */
  filled?: boolean;
  className?: string;
};

/**
 * Tiny inline SVG sparkline for use in metric cards and table cells.
 * No axis labels, no tooltips — just the shape of the trend.
 */
export function MiniSparkline({
  data,
  width = 80,
  height = 24,
  color = "var(--primary)",
  filled = false,
  className,
}: MiniSparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 1;

  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${width - padding},${height} L${padding},${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("inline-block flex-shrink-0", className)}
      aria-hidden="true"
    >
      {filled && (
        <path d={areaPath} fill={color} opacity={0.1} />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={parseFloat(points[points.length - 1].split(",")[0])}
        cy={parseFloat(points[points.length - 1].split(",")[1])}
        r={2}
        fill={color}
      />
    </svg>
  );
}
