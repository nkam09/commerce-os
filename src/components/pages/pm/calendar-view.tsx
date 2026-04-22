"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import type { PMTaskData } from "@/lib/services/pm-service";
import type { SupplierOrderData } from "@/lib/types/supplier-order";
import { addDays } from "@/lib/types/supplier-order";
import type { ExperimentData } from "@/lib/types/experiment";
import { EXPERIMENT_TYPE_COLOR } from "@/lib/types/experiment";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A projected occurrence of a recurring task template. Read-only on the
 * calendar — not backed by a real PMTask row until the worker fires it.
 */
export type ProjectedTask = {
  /** Deterministic id like `projected-<rtId>-<isoDate>`, used only for React keys. */
  id: string;
  title: string;
  /** ISO string (YYYY-MM-DDTHH:MM:SS.sssZ). */
  dueDate: string;
  /** List the template will create tasks in when it fires. */
  listId: string;
  /** Source recurring-task template id, used for the "edit template" jump. */
  recurringTaskId: string;
};

type CalendarViewProps = {
  tasks: PMTaskData[];
  orders?: SupplierOrderData[];
  experiments?: ExperimentData[];
  projectedTasks?: ProjectedTask[];
  /** Optional context line rendered above the calendar header. */
  headerTitle?: string | null;
  onTaskClick: (task: PMTaskData) => void;
  onTaskUpdate: (taskId: string, updates: Partial<PMTaskData>) => void;
  onOrderClick?: (order: SupplierOrderData) => void;
  onExperimentClick?: (experiment: ExperimentData) => void;
  /** Clicking a projected task jumps to its recurring template. */
  onProjectedTaskClick?: (recurringTaskId: string) => void;
};

type CalendarEvent = {
  id: string;
  label: string;
  dotColor: string;
  type: "order";
  order: SupplierOrderData;
};

type ViewType = "month" | "week";
type ColorBy = "priority" | "space";

type CalendarDay = {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  dateKey: string; // YYYY-MM-DD
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Returns midnight-local today. Computed fresh at each call so the calendar
 *  stays correct if the tab is left open across midnight. */
function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MAX_VISIBLE_TASKS_MONTH = 3;
const MAX_VISIBLE_TASKS_WEEK = 6;

const PRIORITY_DOT: Record<string, string> = {
  Urgent: "bg-red-500",
  High: "bg-orange-500",
  Medium: "bg-yellow-500",
  Low: "bg-blue-500",
};

const PRIORITY_BORDER: Record<string, string> = {
  Urgent: "border-l-red-500",
  High: "border-l-orange-500",
  Medium: "border-l-yellow-500",
  Low: "border-l-blue-500",
};

const SPACE_PALETTE = [
  "#6366f1", "#ec4899", "#14b8a6", "#f97316",
  "#8b5cf6", "#06b6d4", "#84cc16", "#ef4444",
];

function listIdToColor(listId: string): string {
  let hash = 0;
  for (let i = 0; i < listId.length; i++) {
    hash = listId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SPACE_PALETTE[Math.abs(hash) % SPACE_PALETTE.length];
}

// ─── Date Helpers ───────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addMonths(d: Date, n: number): Date {
  const result = new Date(d);
  result.setMonth(result.getMonth() + n);
  return result;
}

function addWeeks(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n * 7);
  return result;
}

function startOfWeek(d: Date): Date {
  const result = new Date(d);
  const day = result.getDay();
  // Sunday-based: day 0 (Sun) -> 0, day 1 (Mon) -> shift back 1, etc.
  result.setDate(result.getDate() - day);
  return result;
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sMonth = start.toLocaleDateString("en-US", { month: "short" });
  const eMonth = end.toLocaleDateString("en-US", { month: "short" });
  if (sMonth === eMonth) {
    return `${sMonth} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${sMonth} ${start.getDate()} – ${eMonth} ${end.getDate()}, ${end.getFullYear()}`;
}

// ─── Build Calendar Grid ────────────────────────────────────────────────────

function buildMonthGrid(year: number, month: number): CalendarDay[] {
  const days: CalendarDay[] = [];
  const firstOfMonth = new Date(year, month, 1);

  // Find the Sunday before or on the first of the month
  const gridStart = startOfWeek(firstOfMonth);

  // Always produce 6 weeks (42 days) so the grid is uniform
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    days.push({
      date,
      isCurrentMonth: date.getMonth() === month && date.getFullYear() === year,
      isToday: isSameDay(date, getToday()),
      dateKey: toDateKey(date),
    });
  }

  return days;
}

