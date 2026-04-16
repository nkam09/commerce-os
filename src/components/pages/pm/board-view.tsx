"use client";

import { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import type { PMTaskData } from "@/lib/services/pm-service";

type BoardViewProps = {
  tasks: PMTaskData[];
  statuses: string[];
  onTaskClick: (task: PMTaskData) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
};

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: "bg-red-500/20 text-red-500",
  High: "bg-orange-500/20 text-orange-500",
  Medium: "bg-yellow-500/20 text-yellow-500",
  Low: "bg-blue-500/20 text-blue-500",
};

const TAG_PALETTE = [
  "#6366f1", "#ec4899", "#14b8a6", "#f97316",
  "#8b5cf6", "#06b6d4", "#84cc16", "#ef4444",
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date("2026-03-21");
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function TaskCard({
  task,
  onClick,
}: {
  task: PMTaskData;
  onClick: () => void;
}) {
  const completedSubtasks = task.subtasks.filter((s) => s.completed).length;
  const totalSubtasks = task.subtasks.length;
  const subtaskPct = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;
  const visibleTags = task.tags.slice(0, 3);
  const overflowCount = task.tags.length - 3;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      className="rounded-lg border border-border bg-elevated p-3 cursor-pointer hover:border-primary/50 transition space-y-2"
    >
      {/* Title */}
      <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
        {task.title}
      </p>

      {/* Priority + AI badge */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-medium",
            PRIORITY_COLORS[task.priority] ?? "bg-muted text-muted-foreground"
          )}
        >
          {task.priority}
        </span>
        {task.aiGenerated && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-500/20 text-purple-400 px-1.5 py-0.5 text-2xs font-medium">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
              <path d="M8 .5a.5.5 0 0 1 .47.33l1.71 4.72 4.72 1.71a.5.5 0 0 1 0 .94l-4.72 1.71-1.71 4.72a.5.5 0 0 1-.94 0L5.82 9.91 1.1 8.2a.5.5 0 0 1 0-.94l4.72-1.71L7.53.83A.5.5 0 0 1 8 .5Z" />
            </svg>
            AI
          </span>
        )}
      </div>

      {/* Due date */}
      {task.dueDate && (
        <p
          className={cn(
            "text-2xs",
            isOverdue(task.dueDate) ? "text-red-400" : "text-muted-foreground"
          )}
        >
          {formatShortDate(task.dueDate)}
        </p>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full px-1.5 py-0.5 text-2xs font-medium text-white"
              style={{ backgroundColor: tagColor(tag), opacity: 0.85 }}
            >
              {tag}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="text-2xs text-muted-foreground">+{overflowCount}</span>
          )}
        </div>
      )}

      {/* Subtask progress */}
      {totalSubtasks > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${subtaskPct}%` }}
            />
          </div>
          <span className="text-2xs text-muted-foreground tabular-nums">
            {completedSubtasks}/{totalSubtasks}
          </span>
        </div>
      )}
    </div>
  );
}

export function BoardView({ tasks, statuses, onTaskClick, onStatusChange }: BoardViewProps) {
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const tasksByStatus = useMemo(() => {
    const map: Record<string, PMTaskData[]> = {};
    for (const status of statuses) {
      map[status] = [];
    }
    for (const task of tasks) {
      if (map[task.status]) {
        map[task.status].push(task);
      } else {
        // Task has status not in the statuses list — put in first column
        if (statuses.length > 0) {
          map[statuses[0]].push(task);
        }
      }
    }
    // Sort tasks by order within each column
    for (const status of statuses) {
      map[status].sort((a, b) => a.order - b.order);
    }
    return map;
  }, [tasks, statuses]);

  const handleDrop = useCallback(
    (e: React.DragEvent, status: string) => {
      e.preventDefault();
      setDragOverStatus(null);
      const taskId = e.dataTransfer.getData("text/plain");
      if (taskId) {
        onStatusChange(taskId, status);
      }
    },
    [onStatusChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStatus(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null);
  }, []);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 pr-4 h-full snap-x snap-mandatory md:snap-none">
      {statuses.map((status) => {
        const columnTasks = tasksByStatus[status] ?? [];
        return (
          <div
            key={status}
            className={cn(
              "w-[85vw] max-w-[300px] sm:w-[300px] bg-card/50 rounded-lg p-2 flex flex-col flex-shrink-0 snap-start",
              dragOverStatus === status && "ring-1 ring-primary/50"
            )}
            onDrop={(e) => handleDrop(e, status)}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-2 py-1.5 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">{status}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground tabular-nums">
                  {columnTasks.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-2 overflow-y-auto">
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => onTaskClick(task)}
                />
              ))}
            </div>

            {/* Quick add */}
            <button
              type="button"
              className="flex items-center gap-1.5 w-full px-2 py-2 mt-2 text-xs text-muted-foreground hover:text-foreground hover:bg-elevated/50 rounded-md transition"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Add task
            </button>
          </div>
        );
      })}
    </div>
  );
}
