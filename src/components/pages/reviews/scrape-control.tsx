"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { KnownAsin } from "./reviews-page";

type Job = {
  id: string;
  asin: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  totalReviews: number | null;
  scrapedCount: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

type Props = {
  knownAsins: KnownAsin[];
  onJobCompleted: (asin: string) => void;
};

const ASIN_RE = /^[A-Z0-9]{10}$/;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ScrapeControl({ knownAsins, onJobCompleted }: Props) {
  const [asin, setAsin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const reportedCompleted = useRef<Set<string>>(new Set());

  const trimmedAsin = asin.trim().toUpperCase();
  const isValid = ASIN_RE.test(trimmedAsin);
  const anyRunning = jobs.some((j) => j.status === "running" || j.status === "pending");

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews/jobs");
      const json = await res.json();
      if (json.ok) {
        const next: Job[] = json.data;
        // Detect newly-completed jobs and notify parent
        for (const j of next) {
          if (
            (j.status === "completed" || j.status === "failed") &&
            !reportedCompleted.current.has(j.id)
          ) {
            reportedCompleted.current.add(j.id);
            if (j.status === "completed") onJobCompleted(j.asin);
          }
        }
        setJobs(next);
      }
    } catch {
      /* ignore transient errors */
    }
  }, [onJobCompleted]);

  // Initial load + polling while any job is running
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    if (!anyRunning) return;
    const iv = setInterval(refreshJobs, 3000);
    return () => clearInterval(iv);
  }, [anyRunning, refreshJobs]);

  const handleSubmit = useCallback(async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asin: trimmedAsin }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to start scrape");
        return;
      }
      setAsin("");
      await refreshJobs();
    } catch (err) {
      console.error("Scrape error:", err);
      setError("Failed to start scrape");
    } finally {
      setSubmitting(false);
    }
  }, [isValid, submitting, trimmedAsin, refreshJobs]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Scrape Reviews
        </h3>
        <p className="mt-1 text-2xs text-muted-foreground">
          Fetch all reviews for an ASIN via ScraperAPI. Runs in the background.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-[200px]">
          <input
            value={asin}
            onChange={(e) => {
              setAsin(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid && !submitting) handleSubmit();
            }}
            placeholder="Enter ASIN (e.g. B07XYBW774)"
            maxLength={10}
            className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary font-mono tracking-wider"
          />
          {error && <p className="mt-1 text-2xs text-red-400">{error}</p>}
          {!error && asin && !isValid && (
            <p className="mt-1 text-2xs text-muted-foreground">
              ASIN must be 10 uppercase alphanumeric characters
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
        >
          {submitting ? "Starting..." : "Scrape Now"}
        </button>
      </div>

      {knownAsins.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
            Your Products
          </p>
          <div className="flex flex-wrap gap-1.5">
            {knownAsins.map((k) => (
              <button
                key={k.asin}
                type="button"
                onClick={() => setAsin(k.asin)}
                className={cn(
                  "rounded-md border px-2 py-1 text-2xs font-mono transition",
                  trimmedAsin === k.asin
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}
                title={k.title ?? undefined}
              >
                {k.asin}
                {k.title && (
                  <span className="ml-1.5 font-sans text-muted-foreground/70">
                    {k.title.length > 30 ? k.title.slice(0, 28) + "…" : k.title}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
            Recent Jobs
          </p>
          <div className="space-y-1.5">
            {jobs.slice(0, 8).map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function JobRow({ job }: { job: Job }) {
  const running = job.status === "running" || job.status === "pending";
  const failed = job.status === "failed";
  const pctDone =
    job.totalReviews && job.totalReviews > 0
      ? Math.min(100, (job.scrapedCount / job.totalReviews) * 100)
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
      <span className="font-mono text-foreground">{job.asin}</span>
      <span className="text-muted-foreground">—</span>
      {running ? (
        <>
          <span className="text-primary">
            running…
            <span className="ml-1 tabular-nums text-muted-foreground">
              {job.scrapedCount}
              {job.totalReviews ? ` / ${job.totalReviews}` : ""}
            </span>
          </span>
          {pctDone != null && (
            <div className="h-1 flex-1 min-w-[80px] max-w-[120px] rounded-full bg-elevated overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pctDone}%` }}
              />
            </div>
          )}
        </>
      ) : failed ? (
        <>
          <span className="text-red-400" title={job.errorMessage ?? undefined}>
            failed
          </span>
          <span className="truncate text-2xs text-muted-foreground max-w-[260px]">
            {job.errorMessage ?? "unknown error"}
          </span>
        </>
      ) : (
        <span className="text-green-400">
          {job.scrapedCount.toLocaleString()} reviews ✓
        </span>
      )}
      <span className="ml-auto text-2xs text-muted-foreground">{timeAgo(job.startedAt)}</span>
    </div>
  );
}