function buildWeekGrid(weekStart: Date): CalendarDay[] {
  const days: CalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    days.push({
      date,
      isCurrentMonth: true,
      isToday: isSameDay(date, getToday()),
      dateKey: toDateKey(date),
    });
  }
  return days;
}

// ─── Task Card (mini pill for calendar cells) ───────────────────────────────

function CalendarTaskPill({
  task,
  colorBy,
  onClick,
  onDragStart,
}: {
  task: PMTaskData;
  colorBy: ColorBy;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const dotColor =
    colorBy === "priority"
      ? PRIORITY_DOT[task.priority] ?? "bg-gray-400"
      : undefined;

  const spaceColor =
    colorBy === "space" ? listIdToColor(task.listId) : undefined;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer",
        "border-l-2 bg-elevated hover:bg-card transition-colors",
        "group/pill",
        colorBy === "priority" && PRIORITY_BORDER[task.priority],
      )}
      style={
        colorBy === "space"
          ? { borderLeftColor: spaceColor }
          : undefined
      }
      title={task.title}
    >
      {colorBy === "priority" && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)}
        />
      )}
      {colorBy === "space" && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: spaceColor }}
        />
      )}
      <span className="text-2xs text-foreground truncate leading-tight">
        {task.title}
      </span>
    </div>
  );
}

// ─── Day Detail Popover ─────────────────────────────────────────────────────

