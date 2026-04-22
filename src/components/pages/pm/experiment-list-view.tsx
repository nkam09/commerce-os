"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
  EXPERIMENT_STATUSES,
  EXPERIMENT_TYPE_COLOR,
  type ExperimentData,
} from "@/lib/types/experiment";
import { ExperimentForm } from "./experiment-form";

type Props = {
  spaceId?: string | null;
  knownAsins?: { asin: string; title: string | null }[];
};

const STATUS_BADGE: Record<string, string> = {
  Planned: "bg-slate-500/20 text-slate-400",
  Active: "bg-green-500/20 text-green-400",
  Completed: "bg-blue-500/20 text-blue-400",
  Cancelled: "bg-red-500/20 text-red-400",
};

function formatRange(from: string, to: string): string {
  const a = new Date(from);
  const b = new Date(to);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (sameMonth) return `${a.toLocaleDateString("en-US", opts)} – ${b.getDate()}, ${b.getFullYear()}`;
  return `${a.toLocaleDateString("en-US", opts)} – ${b.toLocaleDateString("en-US", opts)}, ${b.getFullYear()}`;
}

export function ExperimentListView({ spaceId, knownAsins }: Props) {
  const [experiments, setExperiments] = useState<ExperimentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingExperiment, setEditingExperiment] = useState<ExperimentData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (spaceId) p.set("spaceId", spaceId);
      const res = await fetch(`/api/pm/experiments?${p.toString()}`);
      const json = await res.json();
      if (json.ok) setExperiments(json.data);
    } catch (err) {
      console.error("Failed to load experiments:", err);
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return experiments;
    return experiments.filter((e) => e.status === statusFilter);
  }, [experiments, statusFilter]);

  const handleSaved = useCallback((exp: ExperimentData) => {
    setExperiments((prev) => {
      const idx = prev.findIndex((e) => e.id === exp.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = exp;
        return copy;
      }
      return [exp, ...prev];
    });
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setExperiments((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 pb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Experiments</h2>
          <span className="text-2xs text-muted-foreground">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border bg-elevated px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All statuses</option>
            {EXPERIMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            onClick={() => { setEditingExperiment(null); setFormOpen(true); }}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
          >
            + New
          </button>
        </div>
      </div>

      {loading && experiments.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No experiments yet. Click + New to create one.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-border bg-card p-3 hover:border-primary/40 cursor-pointer transition"
              onClick={() => { setEditingExperiment(e); setFormOpen(true); }}
            >
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", EXPERIMENT_TYPE_COLOR[e.type] ?? "bg-gray-500")} />
                  <span className="text-xs font-medium text-foreground truncate">{e.title}</span>
                </div>
                <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide", STATUS_BADGE[e.status] ?? "bg-muted text-muted-foreground")}>
                  {e.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-2xs text-muted-foreground">
                <span>{e.type}</span>
                <span>·</span>
                <span className="tabular-nums">{formatRange(e.startDate, e.endDate)}</span>
                {e.asin && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{e.asin}</span>
                  </>
                )}
              </div>
              {e.expectedImpact && (
                <p className="mt-1.5 text-2xs text-muted-foreground">
                  <span className="text-foreground/70">Expected:</span> {e.expectedImpact}
                </p>
              )}
              {e.actualImpact && e.status === "Completed" && (
                <p className="mt-0.5 text-2xs text-green-400">
                  <span className="text-foreground/70">Actual:</span> {e.actualImpact}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <ExperimentForm
          experiment={editingExperiment ?? undefined}
          spaceId={spaceId}
          knownAsins={knownAsins}
          onClose={() => { setFormOpen(false); setEditingExperiment(null); }}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
