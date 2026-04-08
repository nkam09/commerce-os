import { cn } from "@/lib/utils/cn";

type MetricCardProps = {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  className?: string;
};

export function MetricCard({
  label,
  value,
  subValue,
  trend,
  trendLabel,
  className,
}: MetricCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">{value}</p>
      {(subValue || trend) && (
        <div className="flex items-center gap-2 mt-1">
          {trend && trendLabel && (
            <span
              className={cn("text-xs font-medium", {
                "text-green-600": trend === "up",
                "text-red-500": trend === "down",
                "text-muted-foreground": trend === "neutral",
              })}
            >
              {trend === "up" ? "↑" : trend === "down" ? "↓" : "–"} {trendLabel}
            </span>
          )}
          {subValue && <span className="text-xs text-muted-foreground">{subValue}</span>}
        </div>
      )}
    </div>
  );
}

type MetricGridProps = {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 5;
  className?: string;
};

export function MetricGrid({ children, cols = 4, className }: MetricGridProps) {
  const colClass = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-1 sm:grid-cols-3 lg:grid-cols-5",
  }[cols];

  return <div className={cn("grid gap-4", colClass, className)}>{children}</div>;
}
