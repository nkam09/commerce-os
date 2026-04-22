"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/formatters";
import type { PMTaskData } from "@/lib/services/pm-service";
import type { ExperimentData } from "@/lib/types/experiment";
import { ExperimentStrip } from "./experiment-strip";

type ListViewProps = {
  tasks: PMTaskData[];
  experiments?: ExperimentData[];
  onTaskClick: (task: PMTaskData) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onExperimentClick?: (exp: ExperimentData) => void;
};

type SortKey = "title" | "status" | "priority" | "dueDate" | "createdAt";
type SortDir = "asc" | "desc";
type GroupBy = "none" | "status" | "priority" | "dueDate";

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-zinc-500/20 text-zinc-400",
  "In Progress": "bg-blue-500/20 text-blue-400",
  "Review": "bg-yellow-500/20 text-yellow-400",
  "Done": "bg-green-500/20 text-green-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: "bg-red-500/20 text-red-500",
  High: "bg-orange-500/20 text-orange-500",
  Medium: "bg-yellow-500/20 text-yellow-500",
  Low: "bg-blue-500/20 text-blue-500",
};

const PRIORITY_ORDER: Record<string, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
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

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date("2026-03-21");
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      viewBox="0 0 8 12"
      className={cn(
        "h-3 w-2 ml-0.5 inline-block",
        active ? "text-foreground" : "text-tertiary"
      )}
      fill="currentColor"
    >
      <path d="M4 0L7 4H1L4 0Z" opacity={active && dir === "asc" ? 1 : 0.3} />
      <path d="M4 12L1 8H7L4 12Z" opacity={active && dir === "desc" ? 1 : 0.3} />
    </svg>
  );
}

export function ListView({ tasks, experiments, onTaskClick, onStatusChange, onExperimentClick }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case "title":
          av = a.title.toLowerCase();
          bv = b.title.toLowerCase();
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "priority":
          av = PRIORITY_ORDER[a.priority] ?? 9;
          bv = PRIORITY_ORDER[b.priority] ?? 9;
          break;
        case "dueDate":
          av = a.dueDate ?? "9999";
          bv = b.dueDate ?? "9999";
          break;
        case "createdAt":
          av = a.createdAt;
          bv = b.createdAt;
          break;
        default:
          av = 0;
          bv = 0;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [tasks, sortKey, sortDir]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "", tasks: sortedTasks }];
    const map = new Map<string, PMTaskData[]>();
    for (const task of sortedTasks) {
      let key: string;
      switch (groupBy) {
        case "status":
          key = task.status;
          break;
        case "priority":
          key = task.priority;
          break;
        case "dueDate":
          key = task.dueDate ? (isOverdue(task.dueDate) ? "Overdue" : "Upcoming") : "No date";
          break;
        default:
          key = "";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return Array.from(map.entries()).map(([key, tasks]) => ({ key, tasks }));
  }, [sortedTasks, groupBy]);

  const handleCheckbox = useCallback(
    (task: PMTaskData) => {
      if (task.status === "Done") {
        // Revert to "To Do"
        onStatusChange(task.id, "To Do");
      } else {
        onStatusChange(task.id, "Done");
      }
    },
    [onStatusChange]
  );

  const thClass =
    "px-3 py-2 text-left text-2xs font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition";
  const tdClass = "px-3 py-2 text-xs whitespace-nowrap";

  return (
    <div>
      {experiments && experiments.length > 0 && (
        <ExperimentStrip experiments={experiments} onExperimentClick={onExperimentClick} />
      )}
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-2xs text-muted-foreground">{tasks.length} tasks</span>
        <div className="flex items-center gap-2">
          <label className="text-2xs text-muted-foreground">Group by:</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded-md border border-border bg-elevated px-2 py-1 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="none">None</option>
            <option value="status">Status</option>
            <option value="priority">Priority</option>
            <option value="dueDate">Due Date</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-elevated/50">
              <th className={cn(thClass, "w-10")} />
              <th className={thClass} onClick={() => handleSort("title")}>
                Task
                <SortArrow active={sortKey === "title"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("status")}>
                Status
                <SortArrow active={sortKey === "status"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("priority")}>
                Priority
                <SortArrow active={sortKey === "priority"} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort("dueDate")}>
                Due Date
                <SortArrow active={sortKey === "dueDate"} dir={sortDir} />
              </th>
              <th className={cn(thClass, "cursor-default")}>Tags</th>
              <th className={cn(thClass, "cursor-default")}>Subtasks</th>
              <th className={thClass} onClick={() => handleSort("createdAt")}>
                Created
                <SortArrow active={sortKey === "createdAt"} dir={sortDir} />
              </th>
              <th className={cn(thClass, "cursor-default")}>AI Source</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <GroupRows
                key={group.key || "__all__"}
                groupKey={group.key}
                tasks={group.tasks}
                onTaskClick={onTaskClick}
                onCheckbox={handleCheckbox}
                tdClass={tdClass}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

