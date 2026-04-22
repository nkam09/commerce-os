"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { PMTaskData } from "@/lib/services/pm-service";
import type { SupplierOrderData, SupplierOrderItem } from "@/lib/types/supplier-order";
import { addDays as addDaysStr } from "@/lib/types/supplier-order";
import type { ExperimentData } from "@/lib/types/experiment";
import { ExperimentStrip } from "./experiment-strip";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/formatters";

// ─── Types ───────────────────────────────────────────────────────────────────

type TimelineViewProps = {
  tasks: PMTaskData[];
  orders?: SupplierOrderData[];
  experiments?: ExperimentData[];
  listNames: Record<string, string>;
  onTaskClick: (task: PMTaskData) => void;
  onTaskUpdate: (taskId: string, updates: Partial<PMTaskData>) => void;
  onOrderClick?: (order: SupplierOrderData) => void;
  onExperimentClick?: (exp: ExperimentData) => void;
};

type DragState = {
  taskId: string;
  edge: "left" | "right";
  startX: number;
  originalDate: string;
} | null;

type TooltipPos = { x: number; y: number };

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_WIDTH = 40;
const BAR_HEIGHT = 24;
const ROW_HEIGHT = 32; // bar + gap
const SIDEBAR_WIDTH = 200;
const GROUP_HEADER_HEIGHT = 36;

const RANGE_START = new Date(2026, 2, 1); // March 1, 2026
const RANGE_END = new Date(2026, 3, 30); // April 30, 2026
const TODAY = new Date(2026, 2, 21); // March 21, 2026

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: "#ef4444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#3b82f6",
};

