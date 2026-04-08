"use client";

import { cn } from "@/lib/utils/cn";
import { MiniSparkline } from "./mini-sparkline";

type MetricCardProps = {
  label: string;
  value: string | number;
  /** Delta text, e.g. "+12.3%" */
  delta?: string;
  /** Direction of the delta for color coding */
  deltaDirection?: "up" | "down" | "neutral";
  /** Sparkline data points for the trend */
  sparklineData?: number[];
  /** Sub-label below the hero value */
  subValue?: string;
  /** Colored top border for period cards */
  accentColor?: string;
  /** Whether this card is the active/selected one */
  active?: boolean;
  /** "More" link at bottom */
  onExpand?: () => void;
  onClick?: () => void;
  className?: string;
};

const deltaStyles = {
  up: "text-success",
  down: "text-danger",
  neutral: "text-muted-foreground",
};

export function MetricCard({
  label,
  value,
  delta,
  deltaDirection = "neutral",
  sparklineData,
  subValue,
  accentColor,
  active,
  onExpand,
  onClick,
  className,
}: MetricCardProps) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative flex flex-col rounded-lg border border-border bg-card p-5 text-left transition-all",
        active && "border-primary ring-1 ring-primary/30",
        onClick && "cursor-pointer hover:border-primary/40 hover:shadow-md",
        className
      )}
      style={accentColor ? { borderTopColor: accentColor, borderTopWidth: "2px" } : undefined}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {value}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {delta && (
            <span className={cn("text-xs font-semibold tabular-nums", deltaStyles[deltaDirection])}>
              {deltaDirection === "up" && "\u2191"}
              {deltaDirection === "down" && "\u2193"}
              {delta}
            </span>
          )}
          {sparklineData && sparklineData.length >= 2 && (
            <MiniSparkline
              data={sparklineData}
              width={64}
              height={20}
              color={
                deltaDirection === "up"
                  ? "var(--success)"
                  : deltaDirection === "down"
                    ? "var(--danger)"
                    : "var(--primary)"
              }
            />
          )}
        </div>
      </div>

      {/* Sub-value */}
      {subValue && (
        <p className="mt-2 text-xs text-muted-foreground">{subValue}</p>
      )}

      {/* "More" expand link */}
      {onExpand && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          className="mt-3 border-t border-border pt-3 text-2xs font-semibold text-primary transition hover:text-primary/80"
        >
          More &darr;
        </button>
      )}
    </Wrapper>
  );
}

type MetricGridProps = {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 5;
  className?: string;
};

export function MetricGrid({ children, cols = 5, className }: MetricGridProps) {
  const colClass = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
    5: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
  }[cols];

  return <div className={cn("grid gap-4", colClass, className)}>{children}</div>;
}
