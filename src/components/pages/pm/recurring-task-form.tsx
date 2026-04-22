"use client";

import { useCallback, useMemo, useState } from "react";
import { FREQUENCY_LABEL, RECURRING_FREQUENCIES, type RecurringTaskData } from "@/lib/types/recurring-task";
import type { PMSpaceData } from "@/lib/services/pm-service";

type Props = {
  template?: RecurringTaskData;
  spaces: PMSpaceData[];
  onClose: () => void;
  onSaved: (rt: RecurringTaskData) => void;
  onDeleted?: (id: string) => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RecurringTaskForm({ template, spaces, onClose, onSaved, onDeleted }: Props) {
  const isEditing = !!template;
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [listId, setListId] = useState(template?.listId ?? "");
  const [frequency, setFrequency] = useState(template?.frequency ?? "WEEKLY");
  const [intervalDays, setIntervalDays] = useState<number>(template?.intervalDays ?? 7);
  const [startDate, setStartDate] = useState(template?.startDate ?? todayIso());
  const [active, setActive] = useState(template?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flatten all lists for the dropdown
  const allLists = useMemo(() => {
    const out: { id: string; label: string; spaceId: string }[] = [];
    for (const space of spaces) {
      for (const list of space.lists) {
        out.push({ id: list.id, label: `${space.name} / ${list.name}`, spaceId: space.id });
      }
    }
    return out;
  }, [spaces]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const selectedList = allLists.find((l) => l.id === listId);
      const payload = {
        listId: listId || null,
        spaceId: selectedList?.spaceId ?? null,
        title: title.trim(),
        description: description.trim() || null,
        frequency,
        intervalDays: frequency === "CUSTOM" ? intervalDays : null,
        startDate,
        active,
      };
      const url = isEditing ? `/api/pm/recurring-tasks/${template.id}` : "/api/pm/recurring-tasks";
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to save");
        return;
      }
      onSaved(json.data as RecurringTaskData);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [title, description, listId, frequency, intervalDays, startDate, active, isEditing, template, allLists, onSaved, onClose]);

  const handleDelete = useCallback(async () => {
    if (!isEditing || !template) return;
    if (!confirm("Delete this recurring task?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pm/recurring-tasks/${template.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        onDeleted?.(template.id);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }, [isEditing, template, onDeleted, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[480px] bg-card border-l border-border overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <h2 className="text-sm font-semibold text-foreground">
            {isEditing ? "Edit Recurring Task" : "New Recurring Task"}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-elevated text-muted-foreground hover:text-foreground transition" aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" placeholder="e.g. Weekly PPC review" autoFocus />
          </Field>

          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-field resize-none" />
          </Field>

          <Field label="Create tasks in list">
            <select value={listId} onChange={(e) => setListId(e.target.value)} className="input-field">
              <option value="">— (template-only, no task created)</option>
              {allLists.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency">
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="input-field">
                {RECURRING_FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f] ?? f}</option>)}
              </select>
            </Field>
            {frequency === "CUSTOM" && (
              <Field label="Every N days">
                <input type="number" min={1} value={intervalDays} onChange={(e) => setIntervalDays(parseInt(e.target.value) || 1)} className="input-field" />
              </Field>
            )}
          </div>

          <Field label="Start Date">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" />
          </Field>

          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded" />
            Active (pause to stop generating tasks)
          </label>

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