const STATUS_COLORS: Record<string, string> = {
  "To Do": "#71717a",
  "In Progress": "#3b82f6",
  Review: "#eab308",
  Done: "#22c55e",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function generateDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function clampDate(d: Date, min: Date, max: Date): Date {
  if (d < min) return min;
  if (d > max) return max;
  return d;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TimelineView({
  tasks,
  orders,
  experiments,
  listNames,
  onTaskClick,
  onTaskUpdate,
  onOrderClick,
  onExperimentClick,
}: TimelineViewProps) {
  // ── State ────────────────────────────────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ x: 0, y: 0 });
  const [colorBy, setColorBy] = useState<"priority" | "status">("priority");
  const [dragState, setDragState] = useState<DragState>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const timelineRef = useRef<HTMLDivElement>(null);
  const sidebarBodyRef = useRef<HTMLDivElement>(null);

  // ── Date range (extend to accommodate orders) ────────────────────────────

  const { rangeStart, rangeEnd } = useMemo(() => {
    let start = new Date(RANGE_START);
    let end = new Date(RANGE_END);
    if (orders) {
      for (const o of orders) {
        const oDate = parseDate(o.orderDate);
        if (oDate < start) start = new Date(oDate.getFullYear(), oDate.getMonth(), 1);
        // Extend end to cover delivery
        const delDate = o.actDeliveryDate
          ? parseDate(o.actDeliveryDate)
          : o.estDeliveryDays
            ? parseDate(addDaysStr(o.orderDate, o.estDeliveryDays))
            : null;
        if (delDate && delDate > end) {
          end = new Date(delDate.getFullYear(), delDate.getMonth() + 1, 0); // end of that month
        }
      }
    }
    return { rangeStart: start, rangeEnd: end };
  }, [orders]);

  const days = useMemo(() => generateDays(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const totalWidth = days.length * DAY_WIDTH;
  const todayOffset = daysBetween(rangeStart, TODAY) * DAY_WIDTH;

  // ── Grouping ─────────────────────────────────────────────────────────────

  const { datedGroups, undatedTasks } = useMemo(() => {
    const dated: PMTaskData[] = [];
    const undated: PMTaskData[] = [];

    for (const t of tasks) {
      if (t.dueDate || t.startDate) {
        dated.push(t);
      } else {
        undated.push(t);
      }
    }

    const grouped: Record<string, PMTaskData[]> = {};
    for (const t of dated) {
      if (!grouped[t.listId]) grouped[t.listId] = [];
      grouped[t.listId].push(t);
    }

    // Sort tasks within each group by start/due date
    for (const listId of Object.keys(grouped)) {
      grouped[listId].sort((a, b) => {
        const aDate = a.startDate || a.dueDate || "";
        const bDate = b.startDate || b.dueDate || "";
        return aDate.localeCompare(bDate);
      });
    }

    return { datedGroups: grouped, undatedTasks: undated };
  }, [tasks]);

  const groupOrder = useMemo(
    () =>
      Object.keys(datedGroups).sort((a, b) =>
        (listNames[a] || a).localeCompare(listNames[b] || b)
      ),
    [datedGroups, listNames]
  );

  // ── Build visible rows ───────────────────────────────────────────────────

  type Row =
    | { type: "group-header"; listId: string; label: string }
    | { type: "task"; task: PMTaskData }
    | { type: "no-date-header" }
    | { type: "undated-task"; task: PMTaskData }
    | { type: "order-header" }
    | { type: "order"; order: SupplierOrderData };

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];

    for (const listId of groupOrder) {
      const label = listNames[listId] || listId;
      result.push({ type: "group-header", listId, label });
      if (!collapsedGroups.has(listId)) {
        for (const task of datedGroups[listId]) {
          result.push({ type: "task", task });
        }
      }
    }

    if (undatedTasks.length > 0) {
      result.push({ type: "no-date-header" });
      for (const task of undatedTasks) {
        result.push({ type: "undated-task", task });
      }
    }

    // Add order rows
    if (orders && orders.length > 0) {
      result.push({ type: "order-header" });
      for (const order of orders) {
        result.push({ type: "order", order });
      }
    }

    return result;
  }, [groupOrder, listNames, datedGroups, collapsedGroups, undatedTasks, orders]);

  // ── Scroll sync ──────────────────────────────────────────────────────────

  const handleTimelineScroll = useCallback(() => {
    if (timelineRef.current && sidebarBodyRef.current) {
      sidebarBodyRef.current.scrollTop = timelineRef.current.scrollTop;
    }
  }, []);

  const handleSidebarScroll = useCallback(() => {
    if (sidebarBodyRef.current && timelineRef.current) {
      timelineRef.current.scrollTop = sidebarBodyRef.current.scrollTop;
    }
  }, []);

  // ── Toggle group ─────────────────────────────────────────────────────────

  const toggleGroup = useCallback((listId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  }, []);

  // ── Bar color ────────────────────────────────────────────────────────────

  const getBarColor = useCallback(
    (task: PMTaskData): string => {
      if (colorBy === "status") {
        return STATUS_COLORS[task.status] || "#71717a";
      }
      return PRIORITY_COLORS[task.priority] || "#3b82f6";
    },
    [colorBy]
  );

  // ── Bar geometry ─────────────────────────────────────────────────────────

  const getBarStyle = useCallback(
    (task: PMTaskData) => {
      const hasDrag = dragState && dragState.taskId === task.id;

      if (!task.startDate && task.dueDate) {
        // Single-day marker
        const due = parseDate(task.dueDate);
        let offset = daysBetween(rangeStart, due) * DAY_WIDTH;
        if (hasDrag && dragState.edge === "right") {
          offset += dragOffset;
        }
        return { left: offset + DAY_WIDTH / 2 - 12, width: 24, isSingle: true };
      }

      if (task.startDate && task.dueDate) {
        const start = parseDate(task.startDate);
        const end = parseDate(task.dueDate);

        let leftPx = daysBetween(rangeStart, start) * DAY_WIDTH;
        let rightPx = (daysBetween(rangeStart, end) + 1) * DAY_WIDTH;

        if (hasDrag) {
          if (dragState.edge === "left") {
            leftPx += dragOffset;
          } else {
            rightPx += dragOffset;
          }
        }

        const width = Math.max(rightPx - leftPx, DAY_WIDTH);
        return { left: leftPx, width, isSingle: false };
      }

      // startDate but no dueDate — use startDate as single marker
      if (task.startDate) {
        const start = parseDate(task.startDate);
        let offset = daysBetween(rangeStart, start) * DAY_WIDTH;
        if (hasDrag && dragState.edge === "left") {
          offset += dragOffset;
        }
        return { left: offset + DAY_WIDTH / 2 - 12, width: 24, isSingle: true };
      }

      return null;
    },
    [dragState, dragOffset, rangeStart]
  );

  // ── Drag handling ────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (
      e: ReactMouseEvent,
      taskId: string,
      edge: "left" | "right",
      originalDate: string
    ) => {
      e.stopPropagation();
      e.preventDefault();
      setDragState({ taskId, edge, startX: e.clientX, originalDate });
      setDragOffset(0);
    },
    []
  );

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      setDragOffset(dx);
    };

    const handleMouseUp = (e: globalThis.MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      const daysDelta = Math.round(dx / DAY_WIDTH);

      if (daysDelta !== 0) {
        const original = parseDate(dragState.originalDate);
        const newDate = new Date(original);
        newDate.setDate(newDate.getDate() + daysDelta);
        const clamped = clampDate(newDate, rangeStart, rangeEnd);
        const dateStr = toDateString(clamped);

        if (dragState.edge === "left") {
          onTaskUpdate(dragState.taskId, { startDate: dateStr });
        } else {
          onTaskUpdate(dragState.taskId, { dueDate: dateStr });
        }
      }

      setDragState(null);
      setDragOffset(0);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, onTaskUpdate, rangeStart, rangeEnd]);

  // ── Tooltip tracking ─────────────────────────────────────────────────────

  const handleBarMouseMove = useCallback(
    (e: ReactMouseEvent, taskId: string) => {
      setHoveredTask(taskId);
      setTooltipPos({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleBarMouseLeave = useCallback(() => {
    setHoveredTask(null);
  }, []);

  // ── Find hovered task data ───────────────────────────────────────────────

  const hoveredTaskData = useMemo(
    () => (hoveredTask && !hoveredTask.startsWith("order-") ? tasks.find((t) => t.id === hoveredTask) : null),
    [hoveredTask, tasks]
  );

  const hoveredOrderData = useMemo(
    () => {
      if (!hoveredTask || !hoveredTask.startsWith("order-") || !orders) return null;
      const orderId = hoveredTask.replace("order-", "");
      return orders.find((o) => o.id === orderId) || null;
    },
    [hoveredTask, orders]
  );

  // ── Compute total content height ─────────────────────────────────────────

  const totalHeight = useMemo(() => {
    let h = 0;
    for (const row of rows) {
      h +=
        row.type === "group-header" || row.type === "no-date-header" || row.type === "order-header"
          ? GROUP_HEADER_HEIGHT
          : ROW_HEIGHT;
    }
    return h;
  }, [rows]);

  // ── Empty state ──────────────────────────────────────────────────────────

  if (tasks.length === 0 && (!orders || orders.length === 0)) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No tasks to display on the timeline.
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {experiments && experiments.length > 0 && (
        <div className="px-4 pt-3">
          <ExperimentStrip experiments={experiments} onExperimentClick={onExperimentClick} />
        </div>
      )}
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="text-sm font-semibold text-foreground">Timeline</h3>
        <div className="flex items-center gap-2">
          <span className="text-2xs text-muted-foreground">Color by:</span>
          <button
            onClick={() => setColorBy("priority")}
            className={cn(
              "rounded px-2 py-0.5 text-2xs font-medium transition-colors",
              colorBy === "priority"
                ? "bg-primary text-white"
                : "bg-elevated text-muted-foreground hover:text-foreground"
            )}
          >
            Priority
          </button>
          <button
            onClick={() => setColorBy("status")}
            className={cn(
              "rounded px-2 py-0.5 text-2xs font-medium transition-colors",
              colorBy === "status"
                ? "bg-primary text-white"
                : "bg-elevated text-muted-foreground hover:text-foreground"
            )}
          >
            Status
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className="flex flex-col border-r border-border"
          style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }}
        >
          {/* Sidebar date header spacer */}
          <div
            className="shrink-0 border-b border-border"
            style={{ height: ROW_HEIGHT }}
          />
          {/* Sidebar body */}
          <div
            ref={sidebarBodyRef}
            onScroll={handleSidebarScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden"
            style={{ scrollbarWidth: "none" }}
          >
            <div style={{ height: totalHeight }}>
              {rows.map((row) => {
                if (row.type === "group-header") {
                  return (
                    <div
                      key={`gh-${row.listId}`}
                      className="flex cursor-pointer items-center gap-1.5 border-b border-border/50 px-3 text-2xs font-semibold text-foreground hover:bg-elevated"
                      style={{ height: GROUP_HEADER_HEIGHT }}
                      onClick={() => toggleGroup(row.listId)}
                    >
                      <svg
                        className={cn(
                          "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                          collapsedGroups.has(row.listId) ? "" : "rotate-90"
                        )}
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <path d="M6 4l4 4-4 4z" />
                      </svg>
                      <span className="truncate">{row.label}</span>
                    </div>
                  );
                }

                if (row.type === "no-date-header") {
                  return (
                    <div
                      key="no-date"
                      className="flex items-center border-b border-border/50 border-t border-t-border px-3 text-2xs font-semibold text-tertiary"
                      style={{ height: GROUP_HEADER_HEIGHT }}
                    >
                      No date
                    </div>
                  );
                }

                if (row.type === "order-header") {
                  return (
                    <div
                      key="order-header"
                      className="flex items-center border-b border-border/50 border-t border-t-border px-3 text-2xs font-semibold text-amber-400"
                      style={{ height: GROUP_HEADER_HEIGHT }}
                    >
                      Supplier Orders
                    </div>
                  );
                }

                if (row.type === "order") {
                  const order = row.order;
                  const totalUnits = order.lineItems.reduce((s: number, it: SupplierOrderItem) => s + it.quantity, 0);
                  return (
                    <div
                      key={`order-${order.id}`}
                      className="flex cursor-pointer items-center px-3 text-2xs text-muted-foreground hover:text-foreground hover:bg-elevated/50"
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => onOrderClick?.(order)}
                    >
                      <span className="truncate">
                        Order {order.orderNumber.slice(0, 8)}… — {totalUnits.toLocaleString()} units
                      </span>
                    </div>
                  );
                }

                const task = (row as { type: "task" | "undated-task"; task: PMTaskData }).task;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex cursor-pointer items-center px-3 text-2xs text-muted-foreground hover:text-foreground hover:bg-elevated/50",
                      hoveredTask === task.id && "bg-elevated/50 text-foreground"
                    )}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => onTaskClick(task)}
                  >
                    <span className="truncate">{task.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Timeline area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Date header */}
          <div
            className="shrink-0 overflow-x-auto border-b border-border"
            style={{ height: ROW_HEIGHT, scrollbarWidth: "none" }}
          >
            <div className="relative" style={{ width: totalWidth, height: ROW_HEIGHT }}>
              {days.map((day, i) => {
                const isFirst = day.getDate() === 1;
                const isToday =
                  day.getDate() === TODAY.getDate() &&
                  day.getMonth() === TODAY.getMonth() &&
                  day.getFullYear() === TODAY.getFullYear();
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div
                    key={i}
                    className={cn(
                      "absolute top-0 flex flex-col items-center justify-center border-r border-border/30 text-2xs",
                      isToday
                        ? "bg-red-500/10 font-bold text-red-400"
                        : isWeekend
                        ? "text-tertiary"
                        : "text-muted-foreground"
                    )}
                    style={{
                      left: i * DAY_WIDTH,
                      width: DAY_WIDTH,
                      height: ROW_HEIGHT,
                    }}
                  >
                    {isFirst && (
                      <span className="text-[9px] leading-none">
                        {day.toLocaleString("en-US", { month: "short" })}
                      </span>
                    )}
                    <span className="leading-none">{day.getDate()}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline body */}
          <div
            ref={timelineRef}
            onScroll={handleTimelineScroll}
            className="flex-1 overflow-auto"
          >
            <div
              className="relative"
              style={{ width: totalWidth, height: totalHeight }}
            >
              {/* Weekend shading */}
              {days.map((day, i) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                if (!isWeekend) return null;
                return (
                  <div
                    key={`wk-${i}`}
                    className="absolute top-0 bg-foreground/[0.02]"
                    style={{
                      left: i * DAY_WIDTH,
                      width: DAY_WIDTH,
                      height: totalHeight,
                    }}
                  />
                );
              })}

              {/* Today line */}
              <div
                className="absolute top-0 z-20 border-l border-dashed border-red-500"
                style={{
                  left: todayOffset + DAY_WIDTH / 2,
                  height: totalHeight,
                }}
              />

              {/* Rows */}
              {(() => {
                let yOffset = 0;
                return rows.map((row, i) => {
                  const currentY = yOffset;

                  if (
                    row.type === "group-header" ||
                    row.type === "no-date-header" ||
                    row.type === "order-header"
                  ) {
                    yOffset += GROUP_HEADER_HEIGHT;
                    return (
                      <div
                        key={`tr-${i}`}
                        className="absolute left-0 right-0 border-b border-border/30"
                        style={{
                          top: currentY,
                          height: GROUP_HEADER_HEIGHT,
                        }}
                      />
                    );
                  }

                  yOffset += ROW_HEIGHT;

                  // ── Order bar rendering ──────────────────────────
                  if (row.type === "order") {
                    const order = row.order;
                    const orderDate = parseDate(order.orderDate);

                    // Production bar: orderDate → actProductionEnd ?? orderDate + estProductionDays
                    const prodEnd = order.actProductionEnd
                      ? parseDate(order.actProductionEnd)
                      : order.estProductionDays
                        ? parseDate(addDaysStr(order.orderDate, order.estProductionDays))
                        : null;

                    // Delivery bar: (actProductionEnd ?? estProductionEnd) → actDeliveryDate ?? orderDate + estDeliveryDays
                    const delStart = order.actProductionEnd
                      ? parseDate(order.actProductionEnd)
                      : order.estProductionDays
                        ? parseDate(addDaysStr(order.orderDate, order.estProductionDays))
                        : null;
                    const delEnd = order.actDeliveryDate
                      ? parseDate(order.actDeliveryDate)
                      : order.estDeliveryDays
                        ? parseDate(addDaysStr(order.orderDate, order.estDeliveryDays))
                        : null;

                    const prodColor = order.actProductionEnd ? "#22c55e" : "#3b82f6";
                    const delColor = order.actDeliveryDate ? "#22c55e" : "#f97316";

                    return (
                      <div
                        key={`order-${order.id}`}
                        className="absolute z-10"
                        style={{ top: currentY, height: ROW_HEIGHT }}
                      >
                        {/* Production bar */}
                        {prodEnd && (() => {
                          const leftPx = daysBetween(rangeStart, orderDate) * DAY_WIDTH;
                          const rightPx = (daysBetween(rangeStart, prodEnd) + 1) * DAY_WIDTH;
                          const width = Math.max(rightPx - leftPx, DAY_WIDTH);
                          return (
                            <div
                              className="absolute cursor-pointer rounded-md"
                              style={{
                                left: leftPx,
                                top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                                width,
                                height: BAR_HEIGHT / 2,
                                backgroundColor: prodColor,
                                opacity: 0.85,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOrderClick?.(order);
                              }}
                              onMouseMove={(e) => {
                                setHoveredTask(`order-${order.id}`);
                                setTooltipPos({ x: e.clientX, y: e.clientY });
                              }}
                              onMouseLeave={handleBarMouseLeave}
                            >
                              <span
                                className="absolute inset-0 flex items-center px-1 text-[9px] font-medium text-white truncate"
                                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
                              >
                                {width > 60 ? "Production" : ""}
                              </span>
                            </div>
                          );
                        })()}
                        {/* Delivery bar */}
                        {delStart && delEnd && (() => {
                          const leftPx = daysBetween(rangeStart, delStart) * DAY_WIDTH;
                          const rightPx = (daysBetween(rangeStart, delEnd) + 1) * DAY_WIDTH;
                          const width = Math.max(rightPx - leftPx, DAY_WIDTH);
                          return (
                            <div
                              className="absolute cursor-pointer rounded-md"
                              style={{
                                left: leftPx,
                                top: (ROW_HEIGHT - BAR_HEIGHT) / 2 + BAR_HEIGHT / 2,
                                width,
                                height: BAR_HEIGHT / 2,
                                backgroundColor: delColor,
                                opacity: 0.85,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOrderClick?.(order);
                              }}
                              onMouseMove={(e) => {
                                setHoveredTask(`order-${order.id}`);
                                setTooltipPos({ x: e.clientX, y: e.clientY });
                              }}
                              onMouseLeave={handleBarMouseLeave}
                            >
                              <span
                                className="absolute inset-0 flex items-center px-1 text-[9px] font-medium text-white truncate"
                                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
                              >
                                {width > 60 ? "Delivery" : ""}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  }

                  // ── Task bar rendering ───────────────────────────
                  const task = (row as { type: "task" | "undated-task"; task: PMTaskData }).task;

                  if (row.type === "undated-task") {
                    // No bar for undated tasks
                    return (
                      <div
                        key={task.id}
                        className="absolute left-0 right-0"
                        style={{ top: currentY, height: ROW_HEIGHT }}
                      />
                    );
                  }

                  const bar = getBarStyle(task);
                  if (!bar) return null;

                  const color = getBarColor(task);

                  if (bar.isSingle) {
                    // Diamond / circle marker
                    return (
                      <div
                        key={task.id}
                        className="absolute z-10"
                        style={{ top: currentY, height: ROW_HEIGHT }}
                      >
                        <div
                          className="absolute cursor-pointer rounded-sm"
                          style={{
                            left: bar.left,
                            top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                            width: BAR_HEIGHT,
                            height: BAR_HEIGHT,
                            backgroundColor: color,
                            transform: "rotate(45deg) scale(0.7)",
                            transformOrigin: "center",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTaskClick(task);
                          }}
                          onMouseMove={(e) => handleBarMouseMove(e, task.id)}
                          onMouseLeave={handleBarMouseLeave}
                        />
                        {/* Drag handle for single-day markers */}
                        {hoveredTask === task.id && task.dueDate && (
                          <div
                            className="absolute cursor-ew-resize"
                            style={{
                              left: bar.left + BAR_HEIGHT - 4,
                              top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                              width: 8,
                              height: BAR_HEIGHT,
                            }}
                            onMouseDown={(e) =>
                              handleDragStart(e, task.id, "right", task.dueDate!)
                            }
                          />
                        )}
                      </div>
                    );
                  }

                  // Full bar
                  return (
                    <div
                      key={task.id}
                      className="absolute z-10"
                      style={{ top: currentY, height: ROW_HEIGHT }}
                    >
                      <div
                        className="group/bar absolute cursor-pointer rounded-md transition-opacity"
                        style={{
                          left: bar.left,
                          top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                          width: bar.width,
                          height: BAR_HEIGHT,
                          backgroundColor: color,
                          opacity:
                            dragState && dragState.taskId === task.id ? 0.7 : 0.85,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskClick(task);
                        }}
                        onMouseMove={(e) => handleBarMouseMove(e, task.id)}
                        onMouseLeave={handleBarMouseLeave}
                      >
                        {/* Task title on bar */}
                        <span
                          className="absolute inset-0 flex items-center px-1.5 text-2xs font-medium text-white truncate"
                          style={{
                            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                          }}
                        >
                          {bar.width > 60 ? task.title : ""}
                        </span>

                        {/* Left drag handle */}
                        {task.startDate && (
                          <div
                            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover/bar:opacity-100"
                            style={{ borderRadius: "6px 0 0 6px" }}
                            onMouseDown={(e) =>
                              handleDragStart(
                                e,
                                task.id,
                                "left",
                                task.startDate!
                              )
                            }
                          >
                            <div className="absolute left-0.5 top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-white/60" />
                          </div>
                        )}

                        {/* Right drag handle */}
                        {task.dueDate && (
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover/bar:opacity-100"
                            style={{ borderRadius: "0 6px 6px 0" }}
                            onMouseDown={(e) =>
                              handleDragStart(
                                e,
                                task.id,
                                "right",
                                task.dueDate!
                              )
                            }
                          >
                            <div className="absolute right-0.5 top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-white/60" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Task Tooltip */}
      {hoveredTaskData && !dragState && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-border bg-elevated px-3 py-2 shadow-lg"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y + 12,
          }}
        >
          <p className="text-xs font-semibold text-foreground truncate">
            {hoveredTaskData.title}
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 text-2xs text-muted-foreground">
              <span>Status:</span>
              <span
                className="font-medium"
                style={{ color: STATUS_COLORS[hoveredTaskData.status] || undefined }}
              >
                {hoveredTaskData.status}
              </span>
            </div>
            <div className="flex items-center gap-2 text-2xs text-muted-foreground">
              <span>Priority:</span>
              <span
                className="font-medium"
                style={{ color: PRIORITY_COLORS[hoveredTaskData.priority] }}
              >
                {hoveredTaskData.priority}
              </span>
            </div>
            {hoveredTaskData.startDate && (
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                <span>Start:</span>
                <span>{formatDate(hoveredTaskData.startDate, "medium")}</span>
              </div>
            )}
            {hoveredTaskData.dueDate && (
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                <span>Due:</span>
                <span>{formatDate(hoveredTaskData.dueDate, "medium")}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Tooltip */}
      {hoveredOrderData && !dragState && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-border bg-elevated px-3 py-2 shadow-lg"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y + 12,
          }}
        >
          <p className="text-xs font-semibold text-foreground truncate">
            Order {hoveredOrderData.orderNumber}
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 text-2xs text-muted-foreground">
              <span>Status:</span>
              <span className="font-medium text-amber-400">{hoveredOrderData.status}</span>
            </div>
            <div className="flex items-center gap-2 text-2xs text-muted-foreground">
              <span>Supplier:</span>
              <span className="truncate">{hoveredOrderData.supplier}</span>
            </div>
            <div className="flex items-center gap-2 text-2xs text-muted-foreground">
              <span>Ordered:</span>
              <span>{formatDate(hoveredOrderData.orderDate, "medium")}</span>
            </div>
            {hoveredOrderData.actDeliveryDate && (
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                <span>Delivered:</span>
                <span>{formatDate(hoveredOrderData.actDeliveryDate, "medium")}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-2xs text-muted-foreground">
              <span>Units:</span>
              <span>{hoveredOrderData.lineItems.reduce((s: number, it: SupplierOrderItem) => s + it.quantity, 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
