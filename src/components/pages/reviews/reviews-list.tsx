"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KnownAsin } from "./reviews-page";

type Review = {
  id: string;
  asin: string;
  amazonReviewId: string;
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string | null;
  reviewDate: string;
  verifiedPurchase: boolean;
  helpfulVotes: number;
  variant: string | null;
  imageUrls: string[];
  country: string | null;
};

type Stats = {
  totalCount: number;
  filteredCount: number;
  avgRating: number;
  ratingDistribution: Record<string, number>;
};

type Props = {
  knownAsins: KnownAsin[];
  selectedAsin: string | null;
  onSelectAsin: (asin: string) => void;
  refreshKey: number;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ReviewsList({ knownAsins, selectedAsin, onSelectAsin, refreshKey }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [ratingFilter, setRatingFilter] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!selectedAsin) {
      setReviews([]);
      setStats(null);
      return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams({ asin: selectedAsin });
      if (ratingFilter !== "all") p.set("rating", ratingFilter);
      if (verifiedOnly) p.set("verified", "true");
      if (debouncedSearch) p.set("search", debouncedSearch);
      const res = await fetch(`/api/reviews?${p.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setReviews(json.data.reviews);
        setStats(json.data.stats);
      }
    } catch (err) {
      console.error("Failed to load reviews:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedAsin, ratingFilter, verifiedOnly, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const exportCSV = useCallback(() => {
    if (reviews.length === 0) return;
    const headers = [
      "asin",
      "amazonReviewId",
      "rating",
      "title",
      "body",
      "authorName",
      "reviewDate",
      "verifiedPurchase",
      "helpfulVotes",
      "variant",
      "country",
    ];
    const rows = reviews.map((r) => [
      r.asin,
      r.amazonReviewId,
      r.rating,
      r.title ?? "",
      r.body ?? "",
      r.authorName ?? "",
      formatDate(r.reviewDate),
      r.verifiedPurchase ? "true" : "false",
      r.helpfulVotes,
      r.variant ?? "",
      r.country ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reviews-${selectedAsin}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [reviews, selectedAsin]);

  const distributionPct = useMemo(() => {
    if (!stats || stats.totalCount === 0) return null;
    const pct: Record<string, number> = {};
    for (const k of ["1", "2", "3", "4", "5"]) {
      pct[k] = Math.round(((stats.ratingDistribution[k] ?? 0) / stats.totalCount) * 100);
    }
    return pct;
  }, [stats]);

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Browse Reviews
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-2xs text-muted-foreground">Product:</label>
          <select
            value={selectedAsin ?? ""}
            onChange={(e) => onSelectAsin(e.target.value)}
            className="rounded-md border border-border bg-elevated px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
            disabled={knownAsins.length === 0}
          >
            {knownAsins.length === 0 && <option value="">No scraped ASINs yet</option>}
            {knownAsins.map((k) => (
              <option key={k.asin} value={k.asin}>
                {k.asin}
                {k.title ? ` — ${k.title.slice(0, 50)}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedAsin && stats && stats.totalCount > 0 && (
        <div className="px-4 py-3 border-b border-border bg-elevated/30 space-y-2">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span>
              <span className="text-muted-foreground">Total:</span>{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {stats.totalCount.toLocaleString()}
              </span>{" "}
              reviews
            </span>
            <span>
              <span className="text-muted-foreground">Avg:</span>{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {stats.avgRating.toFixed(1)}
              </span>{" "}
              <span className="text-yellow-400">★</span>
            </span>
          </div>
          {distributionPct && (
            <div className="space-y-0.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const pct = distributionPct[String(star)] ?? 0;
                const count = stats.ratingDistribution[String(star)] ?? 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-2xs">
                    <span className="w-8 text-muted-foreground tabular-nums">{star} ★</span>
                    <div className="flex-1 h-2 rounded-full bg-elevated overflow-hidden">
                      <div
                        className="h-full bg-yellow-500/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-muted-foreground tabular-nums">
                      {pct}%
                    </span>
                    <span className="w-12 text-right text-muted-foreground tabular-nums">
                      {count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-2xs text-muted-foreground">Rating:</label>
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value as typeof ratingFilter)}
            className="rounded-md border border-border bg-elevated px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All</option>
            <option value="5">5 ★ only</option>
            <option value="4">4 ★ only</option>
            <option value="3">3 ★ only</option>
            <option value="2">2 ★ only</option>
            <option value="1">1 ★ only</option>
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="rounded"
          />
          Verified only
        </label>

        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search title/body/author…"
          className="flex-1 min-w-[160px] rounded-md border border-border bg-elevated px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
        />

        <button
          type="button"
          onClick={exportCSV}
          disabled={reviews.length === 0}
          className="rounded-md border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {loading && reviews.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !selectedAsin ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Scrape an ASIN to see reviews here.
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {stats && stats.totalCount === 0
              ? "No reviews scraped yet for this ASIN."
              : "No reviews match your filters."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {reviews.map((r) => (
              <ReviewRow key={r.id} review={r} />
            ))}
          </ul>
        )}
        {stats && reviews.length > 0 && reviews.length < stats.totalCount && (
          <div className="py-3 text-center text-2xs text-muted-foreground border-t border-border">
            Showing {reviews.length.toLocaleString()} of {stats.totalCount.toLocaleString()} reviews
            {reviews.length >= 200 && " — narrow filters to see more"}
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewRow({ review: r }: { review: Review }) {
  return (
    <li className="px-4 py-3 space-y-1.5 hover:bg-elevated/20">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-yellow-400 tabular-nums">
          {"★".repeat(r.rating)}
          <span className="text-muted-foreground">{"★".repeat(Math.max(0, 5 - r.rating))}</span>
        </span>
        {r.verifiedPurchase && (
          <span className="rounded-full bg-green-500/15 text-green-400 border border-green-500/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
            Verified
          </span>
        )}
        {r.authorName && <span className="text-foreground">{r.authorName}</span>}
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{formatDate(r.reviewDate)}</span>
        {r.country && r.country !== "United States" && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{r.country}</span>
          </>
        )}
      </div>
      {r.title && (
        <p className="text-sm font-semibold text-foreground leading-snug">{r.title}</p>
      )}
      {r.body && (
        <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{r.body}</p>
      )}
      {r.variant && (
        <p className="text-2xs text-muted-foreground">{r.variant}</p>
      )}
      {r.imageUrls.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {r.imageUrls.slice(0, 6).map((url, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={url}
              alt="Review"
              className="h-16 w-16 rounded object-cover border border-border"
            />
          ))}
        </div>
      )}
      {r.helpfulVotes > 0 && (
        <p className="text-2xs text-muted-foreground">
          👍 {r.helpfulVotes.toLocaleString()} helpful
        </p>
      )}
    </li>
  );
}
