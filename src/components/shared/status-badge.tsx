import { cn } from "@/lib/utils/cn";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "muted";

type StatusBadgeProps = {
  label: string;
  variant?: BadgeVariant;
  className?: string;
};

const variantClass: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-800",
  muted: "bg-muted text-muted-foreground",
};

export function StatusBadge({ label, variant = "default", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantClass[variant],
        className
      )}
    >
      {label}
    </span>
  );
}

// ─── Domain-specific badge helpers ───────────────────────────────────────────

export function productStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    ACTIVE: { label: "Active", variant: "success" },
    INACTIVE: { label: "Inactive", variant: "muted" },
    ARCHIVED: { label: "Archived", variant: "muted" },
  };
  const cfg = map[status] ?? { label: status, variant: "default" };
  return <StatusBadge label={cfg.label} variant={cfg.variant} />;
}

export function poStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    DRAFT: { label: "Draft", variant: "muted" },
    CONFIRMED: { label: "Confirmed", variant: "info" },
    DEPOSITED: { label: "Deposited", variant: "info" },
    IN_PRODUCTION: { label: "In Production", variant: "warning" },
    SHIPPED: { label: "Shipped", variant: "info" },
    RECEIVED: { label: "Received", variant: "success" },
    CANCELLED: { label: "Cancelled", variant: "danger" },
    ARCHIVED: { label: "Archived", variant: "muted" },
  };
  const cfg = map[status] ?? { label: status, variant: "default" };
  return <StatusBadge label={cfg.label} variant={cfg.variant} />;
}

export function shipmentStageBadge(stage: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    PREPARING: { label: "Preparing", variant: "muted" },
    PICKED_UP: { label: "Picked Up", variant: "info" },
    IN_TRANSIT: { label: "In Transit", variant: "warning" },
    CUSTOMS: { label: "Customs", variant: "warning" },
    ARRIVED: { label: "Arrived", variant: "success" },
    DELIVERED: { label: "Delivered", variant: "success" },
    CANCELLED: { label: "Cancelled", variant: "danger" },
  };
  const cfg = map[stage] ?? { label: stage, variant: "default" };
  return <StatusBadge label={cfg.label} variant={cfg.variant} />;
}

export function projectStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    BACKLOG: { label: "Backlog", variant: "muted" },
    IN_PROGRESS: { label: "In Progress", variant: "info" },
    BLOCKED: { label: "Blocked", variant: "danger" },
    COMPLETE: { label: "Complete", variant: "success" },
    ARCHIVED: { label: "Archived", variant: "muted" },
  };
  const cfg = map[status] ?? { label: status, variant: "default" };
  return <StatusBadge label={cfg.label} variant={cfg.variant} />;
}

export function syncStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    SUCCESS: { label: "Success", variant: "success" },
    FAILED: { label: "Failed", variant: "danger" },
    PARTIAL: { label: "Partial", variant: "warning" },
    RUNNING: { label: "Running", variant: "info" },
    PENDING: { label: "Pending", variant: "muted" },
    ACTIVE: { label: "Active", variant: "success" },
    INACTIVE: { label: "Inactive", variant: "muted" },
    ERROR: { label: "Error", variant: "danger" },
  };
  const cfg = map[status] ?? { label: status, variant: "default" };
  return <StatusBadge label={cfg.label} variant={cfg.variant} />;
}
