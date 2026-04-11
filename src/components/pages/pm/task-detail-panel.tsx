"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/formatters";
import type { PMTaskData, PMSubtaskData } from "@/lib/services/pm-service";

type TaskDetailPanelProps = {
  task: PMTaskData | null;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Partial<PMTaskData>) => void;
  onDelete: (taskId: string) => void;
};

const STATUS_OPTIONS = ["To Do", "In Progress", "Review", "Done"];

const PRIORITY_OPTIONS: { value: PMTaskData["priority"]; color: string }[] = [
  { value: "Urgent", color: "#ef4444" },
  { value: "High", color: "#f97316" },
  { value: "Medium", color: "#eab308" },
  { value: "Low", color: "#3b82f6" },
];

const TAG_PRESET_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f97316",
  "#8b5cf6", "#06b6d4", "#84cc16", "#ef4444",
];

export function TaskDetailPanel({ task, onClose, onUpdate, onDelete }: TaskDetailPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descValue, setDescValue] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Handle open/close animation
  useEffect(() => {
    if (task) {
      setIsVisible(true);
      setTitleValue(task.title);
      setDescValue(task.description ?? "");
      setEditingTitle(false);
      setConfirmDelete(false);
      setShowTagInput(false);
      setNewSubtask("");
      setNewComment("");
      setNewTag("");
    } else {
      setIsVisible(false);
    }
  }, [task]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  const updateField = useCallback(
    (updates: Partial<PMTaskData>) => {
      if (task) onUpdate(task.id, updates);
    },
    [task, onUpdate]
  );

  const handleTitleBlur = useCallback(() => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== task?.title) {
      updateField({ title: titleValue.trim() });
    }
  }, [titleValue, task, updateField]);

  const handleDescBlur = useCallback(() => {
    if (descValue !== (task?.description ?? "")) {
      updateField({ description: descValue || null });
    }
  }, [descValue, task, updateField]);

  const toggleSubtask = useCallback(
    async (subtaskId: string) => {
      if (!task) return;
      const sub = task.subtasks.find((s) => s.id === subtaskId);
      if (!sub) return;
      const newCompleted = !sub.completed;
      // Optimistic update
      const updated = task.subtasks.map((s) =>
        s.id === subtaskId ? { ...s, completed: newCompleted } : s
      );
      updateField({ subtasks: updated });
      // Persist
      fetch(`/api/pm/subtasks/${subtaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: newCompleted }),
      }).catch(console.error);
    },
    [task, updateField]
  );

  const deleteSubtask = useCallback(
    async (subtaskId: string) => {
      if (!task) return;
      updateField({ subtasks: task.subtasks.filter((s) => s.id !== subtaskId) });
      fetch(`/api/pm/subtasks/${subtaskId}`, { method: "DELETE" }).catch(console.error);
    },
    [task, updateField]
  );

  const addSubtask = useCallback(async () => {
    if (!task || !newSubtask.trim()) return;
    const title = newSubtask.trim();
    setNewSubtask("");
    try {
      const res = await fetch("/api/pm/subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, taskId: task.id }),
      });
      const json = await res.json();
      if (json.ok) {
        const sub: PMSubtaskData = json.data;
        updateField({ subtasks: [...task.subtasks, sub] });
      } else {
        console.error("Failed to create subtask:", json.error);
      }
    } catch (err) {
      console.error("Error creating subtask:", err);
    }
  }, [task, newSubtask, updateField]);

  const addTag = useCallback(() => {
    if (!task || !newTag.trim()) return;
    if (!task.tags.includes(newTag.trim())) {
      updateField({ tags: [...task.tags, newTag.trim()] });
    }
    setNewTag("");
    setShowTagInput(false);
  }, [task, newTag, updateField]);

  const removeTag = useCallback(
    (tag: string) => {
      if (!task) return;
      updateField({ tags: task.tags.filter((t) => t !== tag) });
    },
    [task, updateField]
  );

  const addComment = useCallback(async () => {
    if (!task || !newComment.trim()) return;
    const content = newComment.trim();
    setNewComment("");
    try {
      const res = await fetch("/api/pm/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, taskId: task.id }),
      });
      const json = await res.json();
      if (json.ok) {
        updateField({ comments: [...task.comments, json.data] });
      } else {
        console.error("Failed to create comment:", json.error);
      }
    } catch (err) {
      console.error("Error creating comment:", err);
    }
  }, [task, newComment, updateField]);

  // Auto-resize textarea
  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = "auto";
      descRef.current.style.height = descRef.current.scrollHeight + "px";
    }
  }, [descValue]);

  if (!task && !isVisible) return null;

  const completedCount = task?.subtasks.filter((s) => s.completed).length ?? 0;
  const totalCount = task?.subtasks.length ?? 0;
  const subtaskPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/40 z-40 transition-opacity duration-200",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-full md:w-[500px] bg-card border-l border-border shadow-xl overflow-y-auto z-50 transition-transform duration-200",
          isVisible ? "translate-x-0" : "translate-x-full"
        )}
      >
        {task && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-3 md:px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                {task.aiGenerated && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-500/20 text-purple-400 px-1.5 py-0.5 text-2xs font-medium">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                      <path d="M8 .5a.5.5 0 0 1 .47.33l1.71 4.72 4.72 1.71a.5.5 0 0 1 0 .94l-4.72 1.71-1.71 4.72a.5.5 0 0 1-.94 0L5.82 9.91 1.1 8.2a.5.5 0 0 1 0-.94l4.72-1.71L7.53.83A.5.5 0 0 1 8 .5Z" />
                    </svg>
                    AI Generated
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded p-1.5 hover:bg-elevated text-muted-foreground hover:text-red-400 transition"
                    title="Delete task"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                      <path d="M3 4h10M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1M6 7v5M8 7v5M10 7v5M4 4l.8 9a1 1 0 001 .9h4.4a1 1 0 001-.9L12 4" />
                    </svg>
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-2xs text-red-400">Delete?</span>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded px-2 py-0.5 text-2xs border border-border text-muted-foreground hover:text-foreground transition"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (task) onDelete(task.id);
                        handleClose();
                      }}
                      className="rounded px-2 py-0.5 text-2xs bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                    >
                      Yes
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded p-1.5 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-5">
              {/* Title */}
              {editingTitle ? (
                <input
                  ref={titleRef}
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleTitleBlur()}
                  className="w-full text-lg font-semibold text-foreground bg-transparent outline-none border-b border-primary pb-1"
                  autoFocus
                />
              ) : (
                <h2
                  onClick={() => setEditingTitle(true)}
                  className="text-lg font-semibold text-foreground cursor-text hover:text-primary/80 transition"
                >
                  {task.title}
                </h2>
              )}

              {/* Description */}
              <div>
                <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                  Description
                </label>
                <textarea
                  ref={descRef}
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  onBlur={handleDescBlur}
                  placeholder="Add a description... (Markdown supported)"
                  className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-xs text-foreground outline-none placeholder:text-tertiary focus:ring-1 focus:ring-primary resize-none min-h-[60px]"
                />
              </div>

              {/* Status + Priority row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    Status
                  </label>
                  <select
                    value={task.status}
                    onChange={(e) => updateField({ status: e.target.value })}
                    className="w-full rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    Priority
                  </label>
                  <select
                    value={task.priority}
                    onChange={(e) =>
                      updateField({ priority: e.target.value as PMTaskData["priority"] })
                    }
                    className="w-full rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={task.dueDate ?? ""}
                    onChange={(e) => updateField({ dueDate: e.target.value || null })}
                    className="w-full rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={task.startDate ?? ""}
                    onChange={(e) => updateField({ startDate: e.target.value || null })}
                    className="w-full rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                  Tags
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {task.tags.map((tag) => {
                    const color = TAG_PRESET_COLORS[
                      Math.abs(
                        tag.split("").reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)
                      ) % TAG_PRESET_COLORS.length
                    ];
                    return (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium text-white"
                        style={{ backgroundColor: color, opacity: 0.85 }}
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-white/60 transition"
                        >
                          x
                        </button>
                      </span>
                    );
                  })}
                  {showTagInput ? (
                    <input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onBlur={addTag}
                      onKeyDown={(e) => e.key === "Enter" && addTag()}
                      placeholder="Tag name"
                      className="rounded-md border border-border bg-elevated px-2 py-0.5 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary w-20"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowTagInput(true)}
                      className="rounded-full border border-dashed border-border px-2 py-0.5 text-2xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition"
                    >
                      + Add tag
                    </button>
                  )}
                </div>
              </div>

              {/* Subtasks / Checklist */}
              <div>
                <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                  Subtasks
                </label>
                {totalCount > 0 && (
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${subtaskPct}%` }}
                        />
                      </div>
                      <span className="text-2xs text-muted-foreground tabular-nums">
                        {completedCount} of {totalCount} complete
                      </span>
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  {task.subtasks.map((sub) => (
                    <div key={sub.id} className="group flex items-center gap-2 py-0.5">
                      <input
                        type="checkbox"
                        checked={sub.completed}
                        onChange={() => toggleSubtask(sub.id)}
                        className="h-3.5 w-3.5 rounded border-border flex-shrink-0"
                      />
                      <span
                        className={cn(
                          "text-xs flex-1",
                          sub.completed && "line-through text-muted-foreground"
                        )}
                      >
                        {sub.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteSubtask(sub.id)}
                        className="rounded p-0.5 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <input
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                    placeholder="Add subtask..."
                    className="w-full rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-tertiary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* References */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    ASIN Reference
                  </label>
                  <input
                    type="text"
                    value={task.asinRef ?? ""}
                    onChange={(e) => updateField({ asinRef: e.target.value || null })}
                    placeholder="B0XXXXXXXX"
                    className="w-full rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-tertiary focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    Campaign Reference
                  </label>
                  <input
                    type="text"
                    value={task.campaignRef ?? ""}
                    onChange={(e) => updateField({ campaignRef: e.target.value || null })}
                    placeholder="Campaign ID"
                    className="w-full rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-tertiary focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>
              </div>

              {/* Activity */}
              <div>
                <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                  Activity
                </label>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                    Created {formatDate(task.createdAt, "medium")}
                  </div>
                  {task.completedAt && (
                    <div className="flex items-center gap-2 text-2xs text-green-400">
                      <div className="h-1.5 w-1.5 rounded-full bg-green-400/50" />
                      Completed {formatDate(task.completedAt, "medium")}
                    </div>
                  )}
                  {task.aiGenerated && task.aiSource && (
                    <div className="flex items-center gap-2 text-2xs text-purple-400">
                      <div className="h-1.5 w-1.5 rounded-full bg-purple-400/50" />
                      AI generated from {task.aiSource}
                    </div>
                  )}
                </div>
              </div>

              {/* Comments */}
              <div>
                <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                  Comments ({task.comments.length})
                </label>
                <div className="space-y-3">
                  {task.comments.map((comment) => (
                    <div key={comment.id} className="rounded-md border border-border bg-elevated/50 p-3">
                      <p className="text-xs text-foreground leading-relaxed">
                        {comment.content}
                      </p>
                      <p className="text-2xs text-muted-foreground mt-1">
                        {formatDate(comment.createdAt, "medium")}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addComment()}
                    placeholder="Add a comment..."
                    className="flex-1 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-tertiary focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={addComment}
                    disabled={!newComment.trim()}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition",
                      newComment.trim()
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    Comment
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
