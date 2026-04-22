"use client";

/**
 * Reusable subtask list — used by TaskDetailPanel and ExperimentForm.
 * Handles checkbox toggle, inline title edit, description expand, due date edit, and delete.
 * Consumer supplies callbacks; this component stays stateless re: persistence.
 */
import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { getSubtaskProgress } from "@/lib/types/experiment";

export type SubtaskData = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
};

export type SubtaskCreatePayload = {
  title: string;
  description: string | null;
  dueDate: string | null;
};

type Props = {
  subtasks: SubtaskData[];
  onAdd: (data: SubtaskCreatePayload) => void | Promise<void>;
  onUpdate: (id: string, data: Partial<SubtaskData>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onToggle: (id: string) => void | Promise<void>;
};

function daysFromToday(iso: string): number {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SubtaskList({ subtasks, onAdd, onUpdate, onDelete, onToggle }: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [showAddDetails, setShowAddDetails] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const progress = useMemo(() => getSubtaskProgress(subtasks), [subtasks]);

  const resetAddForm = useCallback(() => {
    setNewTitle("");
    setNewDescription("");
    setNewDueDate("");
    setShowAddDetails(false);
  }, []);

  const handleAdd = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    await onAdd({
      title,
      description: newDescription.trim() || null,
      dueDate: newDueDate || null,
    });
    resetAddForm();
  }, [newTitle, newDescription, newDueDate, onAdd, resetAddForm]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-2">
      {/* Progress summary */}
      {subtasks.length > 0 && (
        <div className="flex items-center gap-2 text-2xs">
          <span className="text-muted-foreground">
            {progress.completed} of {progress.total} complete
          </span>
          {progress.overdue > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-red-400">{progress.overdue} overdue</span>
            </>
          )}
          <div className="ml-auto w-24 h-1 rounded-full bg-elevated overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progress.allComplete ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>
      )}

      {/* Subtask rows */}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {subtasks.length === 0 ? (
          <li className="px-3 py-2 text-2xs text-muted-foreground">No subtasks yet.</li>
        ) : (
          subtasks.map((s) => {
            const isExp = expanded.has(s.id);
            const isEditingT = editingTitle === s.id;
            const isEditingD = editingDate === s.id;
            let dateClass = "text-muted-foreground";
            if (s.dueDate && !s.completed) {
              const days = daysFromToday(s.dueDate);
              if (days < 0) dateClass = "text-red-400";
              else if (days <= 3) dateClass = "text-amber-400";
            }
            return (
              <li key={s.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.completed}
                    onChange={() => onToggle(s.id)}
                    className="rounded shrink-0"
                  />
                  {isEditingT ? (
                    <input
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onBlur={() => {
                        const t = editTitleValue.trim();
                        if (t && t !== s.title) onUpdate(s.id, { title: t });
                        setEditingTitle(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const t = editTitleValue.trim();
                          if (t && t !== s.title) onUpdate(s.id, { title: t });
                          setEditingTitle(null);
                        } else if (e.key === "Escape") {
                          setEditingTitle(null);
                        }
                      }}
                      autoFocus
                      className="flex-1 rounded-md border border-border bg-elevated px-2 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditTitleValue(s.title);
                        setEditingTitle(s.id);
                      }}
                      className={cn(
                        "flex-1 text-left text-xs truncate",
                        s.completed ? "line-through text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {s.title}
                    </button>
                  )}
                  {/* Due date badge */}
                  {isEditingD ? (
                    <input
                      type="date"
                      value={s.dueDate ?? ""}
                      onChange={(e) => {
                        onUpdate(s.id, { dueDate: e.target.value || null });
                      }}
                      onBlur={() => setEditingDate(null)}
                      autoFocus
                      className="rounded-md border border-border bg-elevated px-1.5 py-0.5 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  ) : s.dueDate ? (
                    <button
                      type="button"
                      onClick={() => setEditingDate(s.id)}
                      className={cn("text-2xs tabular-nums px-1.5 py-0.5 rounded-md border border-border hover:bg-elevated transition", dateClass)}
                    >
                      {formatDateShort(s.dueDate)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDate(s.id)}
                      className="text-2xs text-muted-foreground/60 hover:text-foreground transition"
                      title="Add due date"
                    >
                      + date
                    </button>
                  )}
                  {/* Description toggle */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(s.id)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground transition"
                    title={isExp ? "Hide details" : "Show details"}
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className={cn("h-3 w-3 transition-transform", isExp && "rotate-90")}>
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(s.id)}
                    className="rounded p-0.5 text-muted-foreground hover:text-red-400 transition"
                    title="Delete subtask"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
                {isExp && (
                  <div className="mt-2 pl-6">
                    <textarea
                      value={s.description ?? ""}
                      onChange={(e) => onUpdate(s.id, { description: e.target.value || null })}
                      rows={2}
                      placeholder="Add description…"
                      className="w-full rounded-md border border-border bg-elevated px-2 py-1 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>

      {/* Add form */}
      <div className="rounded-lg border border-dashed border-border p-2 space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !showAddDetails && newTitle.trim()) {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="New subtask…"
            className="flex-1 rounded-md border border-border bg-elevated px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowAddDetails((v) => !v)}
            className="rounded-md px-2 py-1 text-2xs text-muted-foreground hover:text-foreground hover:bg-elevated transition"
          >
            {showAddDetails ? "Hide details" : "Add details"}
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newTitle.trim()}
            className="rounded-md bg-primary px-3 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {showAddDetails && (
          <div className="space-y-2 pl-2 border-l-2 border-border/60">
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
              placeholder="Description (optional)…"
              className="w-full rounded-md border border-border bg-elevated px-2 py-1 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-2xs text-muted-foreground">Due:</label>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="rounded-md border border-border bg-elevated px-2 py-0.5 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact "✓ 2/5" chip used on board cards, list rows, and calendar cells.
 * Green when all complete, amber when any overdue, muted otherwise.
 */
export function SubtaskProgressChip({
  subtasks,
  className,
}: {
  subtasks: { completed: boolean; dueDate: string | null }[];
  className?: string;
}) {
  if (!subtasks || subtasks.length === 0) return null;
  const progress = getSubtaskProgress(subtasks);
  const color = progress.allComplete
    ? "bg-green-500/20 text-green-400"
    : progress.hasOverdue
      ? "bg-amber-500/20 text-amber-400"
      : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums",
        color,
        className
      )}
      title={`${progress.completed}/${progress.total} subtasks complete${progress.overdue > 0 ? `, ${progress.overdue} overdue` : ""}`}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
        <path d="M2 8h8M10 4l4 4-4 4" />
      </svg>
      {progress.completed}/{progress.total}
    </span>
  );
}
