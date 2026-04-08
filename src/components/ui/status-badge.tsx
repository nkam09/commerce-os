"use client";

import { cn } from "@/lib/utils/cn";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ai"
  | "muted";

type StatusBadgeProps = {
  label: string;
  variant?: BadgeVariant;
  /** Optional leading dot indicator */
  dot?: boolean;
  className?: string;
};

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  danger: "bg-danger-muted text-danger",
  info: "bg-info-muted text-info",
  ai: "bg-ai-muted text-ai",
  muted: "bg-muted text-muted-foreground",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-secondary-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  ai: "bg-ai",
  muted: "bg-muted-foreground",
};

export function StatusBadge({
  label,
  variant = "default",
  dot = false,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant])} />
      )}
      {label}
    </span>
  );
}

/* ─── Domain helpers ────────────────────────────────── */

export function campaignStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    ENABLED: { label: "Active", variant: "success" },
    PAUSED: { label: "Paused", variant: "warning" },
    ARCHIVED: { label: "Archived", variant: "muted" },
  };
  const cfg = map[status] ?? { label: status, variant: "default" };
  return <StatusBadge label={cfg.label} variant={cfg.variant} dot />;
}

export function stockLevelBadge(daysLeft: number) {
  if (daysLeft > 60) return <StatusBadge label={`${daysLeft}d`} variant="success" />;
  if (daysLeft > 30) return <StatusBadge label={`${daysLeft}d`} variant="warning" />;
  return <StatusBadge label={`${daysLeft}d`} variant="danger" />;
}

export function healthBadge(rating: "green" | "yellow" | "red") {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    green: { label: "Healthy", variant: "success" },
    yellow: { label: "At Risk", variant: "warning" },
    red: { label: "Critical", variant: "danger" },
  };
  return <StatusBadge label={map[rating].label} variant={map[rating].variant} dot />;
}
