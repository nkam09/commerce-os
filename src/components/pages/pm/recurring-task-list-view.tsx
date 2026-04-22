"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { FREQUENCY_LABEL, type RecurringTaskData } from "@/lib/types/recurring-task";
import { RecurringTaskForm } from "./recurring-task-form";
import type { PMSpaceData } from "@/lib/services/pm-service";

type Props = {
  spaces: PMSpaceData[];
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function RecurringTaskListView({ spaces }: Props) {
  const [items, setItems] = useState<RecurringTaskData[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTaskData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pm/recurring-tasks");
      const json = await res.json();
      if (json.ok) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = useCallback(async (rt: RecurringTaskData) => {
    const res = await fetch(`/api/pm/recurring-tasks/${rt.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rt.active }),
    });
    const json = await res.json();
    if (json.ok) {
      setItems((prev) => prev.map((x) => (x.id === rt.id ? json.data : x)));
    }
  }, []);

  const handleSaved = useCallback((rt: RecurringTaskData) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === rt.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = rt;
        return copy;
      }
      return [rt, ...prev];
    });
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Map listId → "Space / List" label
  const listLabels = new Map<string, string>();
  for (const s of spaces) {
    for (const l of s.lists) {
      listLabels.set(l.id, `${s.name} / ${l.name}`);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 pb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Recurring Tasks</h2>
          <span className="text-2xs text-muted-foreground">{items.length}</span>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
        >
          + New
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No recurring tasks yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((rt) => {
            const listLabel = rt.listId ? listLabels.get(rt.listId) : null;
            const freqLabel =
              rt.frequency === "CUSTOM" && rt.intervalDays
                ? `Every ${rt.intervalDays} days`
                : FREQUENCY_LABEL[rt.frequency] ?? rt.frequency;
            return (
              <li
                key={rt.id}
                className={cn(
                  "rounded-lg border p-3 transition",
                  rt.active ? "border-border bg-card hover:border-primary/40" : "border-border bg-elevated/20 opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { setEditing(rt); setFormOpen(true); }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-foreground truncate">{rt.title}</span>
                      {!rt.active && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-muted text-muted-foreground">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-2xs text-muted-foreground flex-wrap">
                      <span>{freqLabel}</span>
                      <span>·</span>
                      <span>Next: <span className="text-foreground tabular-nums">{formatRelative(rt.nextRunDate)}</span></span>
                      {rt.lastRunDate && (
                        <>
                          <span>·</span>
                          <span>Last: <span className="tabular-nums">{formatRelative(rt.lastRunDate)}</span></span>
                        </>
                      )}
                      {listLabel && (
                        <>
                          <span>·</span>
                          <span>→ {listLabel}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActive(rt)}
                    className={cn(
                      "shrink-0 text-2xs rounded-md border px-2 py-1 transition",
                      rt.active
                        ? "border-border text-muted-foreground hover:text-foreground hover:bg-elevated"
                        : "border-primary/50 text-primary hover:bg-primary/10"
                    )}
                  >
                    {rt.active ? "Pause" : "Resume"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <RecurringTaskForm
          template={editing ?? undefined}
          spaces={spaces}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
