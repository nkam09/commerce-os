"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { useApiData } from "@/hooks/use-api-data";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton-loader";
import { PMSidebar } from "./pm-sidebar";
import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import { CalendarView } from "./calendar-view";
import { TimelineView } from "./timeline-view";
import { TaskDetailPanel } from "./task-detail-panel";
import type {
  PMPageData,
  PMTaskData,
  PMSpaceData,
  PMListData,
} from "@/lib/services/pm-service";

type ViewMode = "board" | "list" | "calendar" | "timeline";

type ProjectManagerPageProps = {
  initialData?: PMPageData;
};

// ─── API helpers ────────────────────────────────────────────────────────────

async function apiPost<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      console.error(`POST ${url} failed:`, json.error ?? res.status);
      return null;
    }
    return json.data as T;
  } catch (err) {
    console.error(`POST ${url} error:`, err);
    return null;
  }
}

async function apiPut<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      console.error(`PUT ${url} failed:`, json.error ?? res.status);
      return null;
    }
    return json.data as T;
  } catch (err) {
    console.error(`PUT ${url} error:`, err);
    return null;
  }
}

async function apiDelete(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      console.error(`DELETE ${url} failed:`, json.error ?? res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`DELETE ${url} error:`, err);
    return false;
  }
}

export function ProjectManagerPage({ initialData }: ProjectManagerPageProps) {
  const { data: apiData, isLoading, refetch } = useApiData<PMPageData>(
    initialData ? null : "/api/pm",
  );

  const data = initialData ?? apiData;

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [selectedTask, setSelectedTask] = useState<PMTaskData | null>(null);
  const [localTasks, setLocalTasks] = useState<PMTaskData[]>([]);
  const [localSpaces, setLocalSpaces] = useState<PMSpaceData[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // Initialize local state from data
  if (data && !initialized) {
    setLocalTasks(data.tasks);
    setLocalSpaces(data.spaces);
    setInitialized(true);
    // Auto-select first list if available
    if (!selectedListId && data.spaces.length > 0 && data.spaces[0].lists.length > 0) {
      setSelectedListId(data.spaces[0].lists[0].id);
    }
  }

  // Find selected list info
  const selectedList = useMemo<PMListData | null>(() => {
    if (!selectedListId) return null;
    for (const space of localSpaces) {
      const list = space.lists.find((l) => l.id === selectedListId);
      if (list) return list;
    }
    return null;
  }, [localSpaces, selectedListId]);

  // Filter tasks for selected list
  const tasksForList = useMemo(() => {
    if (!selectedListId) return [];
    return localTasks.filter((t) => t.listId === selectedListId);
  }, [localTasks, selectedListId]);

  // Get statuses for current list
  const statuses = useMemo(() => {
    return selectedList?.statuses ?? ["To Do", "In Progress", "Review", "Done"];
  }, [selectedList]);

  // Build listId -> name mapping for timeline view
  const listNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const space of localSpaces) {
      for (const list of space.lists) {
        map[list.id] = list.name;
      }
    }
    return map;
  }, [localSpaces]);

  // ── Space / List creation (persisted) ──────────────────────────────────────

  const handleCreateSpace = useCallback(async (name: string) => {
    const result = await apiPost<PMSpaceData>("/api/pm/spaces", { name });
    if (result) {
      setLocalSpaces((prev) => [...prev, result]);
    }
  }, []);

  const handleCreateList = useCallback(async (name: string, spaceId: string) => {
    const result = await apiPost<PMListData>("/api/pm/lists", { name, spaceId });
    if (result) {
      setLocalSpaces((prev) =>
        prev.map((s) =>
          s.id === spaceId ? { ...s, lists: [...s.lists, result] } : s
        )
      );
      setSelectedListId(result.id);
    }
  }, []);

  const handleDeleteSpace = useCallback(async (spaceId: string) => {
    const space = localSpaces.find((s) => s.id === spaceId);
    const ok = await apiDelete(`/api/pm/spaces/${spaceId}`);
    if (ok) {
      // Remove space and its tasks from local state
      const listIds = new Set(space?.lists.map((l) => l.id) ?? []);
      setLocalSpaces((prev) => prev.filter((s) => s.id !== spaceId));
      setLocalTasks((prev) => prev.filter((t) => !listIds.has(t.listId)));
      if (selectedListId && listIds.has(selectedListId)) {
        setSelectedListId(null);
      }
    }
  }, [localSpaces, selectedListId]);

  const handleDeleteList = useCallback(async (listId: string) => {
    const ok = await apiDelete(`/api/pm/lists/${listId}`);
    if (ok) {
      setLocalSpaces((prev) =>
        prev.map((s) => ({
          ...s,
          lists: s.lists.filter((l) => l.id !== listId),
        }))
      );
      setLocalTasks((prev) => prev.filter((t) => t.listId !== listId));
      if (selectedListId === listId) {
        setSelectedListId(null);
      }
    }
  }, [selectedListId]);

  const handleRenameSpace = useCallback(async (spaceId: string, name: string) => {
    // No space rename endpoint — use inline update for now
    setLocalSpaces((prev) =>
      prev.map((s) => (s.id === spaceId ? { ...s, name } : s))
    );
  }, []);

  const handleRenameList = useCallback(async (listId: string, name: string) => {
    const result = await apiPut<PMListData>(`/api/pm/lists/${listId}`, { name });
    if (result) {
      setLocalSpaces((prev) =>
        prev.map((s) => ({
          ...s,
          lists: s.lists.map((l) => (l.id === listId ? { ...l, name: result.name } : l)),
        }))
      );
    }
  }, []);

  // ── Task creation (persisted) ──────────────────────────────────────────────

  const handleCreateTask = useCallback(async (title: string) => {
    if (!selectedListId || !title.trim()) return;
    const result = await apiPost<PMTaskData>("/api/pm/tasks", {
      title: title.trim(),
      listId: selectedListId,
    });
    if (result) {
      setLocalTasks((prev) => [...prev, result]);
      // Update task count in sidebar
      setLocalSpaces((prev) =>
        prev.map((s) => ({
          ...s,
          lists: s.lists.map((l) =>
            l.id === selectedListId ? { ...l, taskCount: l.taskCount + 1 } : l
          ),
        }))
      );
    }
  }, [selectedListId]);

  // ── Task status change (persisted) ─────────────────────────────────────────

  const handleStatusChange = useCallback((taskId: string, newStatus: string) => {
    // Optimistic local update
    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              completedAt: newStatus === "Done" ? new Date().toISOString() : null,
            }
          : t
      )
    );
    setSelectedTask((prev) =>
      prev && prev.id === taskId
        ? { ...prev, status: newStatus, completedAt: newStatus === "Done" ? new Date().toISOString() : null }
        : prev
    );
    // Persist
    apiPut(`/api/pm/tasks/${taskId}`, { status: newStatus });
  }, []);

  // ── Task update (persisted) ────────────────────────────────────────────────

  const handleTaskUpdate = useCallback((taskId: string, updates: Partial<PMTaskData>) => {
    // Optimistic local update
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
    setSelectedTask((prev) =>
      prev && prev.id === taskId ? { ...prev, ...updates } : prev
    );
    // Persist only simple scalar fields to the tasks API
    const persistable: Record<string, unknown> = {};
    const scalarKeys = ["title", "description", "status", "priority", "dueDate", "startDate", "tags", "order", "listId", "asinRef", "campaignRef"] as const;
    for (const key of scalarKeys) {
      if (key in updates) {
        persistable[key] = (updates as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(persistable).length > 0) {
      apiPut(`/api/pm/tasks/${taskId}`, persistable);
    }
  }, []);

  // ── Task deletion (persisted) ──────────────────────────────────────────────

  const handleTaskDelete = useCallback(async (taskId: string) => {
    const ok = await apiDelete(`/api/pm/tasks/${taskId}`);
    if (ok) {
      const deleted = localTasks.find((t) => t.id === taskId);
      setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedTask(null);
      // Update task count
      if (deleted) {
        setLocalSpaces((prev) =>
          prev.map((s) => ({
            ...s,
            lists: s.lists.map((l) =>
              l.id === deleted.listId ? { ...l, taskCount: Math.max(0, l.taskCount - 1) } : l
            ),
          }))
        );
      }
    }
  }, [localTasks]);

  const handleTaskClick = useCallback((task: PMTaskData) => {
    setSelectedTask(task);
  }, []);

  // Loading state
  if (isLoading && !data) {
    return (
      <div className="flex h-full">
        <div className="w-60 border-r border-border bg-card p-3 space-y-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
          <SkeletonTable rows={6} cols={5} />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex h-full relative">
      {/* Sidebar */}
      <PMSidebar
        spaces={localSpaces}
        selectedListId={selectedListId}
        onSelectList={setSelectedListId}
        onCreateSpace={handleCreateSpace}
        onCreateList={handleCreateList}
        onDeleteSpace={handleDeleteSpace}
        onDeleteList={handleDeleteList}
        onRenameSpace={handleRenameSpace}
        onRenameList={handleRenameList}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-foreground">
              {selectedList ? selectedList.name : "Select a list"}
            </h1>
            {selectedList && (
              <span className="text-2xs text-muted-foreground tabular-nums">
                {tasksForList.length} tasks
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View switcher */}
            <div className="flex items-center rounded-md border border-border bg-elevated p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("board")}
                className={cn(
                  "rounded px-2.5 py-1 text-2xs font-medium transition",
                  viewMode === "board"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Board
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded px-2.5 py-1 text-2xs font-medium transition",
                  viewMode === "list"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={cn(
                  "rounded px-2.5 py-1 text-2xs font-medium transition",
                  viewMode === "calendar"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setViewMode("timeline")}
                className={cn(
                  "rounded px-2.5 py-1 text-2xs font-medium transition",
                  viewMode === "timeline"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Timeline
              </button>
            </div>

            {/* Filter button */}
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                <path d="M2 4h12M4 8h8M6 12h4" />
              </svg>
              Filter
            </button>

            {/* Add Task button / inline input */}
            {showNewTaskInput ? (
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newTaskTitle.trim()) {
                    handleCreateTask(newTaskTitle);
                    setNewTaskTitle("");
                    setShowNewTaskInput(false);
                  }
                }}
              >
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onBlur={() => {
                    if (!newTaskTitle.trim()) setShowNewTaskInput(false);
                  }}
                  placeholder="Task title..."
                  autoFocus
                  className="rounded-md border border-border bg-elevated px-2.5 py-1 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary w-48"
                />
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="rounded-md bg-primary px-2.5 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewTaskInput(false); setNewTaskTitle(""); }}
                  className="rounded-md px-2 py-1 text-2xs text-muted-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => selectedListId && setShowNewTaskInput(true)}
                disabled={!selectedListId}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Add Task
              </button>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-4">
          {!selectedListId ? (
            <EmptyPlaceholder
              icon={
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-8 w-8 text-muted-foreground">
                  <rect x="2" y="3" width="12" height="10" rx="1" />
                  <path d="M5 1v4M11 1v4M2 7h12" />
                </svg>
              }
              title="Select a list"
              description="Select a list from the sidebar to view tasks"
            />
          ) : tasksForList.length === 0 ? (
            <EmptyPlaceholder
              icon={
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-8 w-8 text-muted-foreground">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              }
              title="No tasks yet"
              description="No tasks yet -- add one or let AI suggest some"
            />
          ) : viewMode === "board" ? (
            <BoardView
              tasks={tasksForList}
              statuses={statuses}
              onTaskClick={handleTaskClick}
              onStatusChange={handleStatusChange}
            />
          ) : viewMode === "list" ? (
            <ListView
              tasks={tasksForList}
              onTaskClick={handleTaskClick}
              onStatusChange={handleStatusChange}
            />
          ) : viewMode === "calendar" ? (
            <CalendarView
              tasks={tasksForList}
              onTaskClick={handleTaskClick}
              onTaskUpdate={handleTaskUpdate}
            />
          ) : (
            <TimelineView
              tasks={tasksForList}
              listNames={listNames}
              onTaskClick={handleTaskClick}
              onTaskUpdate={handleTaskUpdate}
            />
          )}
        </div>
      </div>

      {/* Task Detail Panel */}
      <TaskDetailPanel
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleTaskUpdate}
        onDelete={handleTaskDelete}
      />
    </div>
  );
}

function EmptyPlaceholder({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
      <div className="mb-3">{icon}</div>
      <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-[280px]">{description}</p>
    </div>
  );
}
