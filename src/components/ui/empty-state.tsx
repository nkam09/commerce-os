"use client";

import { cn } from "@/lib/utils/cn";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

/**
 * Empty state placeholder shown when a data component has no data.
 * Provides a clear message and optional CTA.
 */
export function EmptyState({
  icon,
  title = "No data yet",
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {icon ?? (
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        )}
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
