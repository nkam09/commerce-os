"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { AIBadge } from "@/components/ui/ai-badge";

type AIInsightCardProps = {
  page: string;
  className?: string;
};

export function AIInsightCard({ page, className }: AIInsightCardProps) {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchInsights() {
      try {
        setLoading(true);
        setError(false);
        const res = await fetch(`/api/ai/insights?page=${encodeURIComponent(page)}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!cancelled && json.ok) {
          setInsights(json.data.insights);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInsights();
    return () => {
      cancelled = true;
    };
  }, [page]);

  // Fail silently
  if (error || dismissed) return null;

  // Skeleton loader
  if (loading) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-card p-4 border-l-2 border-l-purple-500",
          className
        )}
      >
        <div className="space-y-3">
          <div className="h-3 w-3/4 animate-pulse rounded bg-elevated" />
          <div className="h-3 w-full animate-pulse rounded bg-elevated" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-elevated" />
        </div>
      </div>
    );
  }

  if (!insights.length) return null;

  return (
    <div
      className={cn(
        "relative rounded-lg border border-border bg-card p-4 border-l-2 border-l-purple-500",
        className
      )}
    >
      {/* Top-right controls */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        <AIBadge />
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          title={expanded ? "Collapse" : "Expand"}
        >
          <ChevronIcon className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          title="Dismiss"
        >
          <XIcon className="h-3 w-3" />
        </button>
      </div>

      {/* Title */}
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ai">
        AI Insights
      </p>

      {/* Insights list */}
      {expanded && (
        <ul className="space-y-2">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500" />
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Icons ──────────────────────────────────────────── */

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3.22 4.72a.75.75 0 0 1 1.06 0L6 6.44l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0L3.22 5.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3.05 3.05a.5.5 0 0 1 .707 0L6 5.293l2.243-2.243a.5.5 0 0 1 .707.707L6.707 6l2.243 2.243a.5.5 0 0 1-.707.707L6 6.707 3.757 8.95a.5.5 0 0 1-.707-.707L5.293 6 3.05 3.757a.5.5 0 0 1 0-.707Z" />
    </svg>
  );
}