function DayDetailPopover({
  date,
  tasks,
  colorBy,
  onTaskClick,
  onClose,
}: {
  date: Date;
  tasks: PMTaskData[];
  colorBy: ColorBy;
  onTaskClick: (task: PMTaskData) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const formatted = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={ref}
        className="w-80 max-h-96 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{formatted}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Task list */}
        <div className="p-3 space-y-2 overflow-y-auto max-h-72">
          {tasks.length === 0 && (
            <p className="text-2xs text-tertiary text-center py-4">
              No tasks on this day
            </p>
          )}
          {tasks.map((task) => {
            const dotColor =
              colorBy === "priority"
                ? PRIORITY_DOT[task.priority] ?? "bg-gray-400"
                : undefined;
            const spaceColor =
              colorBy === "space" ? listIdToColor(task.listId) : undefined;

            return (
              <button
                key={task.id}
                onClick={() => onTaskClick(task)}
                className={cn(
                  "w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-lg",
                  "bg-elevated hover:bg-elevated/80 transition-colors border border-border",
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full mt-1 shrink-0",
                    colorBy === "priority" && dotColor,
                  )}
                  style={
                    colorBy === "space"
                      ? { backgroundColor: spaceColor }
                      : undefined
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {task.title}
                  </p>
                  <p className="text-2xs text-muted-foreground mt-0.5">
                    {task.priority} &middot; {task.status}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Calendar View ─────────────────────────────────────────────────────

export function CalendarView({
  tasks,
  orders,
  experiments,
  projectedTasks,
  headerTitle,
  onTaskClick,
  onTaskUpdate,
  onOrderClick,
  onExperimentClick,
  onProjectedTaskClick,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const today = getToday();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [viewType, setViewType] = useState<ViewType>("month");
  const [colorBy, setColorBy] = useState<ColorBy>("priority");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  // ── Task map: dateKey -> tasks[] ──────────────────────────────────────
  const tasksByDate = useMemo(() => {
    const map = new Map<string, PMTaskData[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const d = new Date(task.dueDate);
      if (isNaN(d.getTime())) continue;
      const key = toDateKey(d);
      const arr = map.get(key) ?? [];
      arr.push(task);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  // ── Order events map: dateKey -> events[] ────────────────────────────
  const orderEventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (!orders) return map;

    const addEvent = (dateStr: string, event: CalendarEvent) => {
      const arr = map.get(dateStr) ?? [];
      arr.push(event);
      map.set(dateStr, arr);
    };

    for (const order of orders) {
      const num = order.orderNumber.length > 12
        ? order.orderNumber.slice(0, 12) + "..."
        : order.orderNumber;

      // Order placed
      addEvent(order.orderDate, {
        id: `${order.id}-placed`,
        label: `Order ${num} placed`,
        dotColor: "bg-blue-500",
        type: "order",
        order,
      });

      // Estimated production end
      if (order.estProductionDays && order.orderDate) {
        addEvent(addDays(order.orderDate, order.estProductionDays), {
          id: `${order.id}-est-prod`,
          label: `Est. production end ${num}`,
          dotColor: "bg-yellow-500",
          type: "order",
          order,
        });
      }

      // Actual production end
      if (order.actProductionEnd) {
        addEvent(order.actProductionEnd, {
          id: `${order.id}-act-prod`,
          label: `Production complete ${num}`,
          dotColor: "bg-green-500",
          type: "order",
          order,
        });
      }

      // Estimated delivery
      if (order.estDeliveryDays && order.orderDate) {
        addEvent(addDays(order.orderDate, order.estDeliveryDays), {
          id: `${order.id}-est-del`,
          label: `Est. delivery ${num}`,
          dotColor: "bg-orange-500",
          type: "order",
          order,
        });
      }

      // Actual delivery
      if (order.actDeliveryDate) {
        addEvent(order.actDeliveryDate, {
          id: `${order.id}-act-del`,
          label: `Delivered ${num}`,
          dotColor: "bg-green-500",
          type: "order",
          order,
        });
      }
    }

    return map;
  }, [orders]);

  // ── Projected recurring occurrences keyed by day ─────────────────────
  const projectedByDate = useMemo(() => {
    const map = new Map<string, ProjectedTask[]>();
    if (!projectedTasks) return map;
    for (const p of projectedTasks) {
      const d = new Date(p.dueDate);
      if (isNaN(d.getTime())) continue;
      const key = toDateKey(d);
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [projectedTasks]);

  // ── Experiments active on each day ───────────────────────────────────
  // Each experiment spans startDate→endDate; we add a reference to each
  // day the experiment covers so we can render a bar in every cell.
  const experimentsByDate = useMemo(() => {
    const map = new Map<string, ExperimentData[]>();
    if (!experiments) return map;
    for (const exp of experiments) {
      if (exp.status === "Cancelled") continue;
      const start = new Date(exp.startDate + "T00:00:00");
      const end = new Date(exp.endDate + "T00:00:00");
      if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = toDateKey(cursor);
        const arr = map.get(key) ?? [];
        arr.push(exp);
        map.set(key, arr);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [experiments]);

  // ── Calendar grid ─────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    if (viewType === "month") {
      return buildMonthGrid(currentDate.getFullYear(), currentDate.getMonth());
    }
    const weekStartDate = startOfWeek(currentDate);
    return buildWeekGrid(weekStartDate);
  }, [currentDate, viewType]);

  // ── Navigation ────────────────────────────────────────────────────────
  const goToday = useCallback(() => {
    const today = getToday();
    setCurrentDate(
      viewType === "month"
        ? new Date(today.getFullYear(), today.getMonth(), 1)
        : startOfWeek(today),
    );
  }, [viewType]);

  const goPrev = useCallback(() => {
    setCurrentDate((prev) =>
      viewType === "month" ? addMonths(prev, -1) : addWeeks(prev, -1),
    );
  }, [viewType]);

  const goNext = useCallback(() => {
    setCurrentDate((prev) =>
      viewType === "month" ? addMonths(prev, 1) : addWeeks(prev, 1),
    );
  }, [viewType]);

  // ── Drag & Drop handlers ──────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent, taskId: string) => {
      e.dataTransfer.setData("text/plain", taskId);
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, dateKey: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverDay(dateKey);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverDay(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dateKey: string) => {
      e.preventDefault();
      setDragOverDay(null);
      const taskId = e.dataTransfer.getData("text/plain");
      if (!taskId) return;
      // Convert dateKey to ISO string for the due date
      onTaskUpdate(taskId, { dueDate: `${dateKey}T00:00:00.000Z` });
    },
    [onTaskUpdate],
  );

  // ── Header label ──────────────────────────────────────────────────────
  const headerLabel = useMemo(() => {
    if (viewType === "month") return formatMonthYear(currentDate);
    return formatWeekRange(startOfWeek(currentDate));
  }, [currentDate, viewType]);

  // ── Expanded day info ─────────────────────────────────────────────────
  const expandedDayInfo = useMemo(() => {
    if (!expandedDay) return null;
    const dayTasks = tasksByDate.get(expandedDay) ?? [];
    const [y, m, d] = expandedDay.split("-").map(Number);
    return { date: new Date(y, m - 1, d), tasks: dayTasks };
  }, [expandedDay, tasksByDate]);

  const maxVisibleTasks =
    viewType === "month" ? MAX_VISIBLE_TASKS_MONTH : MAX_VISIBLE_TASKS_WEEK;

  return (
    <div className="flex flex-col h-full">
      {/* ── Context title — shows what scope the calendar is displaying ─── */}
      {headerTitle && (
        <div className="px-1 pb-2">
          <p className="text-xs text-muted-foreground">{headerTitle}</p>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-1 pb-4 flex-wrap">
        {/* Left: nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
            aria-label="Previous"
          >
            <ChevronLeftIcon />
          </button>
          <h2 className="text-sm font-semibold text-foreground min-w-[160px] text-center">
            {headerLabel}
          </h2>
          <button
            onClick={goNext}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
            aria-label="Next"
          >
            <ChevronRightIcon />
          </button>
          <button
            onClick={goToday}
            className="ml-2 px-3 h-8 text-2xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
          >
            Today
          </button>
        </div>

        {/* Right: toggles */}
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border bg-card overflow-hidden">
            <button
              onClick={() => setViewType("month")}
              className={cn(
                "px-3 h-8 text-2xs font-medium transition-colors",
                viewType === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Month
            </button>
            <button
              onClick={() => setViewType("week")}
              className={cn(
                "px-3 h-8 text-2xs font-medium transition-colors",
                viewType === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Week
            </button>
          </div>

          {/* Color-by toggle */}
          <div className="flex rounded-lg border border-border bg-card overflow-hidden">
            <button
              onClick={() => setColorBy("priority")}
              className={cn(
                "px-3 h-8 text-2xs font-medium transition-colors",
                colorBy === "priority"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Priority
            </button>
            <button
              onClick={() => setColorBy("space")}
              className={cn(
                "px-3 h-8 text-2xs font-medium transition-colors",
                colorBy === "space"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Space
            </button>
          </div>
        </div>
      </div>

      {/* ── Weekday header ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-2xs font-medium text-muted-foreground text-center uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* ── Calendar Grid ───────────────────────────────────────────────── */}
      <div
        className={cn(
          "grid grid-cols-7 flex-1 border-l border-border overflow-y-auto",
        )}
      >
        {calendarDays.map((day) => {
          const dayTasks = tasksByDate.get(day.dateKey) ?? [];
          const dayOrderEvents = orderEventsByDate.get(day.dateKey) ?? [];
          const dayExperiments = experimentsByDate.get(day.dateKey) ?? [];
          const dayProjected = projectedByDate.get(day.dateKey) ?? [];
          const totalItems = dayTasks.length + dayOrderEvents.length + dayExperiments.length + dayProjected.length;
          const visibleTasks = dayTasks.slice(0, maxVisibleTasks);
          const remainingSlots = Math.max(0, maxVisibleTasks - visibleTasks.length);
          const visibleOrderEvents = dayOrderEvents.slice(0, remainingSlots);
          const overflowCount = totalItems - visibleTasks.length - visibleOrderEvents.length;
          const isDragTarget = dragOverDay === day.dateKey;

          return (
            <div
              key={day.dateKey}
              onDragOver={(e) => handleDragOver(e, day.dateKey)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, day.dateKey)}
              onClick={() => setExpandedDay(day.dateKey)}
              className={cn(
                "border-r border-b border-border p-1.5 cursor-pointer transition-colors",
                viewType === "month" ? "min-h-[100px]" : "min-h-[200px]",
                !day.isCurrentMonth && "opacity-40",
                day.isToday && "border-l-2 border-l-primary bg-primary/[0.03]",
                isDragTarget && "bg-primary/10",
              )}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-2xs font-medium leading-none",
                    day.isToday
                      ? "w-5 h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : day.isCurrentMonth
                        ? "text-foreground"
                        : "text-tertiary",
                  )}
                >
                  {day.date.getDate()}
                </span>
                {totalItems > 0 && (
                  <span className="text-2xs text-tertiary">
                    {totalItems}
                  </span>
                )}
              </div>

              {/* Experiment bars — spans startDate..endDate across cells.
                  Up to 3 shown; remainder falls into +N more popover. */}
              {dayExperiments.length > 0 && (
                <div className="space-y-0.5 mb-1">
                  {dayExperiments.slice(0, 3).map((exp) => {
                    const isStart = exp.startDate === day.dateKey;
                    const isEnd = exp.endDate === day.dateKey;
                    return (
                      <div
                        key={exp.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onExperimentClick?.(exp);
                        }}
                        title={`${exp.type}: ${exp.title}`}
                        className={cn(
                          "h-3 flex items-center px-1 cursor-pointer hover:opacity-80 transition-opacity",
                          EXPERIMENT_TYPE_COLOR[exp.type] ?? "bg-gray-500",
                          isStart && "rounded-l-sm",
                          isEnd && "rounded-r-sm",
                          !isStart && "-ml-1.5",
                          !isEnd && "-mr-1.5"
                        )}
                      >
                        {isStart && (
                          <span className="text-[9px] font-medium text-white truncate leading-none">
                            {exp.title}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {dayExperiments.length > 3 && (
                    <div className="text-[9px] text-muted-foreground px-1">
                      +{dayExperiments.length - 3} more exp.
                    </div>
                  )}
                </div>
              )}

              {/* Task pills */}
              <div className="space-y-0.5">
                {visibleTasks.map((task) => (
                  <CalendarTaskPill
                    key={task.id}
                    task={task}
                    colorBy={colorBy}
                    onClick={() => onTaskClick(task)}
                    onDragStart={(e) => handleDragStart(e, task.id)}
                  />
                ))}
                {visibleOrderEvents.map((evt) => (
                  <div
                    key={evt.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOrderClick?.(evt.order);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer border-l-2 border-l-transparent bg-elevated/60 hover:bg-card transition-colors"
                    title={evt.label}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-sm shrink-0", evt.dotColor)} />
                    <span className="text-2xs text-muted-foreground truncate leading-tight">
                      {evt.label}
                    </span>
                  </div>
                ))}
                {/* Projected recurring occurrences — read-only, distinct styling */}
                {dayProjected.slice(0, 2).map((p) => (
                  <div
                    key={p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onProjectedTaskClick?.(p.recurringTaskId);
                    }}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-md cursor-pointer border border-dashed border-border/60 bg-transparent opacity-60 hover:opacity-100 hover:border-primary/50 transition"
                    title={`Recurring (projected): ${p.title}`}
                  >
                    <RepeatIcon />
                    <span className="text-2xs italic text-muted-foreground truncate leading-tight">
                      {p.title}
                    </span>
                  </div>
                ))}
                {dayProjected.length > 2 && (
                  <div className="text-2xs italic text-muted-foreground px-2 opacity-60">
                    +{dayProjected.length - 2} recurring
                  </div>
                )}
                {overflowCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedDay(day.dateKey);
                    }}
                    className="text-2xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5"
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Day Detail Popover ──────────────────────────────────────────── */}
      {expandedDayInfo && (
        <DayDetailPopover
          date={expandedDayInfo.date}
          tasks={expandedDayInfo.tasks}
          colorBy={colorBy}
          onTaskClick={(task) => {
            setExpandedDay(null);
            onTaskClick(task);
          }}
          onClose={() => setExpandedDay(null)}
        />
      )}
    </div>
  );
}

// ─── Inline SVG Icons ───────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-muted-foreground"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
