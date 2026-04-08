import { Prisma } from "@prisma/client";

// ─── Currency ─────────────────────────────────────────────────────────────────

export function formatCurrency(
  value: number | Prisma.Decimal | null | undefined,
  currency = "USD",
  compact = false
): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "number" ? value : parseFloat(value.toString());
  if (isNaN(num)) return "—";

  if (compact && Math.abs(num) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(num);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// ─── Percentage ───────────────────────────────────────────────────────────────

export function formatPercent(
  value: number | Prisma.Decimal | null | undefined,
  decimals = 1
): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "number" ? value : parseFloat(value.toString());
  if (isNaN(num)) return "—";
  return `${(num * 100).toFixed(decimals)}%`;
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

export function formatNumber(
  value: number | null | undefined,
  compact = false
): string {
  if (value === null || value === undefined) return "—";
  if (isNaN(value)) return "—";

  if (compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }

  return new Intl.NumberFormat("en-US").format(value);
}

// ─── Dates ────────────────────────────────────────────────────────────────────

export function formatDate(
  value: Date | string | null | undefined,
  style: "short" | "medium" | "long" = "medium"
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "—";

  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { month: "numeric", day: "numeric", year: "2-digit" }
      : style === "long"
      ? { month: "long", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };

  return new Intl.DateTimeFormat("en-US", options).format(date);
}

export function formatRelativeDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "—";

  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0) return `In ${diffDays}d`;
  return `${Math.abs(diffDays)}d ago`;
}

// ─── Decimal helpers ──────────────────────────────────────────────────────────

export function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return parseFloat(value.toString());
}