function GroupRows({
  groupKey,
  tasks,
  onTaskClick,
  onCheckbox,
  tdClass,
}: {
  groupKey: string;
  tasks: PMTaskData[];
  onTaskClick: (task: PMTaskData) => void;
  onCheckbox: (task: PMTaskData) => void;
  tdClass: string;
}) {
  return (
    <>
      {groupKey && (
        <tr className="bg-elevated/30">
          <td colSpan={9} className="px-4 py-2">
            <span className="text-xs font-semibold text-foreground">{groupKey}</span>
            <span className="ml-2 text-2xs text-muted-foreground">({tasks.length})</span>
          </td>
        </tr>
      )}
      {tasks.map((task) => (
        <tr
          key={task.id}
          className="border-t border-border hover:bg-elevated/20 transition"
        >
          {/* Checkbox */}
          <td className={tdClass}>
            <input
              type="checkbox"
              checked={task.status === "Done"}
              onChange={() => onCheckbox(task)}
              className="h-3.5 w-3.5 rounded border-border"
            />
          </td>

          {/* Title */}
          <td className={cn(tdClass, "max-w-[300px]")}>
            <button
              type="button"
              onClick={() => onTaskClick(task)}
              className={cn(
                "text-foreground font-medium hover:text-primary transition truncate text-left",
                task.status === "Done" && "line-through text-muted-foreground"
              )}
            >
              {task.title}
            </button>
          </td>

          {/* Status */}
          <td className={tdClass}>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium",
                STATUS_COLORS[task.status] ?? "bg-muted text-muted-foreground"
              )}
            >
              {task.status}
            </span>
          </td>

          {/* Priority */}
          <td className={tdClass}>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium",
                PRIORITY_COLORS[task.priority] ?? "bg-muted text-muted-foreground"
              )}
            >
              {task.priority}
            </span>
          </td>

          {/* Due date */}
          <td className={tdClass}>
            {task.dueDate ? (
              <span
                className={cn(
                  "tabular-nums",
                  isOverdue(task.dueDate) ? "text-red-400" : "text-muted-foreground"
                )}
              >
                {formatDate(task.dueDate, "short")}
              </span>
            ) : (
              <span className="text-tertiary">--</span>
            )}
          </td>

          {/* Tags */}
          <td className={tdClass}>
            <div className="flex items-center gap-1">
              {task.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-1.5 py-0.5 text-2xs font-medium text-white"
                  style={{ backgroundColor: tagColor(tag), opacity: 0.85 }}
                >
                  {tag}
                </span>
              ))}
              {task.tags.length > 3 && (
                <span className="text-2xs text-muted-foreground">+{task.tags.length - 3}</span>
              )}
            </div>
          </td>

          {/* Subtasks */}
          <td className={tdClass}>
            {task.subtasks.length > 0 ? (
              <div className="flex items-center gap-2">
                <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${(task.subtasks.filter((s) => s.completed).length / task.subtasks.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-2xs text-muted-foreground tabular-nums">
                  {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
                </span>
              </div>
            ) : (
              <span className="text-tertiary">--</span>
            )}
          </td>

          {/* Created */}
          <td className={cn(tdClass, "text-muted-foreground")}>
            {formatDate(task.createdAt, "short")}
          </td>

          {/* AI Source */}
          <td className={tdClass}>
            {task.aiGenerated ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-500/20 text-purple-400 px-1.5 py-0.5 text-2xs font-medium">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                  <path d="M8 .5a.5.5 0 0 1 .47.33l1.71 4.72 4.72 1.71a.5.5 0 0 1 0 .94l-4.72 1.71-1.71 4.72a.5.5 0 0 1-.94 0L5.82 9.91 1.1 8.2a.5.5 0 0 1 0-.94l4.72-1.71L7.53.83A.5.5 0 0 1 8 .5Z" />
                </svg>
                {task.aiSource ?? "AI"}
              </span>
            ) : (
              <span className="text-tertiary">--</span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
