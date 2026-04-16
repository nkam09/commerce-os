"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { useBrandStore } from "@/lib/stores/brand-store";

const DEFAULT_MESSAGE =
  "AI insights will appear here based on your latest performance data.";

export type AIInsightBannerProps = {
  /** Static message — takes priority over dynamic fetch when provided. */
  message?: string;
  /**
   * When set, auto-fetches from /api/dashboard/insight?page=<page>.
   * Supported: "dashboard", "products", "inventory", "cashflow".
   */
  page?: string;
  className?: string;
};

// Module-level cache so the insight persists across tab switches / re-mounts
// within the same browser session. Keyed by "page:brand".
const cachedInsights = new Map<string, string>();

export function AIInsightBanner({
  message,
  page,
  className,
}: AIInsightBannerProps) {
  const brand = useBrandStore((s) => s.selectedBrand);
  const cacheKey = `${page ?? "static"}:${brand}`;
  const [dynamicMessage, setDynamicMessage] = useState<string | null>(
    cachedInsights.get(cacheKey) ?? null
  );
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    // Only auto-fetch when page is set and no explicit message override
    if (!page || message) return;
    // Skip if we already fetched for this exact key
    if (fetchedRef.current === cacheKey && cachedInsights.has(cacheKey)) {
      setDynamicMessage(cachedInsights.get(cacheKey)!);
      return;
    }
    fetchedRef.current = cacheKey;

    (async () => {
      try {
        const brandParam = brand && brand !== "All Brands"
          ? `&brand=${encodeURIComponent(brand)}`
          : "";
        const res = await fetch(`/api/dashboard/insight?page=${page}${brandParam}`);
        const json = await res.json();
        if (res.ok && json.ok && json.data?.message) {
          cachedInsights.set(cacheKey, json.data.message);
          setDynamicMessage(json.data.message);
        }
      } catch {
        // Silently fail — will show default message
      }
    })();
  }, [page, message, brand, cacheKey]);

  // Priority: explicit message prop > fetched dynamic > default
  const displayMessage = message ?? dynamicMessage ?? DEFAULT_MESSAGE;

  return (
    <div
      className={cn(
        "relative rounded-lg border border-ai/20 bg-ai-muted border-l-[3px] border-l-ai px-4 py-3",
        className
      )}
    >
      {/* AI badge in top-right */}
      <div className="absolute top-2.5 right-3 flex items-center gap-1 text-ai">
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5"
        >
          <path d="M8 .5a.5.5 0 0 1 .47.33l1.71 4.72 4.72 1.71a.5.5 0 0 1 0 .94l-4.72 1.71-1.71 4.72a.5.5 0 0 1-.94 0L5.82 9.91 1.1 8.2a.5.5 0 0 1 0-.94l4.72-1.71L7.53.83A.5.5 0 0 1 8 .5Z" />
        </svg>
        <span className="text-2xs font-semibold uppercase tracking-wider">
          AI Insight
        </span>
      </div>

      {/* Content */}
      <p className="text-xs text-foreground leading-relaxed pr-24">
        {displayMessage}
      </p>
    </div>
  );
}
