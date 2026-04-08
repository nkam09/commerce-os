"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";

export type BreakdownItem = {
  label: string;
  value: string | number;
  /** Sub-items for nested collapsible sections */
  children?: BreakdownItem[];
  /** Semantic color override */
  color?: "success" | "danger" | "warning" | "muted";
};

type ExpandableBreakdownProps = {
  /** Section title */
  title: string;
  /** List of line items */
  items: BreakdownItem[];
  /** Start expanded */
  defaultOpen?: boolean;
  className?: string;
};

const colorMap = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

/**
 * Collapsible tree of sub-metrics — the "More" panel from the spec.
 * Supports nested sections with expand/collapse at every level.
 */
export function ExpandableBreakdown({
  title,
  items,
  defaultOpen = false,
  className,
}: ExpandableBreakdownProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("border-b border-border last:border-b-0", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-elevated/50"
      >
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="animate-fade-in pb-1">
          {items.map((item, i) => (
            <BreakdownRow key={`${item.label}-${i}`} item={item} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ item, depth }: { item: BreakdownItem; depth: number }) {
  const [childOpen, setChildOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const paddingLeft = 16 + depth * 16;

  const toggleChildren = useCallback(() => {
    if (hasChildren) setChildOpen((prev) => !prev);
  }, [hasChildren]);

  return (
    <>
      <div
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={toggleChildren}
        onKeyDown={(e) => {
          if (hasChildren && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            toggleChildren();
          }
        }}
        className={cn(
          "flex items-center justify-between py-1.5 pr-4 text-xs transition",
          hasChildren && "cursor-pointer hover:bg-elevated/30"
        )}
        style={{ paddingLeft }}
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {hasChildren && <ChevronIcon open={childOpen} size="sm" />}
          {item.label}
        </span>
        <span
          className={cn(
            "tabular-nums font-medium",
            item.color ? colorMap[item.color] : "text-foreground"
          )}
        >
          {item.value}
        </span>
      </div>

      {hasChildren && childOpen && (
        <div className="animate-fade-in">
          {item.children!.map((child, i) => (
            <BreakdownRow
              key={`${child.label}-${i}`}
              item={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ChevronIcon({ open, size = "md" }: { open: boolean; size?: "sm" | "md" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn(
        "shrink-0 text-muted-foreground transition-transform",
        size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5",
        open && "rotate-90"
      )}
    >
      <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}
