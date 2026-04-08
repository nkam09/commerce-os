"use client";

import { cn } from "@/lib/utils/cn";

type SkeletonProps = {
  className?: string;
  style?: React.CSSProperties;
};

/** Base skeleton block with pulse animation. */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-skeleton-pulse rounded-md bg-muted",
        className
      )}
      style={style}
    />
  );
}

/** Skeleton shaped like a card. Alias: SkeletonCard */
export function SkeletonMetricCard({ className }: SkeletonProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5", className)}>
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-4 h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

/** Skeleton for a single table row. */
export function SkeletonTableRow({ cols = 6, className }: SkeletonProps & { cols?: number }) {
  return (
    <div className={cn("flex items-center gap-4 border-b border-border px-4 py-3", className)}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === 0 ? "w-40" : "w-20")}
        />
      ))}
    </div>
  );
}

/** Skeleton placeholder for a full data table. */
export function SkeletonTable({ rows = 5, cols = 6, className }: SkeletonProps & { rows?: number; cols?: number }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border bg-elevated/50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-32" : "w-16")} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </div>
  );
}

/** Skeleton for a chart area. */
export function SkeletonChart({ className }: SkeletonProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5", className)}>
      <Skeleton className="mb-4 h-4 w-40" />
      <div className="flex items-end gap-2">
        {[40, 65, 50, 80, 55, 70, 45, 60, 75, 50, 85, 65].map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-sm"
            style={{ height: `${h}%`, minHeight: `${h * 1.5}px` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Grid of skeleton metric cards. */
export function SkeletonMetricGrid({ count = 5, className }: SkeletonProps & { count?: number }) {
  return (
    <div className={cn("grid gap-4", `grid-cols-${Math.min(count, 5)}`, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMetricCard key={i} />
      ))}
    </div>
  );
}

/** Aliases for backward compatibility */
export const SkeletonCard = SkeletonMetricCard;
export const SkeletonLoader = Skeleton;
