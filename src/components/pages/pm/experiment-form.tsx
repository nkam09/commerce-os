"use client";

import { useCallback, useState } from "react";
import {
  EXPERIMENT_STATUSES,
  EXPERIMENT_TYPES,
  type ExperimentData,
  type ExperimentSubtaskData,
} from "@/lib/types/experiment";
import { SubtaskList, type SubtaskCreatePayload, type SubtaskData } from "./subtask-list";

type Props = {
  /** If editing, pass the existing experiment; otherwise leave undefined for create. */
  experiment?: ExperimentData;
  spaceId?: string | null;
  knownAsins?: { asin: string; title: string | null }[];
  onClose: () => void;
  onSaved: (exp: ExperimentData) => void;
  onDeleted?: (id: string) => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExperimentForm({
  experiment,
  spaceId,
  knownAsins,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const isEditing = !!experiment;
  const [title, setTitle] = useState(experiment?.title ?? "");
  const [type, setType] = useState(experiment?.type ?? "Coupon");
  const [asin, setAsin] = useState(experiment?.asin ?? "");
  const [startDate, setStartDate] = useState(experiment?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(experiment?.endDate ?? todayIso());
  const [status, setStatus] = useState(experiment?.status ?? "Planned");
  const [description, setDescription] = useState(experiment?.description ?? "");
  const [expectedImpact, setExpectedImpact] = useState(experiment?.expectedImpact ?? "");
  const [actualImpact, setActualImpact] = useState(experiment?.actualImpact ?? "");
  const [notes, setNotes] = useState(experiment?.notes ?? "");
  const [subtasks, setSubtasks] = useState<ExperimentSubtaskData[]>(
    experiment?.subtasks ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEditActual = status === "Completed";

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!startDate || !endDate) {
      setError("Start and end date are required");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date must be on or before end date");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        spaceId: spaceId ?? experiment?.spaceId ?? null,
        asin: asin.trim() || null,
        type,
        title: title.trim(),
        description: description.trim() || null,
        startDate,
        endDate,
        status,
        expectedImpact: expectedImpact.trim() || null,
        actualImpact: actualImpact.trim() || null,
        notes: notes.trim() || null,
      };
      const url = isEditing
        ? `/api/pm/experiments/${experiment.id}`
        : "/api/pm/experiments";
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to save experiment");
        return;
      }
      onSaved(json.data as ExperimentData);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save experiment");
    } finally {
      setSaving(false);
    }
  }, [title, type, asin, startDate, endDate, status, description, expectedImpact, actualImpact, notes, isEditing, experiment, spaceId, onSaved, onClose]);

  // ── Subtask handlers (edit mode only — subtasks need an experimentId) ──
  const handleSubtaskAdd = useCallback(
    async (payload: SubtaskCreatePayload) => {
      if (!experiment) return;
      try {
        const res = await fetch("/api/pm/experiments/subtasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experimentId: experiment.id, ...payload }),
        });
        const json = await res.json();
        if (json.ok) {
          setSubtasks((prev) => [...prev, json.data as ExperimentSubtaskData]);
        }
      } catch (err) {
        console.error("Add experiment subtask failed:", err);
      }
    },
    [experiment]
  );
  const handleSubtaskUpdate = useCallback(
    async (id: string, patch: Partial<SubtaskData>) => {
      setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      fetch(`/api/pm/experiments/subtasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(console.error);
    },
    []
  );
  const handleSubtaskDelete = useCallback(async (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    fetch(`/api/pm/experiments/subtasks/${id}`, { method: "DELETE" }).catch(console.error);
  }, []);
  const handleSubtaskToggle = useCallback(async (id: string) => {
    setSubtasks((prev) => {
      const target = prev.find((s) => s.id === id);
      if (!target) return prev;
      const nextCompleted = !target.completed;
      fetch(`/api/pm/experiments/subtasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextCompleted }),
      }).catch(console.error);
      return prev.map((s) => (s.id === id ? { ...s, completed: nextCompleted } : s));
    });
  }, []);

  const handleDelete = useCallback(async () => {
    if (!isEditing || !experiment) return;
    if (!confirm("Delete this experiment?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pm/experiments/${experiment.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        onDeleted?.(experiment.id);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }, [isEditing, experiment, onDeleted, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[520px] bg-card border-l border-border overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <h2 className="text-sm font-semibold text-foreground">
            {isEditing ? "Edit Experiment" : "New Experiment"}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-elevated text-muted-foreground hover:text-foreground transition" aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" placeholder="e.g. 20% Coupon on 50BC" autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value)} className="input-field">
                {EXPERIMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field">
                {EXPERIMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="ASIN (optional)">
            {knownAsins && knownAsins.length > 0 ? (
              <select value={asin} onChange={(e) => setAsin(e.target.value)} className="input-field">
                <option value="">—</option>
                {knownAsins.map((a) => (
                  <option key={a.asin} value={a.asin}>
                    {a.asin}{a.title ? ` — ${a.title.slice(0, 40)}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input value={asin} onChange={(e) => setAsin(e.target.value.toUpperCase())} className="input-field font-mono" placeholder="B07XYBW774" maxLength={10} />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" />
            </Field>
            <Field label="End Date">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field" />
            </Field>
          </div>

          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-field resize-none" placeholder="What's the hypothesis?" />
          </Field>

          <Field label="Expected Impact">
            <input value={expectedImpact} onChange={(e) => setExpectedImpact(e.target.value)} className="input-field" placeholder="e.g. 10% sales lift, -5% ACOS" />
          </Field>

          <Field label={`Actual Impact${canEditActual ? "" : " (editable after Completed)"}`}>
            <input
              value={actualImpact}
              onChange={(e) => setActualImpact(e.target.value)}
              disabled={!canEditActual}
              className="input-field disabled:opacity-50"
              placeholder={canEditActual ? "Observed outcome" : "Set status to Completed to edit"}
            />
          </Field>

          <div>
            <label className="block text-2xs font-medium text-muted-foreground mb-2">Subtasks</label>
            {isEditing ? (
              <SubtaskList
                subtasks={subtasks}
                onAdd={handleSubtaskAdd}
                onUpdate={handleSubtaskUpdate}
                onDelete={handleSubtaskDelete}
                onToggle={handleSubtaskToggle}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border p-3 text-2xs text-muted-foreground italic">
                Save the experiment first to add subtasks.
              </p>
            )}
          </div>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input-field resize-none" />
          </Field>

          {error && <p className="text-2xs text-red-400">{error}</p>}

          <div className="flex items-center justify-between pt-3 border-t border-border">
            {isEditing ? (
              <button type="button" onClick={handleDelete} disabled={saving} className="text-2xs text-red-400 hover:text-red-300 transition disabled:opacity-50">
                Delete
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving || !title.trim()} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">
                {saving ? "Saving…" : isEditing ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .input-field { width:100%; border-radius:0.375rem; border:1px solid hsl(var(--border)); background:hsl(var(--elevated)); padding:0.375rem 0.625rem; font-size:0.75rem; color:hsl(var(--foreground)); outline:none; }
        .input-field:focus { box-shadow:0 0 0 1px hsl(var(--primary)); }
      `}</style>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-2xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
