"use client";

/**
 * Reports Page
 *
 * Standalone, isolated from the rest of the dashboard. Currently hosts a
 * single card — "PPC Maintenance Report" — which calls /api/reports/ppc-report
 * and downloads the returned .xlsx on success.
 *
 * Intentionally does NOT pull data from the existing dashboard services.
 * New report cards can be added by copying the PPCReportCard component and
 * swapping the endpoint + description.
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return formatDate(d);
}

function defaultToDate(): string {
  return formatDate(new Date());
}

type Status = "idle" | "loading" | "error" | "success";

function PPCReportCard() {
  const [from, setFrom] = useState<string>(defaultFromDate());
  const [to, setTo] = useState<string>(defaultToDate());
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/reports/ppc-report?${params.toString()}`);

      if (!res.ok) {
        // Error response may be JSON from apiError — or plain text.
        const contentType = res.headers.get("content-type") ?? "";
        let msg = `Request failed (${res.status})`;
        if (contentType.includes("application/json")) {
          try {
            const body = (await res.json()) as { error?: string; message?: string };
            msg = body.error ?? body.message ?? msg;
          } catch {
            /* ignore */
          }
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ppc-report-${from}-to-${to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
      setStatus("error");
    }
  }, [from, to]);

  const isLoading = status === "loading";

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          PPC Maintenance Report
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Downloads an 8-tab Excel workbook covering daily trend, campaign
          performance, placements, per-SKU P&amp;L, search terms, keywords,
          competitive data, and a monthly summary. Generation can take
          several minutes while Amazon Ads reports are polled.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={isLoading}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={isLoading}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      >
        {isLoading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            Generating report…
          </>
        ) : (
          <>Generate PPC Report</>
        )}
      </button>

      {status === "error" && error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
      {status === "success" && (
        <p className="mt-3 text-sm text-green-600">
          Report downloaded successfully.
        </p>
      )}
    </div>
  );
}

export function ReportsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 md:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground md:text-2xl">
          Reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate downloadable reports for maintenance, review, and
          offline analysis.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <PPCReportCard />
      </div>
    </div>
  );
}
