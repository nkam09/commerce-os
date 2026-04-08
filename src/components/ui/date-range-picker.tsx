"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils/cn";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface DateRangePickerProps {
  from: Date | null;
  to: Date | null;
  onApply: (from: Date, to: Date) => void;
  onCancel: () => void;
  /** Which side the popup opens toward. "left" (default) = left-0, "right" = right-0 */
  align?: "left" | "right";
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inRange(day: Date, from: Date | null, to: Date | null): boolean {
  if (!from || !to) return false;
  const t = day.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatRange(from: Date | null, to: Date | null): string {
  if (!from) return "Select start date";
  if (!to) return `${SHORT_MONTHS[from.getMonth()]} ${from.getDate()} – ?`;
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromStr = `${SHORT_MONTHS[from.getMonth()]} ${from.getDate()}`;
  const toStr = sameYear
    ? `${SHORT_MONTHS[to.getMonth()]} ${to.getDate()}, ${to.getFullYear()}`
    : `${SHORT_MONTHS[to.getMonth()]} ${to.getDate()}, ${to.getFullYear()}`;
  return `${fromStr} – ${toStr}`;
}

function MonthCalendar({
  year,
  month,
  from,
  to,
  onDayClick,
}: {
  year: number;
  month: number;
  from: Date | null;
  to: Date | null;
  onDayClick: (d: Date) => void;
}) {
  const days = getDaysInMonth(year, month);
  const firstDayOfWeek = days[0].getDay();
  const blanks = Array.from({ length: firstDayOfWeek });

  return (
    <div className="w-[260px]">
      <div className="text-center text-xs font-semibold text-foreground mb-2">
        {MONTH_NAMES[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] text-tertiary py-1">{d}</div>
        ))}
        {blanks.map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {days.map((day) => {
          const isStart = sameDay(day, from);
          const isEnd = sameDay(day, to);
          const isInRange = inRange(day, from, to);
          const isToday = sameDay(day, new Date());

          return (
            <button
              key={day.getDate()}
              onClick={() => onDayClick(day)}
              className={cn(
                "h-8 w-full text-xs rounded transition-colors",
                isStart || isEnd
                  ? "bg-primary text-primary-foreground font-bold"
                  : isInRange
                  ? "bg-primary/20 text-foreground"
                  : isToday
                  ? "ring-1 ring-primary/40 text-foreground"
                  : "text-muted-foreground hover:bg-elevated hover:text-foreground",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({ from: initialFrom, to: initialTo, onApply, onCancel, align = "left" }: DateRangePickerProps) {
  const [from, setFrom] = useState<Date | null>(initialFrom);
  const [to, setTo] = useState<Date | null>(initialTo);
  const [viewDate, setViewDate] = useState(() => {
    const d = initialTo ?? initialFrom ?? new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  const prevMonth = viewDate.month === 0
    ? { year: viewDate.year - 1, month: 11 }
    : { year: viewDate.year, month: viewDate.month - 1 };

  const handleDayClick = (day: Date) => {
    if (!from || (from && to)) {
      setFrom(day);
      setTo(null);
    } else {
      if (day.getTime() < from.getTime()) {
        setTo(from);
        setFrom(day);
      } else {
        setTo(day);
      }
    }
  };

  const goBack = () => {
    setViewDate((v) => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 });
  };

  const goForward = () => {
    setViewDate((v) => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 });
  };

  return (
    <div ref={ref} className={cn("absolute top-full mt-2 z-[100] rounded-lg border border-border bg-card shadow-xl p-5 space-y-4", align === "right" ? "right-0" : "left-0")}>
      {/* Nav arrows + range text */}
      <div className="flex items-center justify-between">
        <button onClick={goBack} className="p-1 rounded hover:bg-elevated text-muted-foreground hover:text-foreground">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4L6 8l4 4" /></svg>
        </button>
        <span className="text-xs font-medium text-foreground">{formatRange(from, to)}</span>
        <button onClick={goForward} className="p-1 rounded hover:bg-elevated text-muted-foreground hover:text-foreground">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
        </button>
      </div>

      {/* Two calendars side by side */}
      <div className="flex gap-6">
        <MonthCalendar
          year={prevMonth.year}
          month={prevMonth.month}
          from={from}
          to={to}
          onDayClick={handleDayClick}
        />
        <MonthCalendar
          year={viewDate.year}
          month={viewDate.month}
          from={from}
          to={to}
          onDayClick={handleDayClick}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md transition">
          Cancel
        </button>
        <button
          onClick={() => { if (from && to) onApply(from, to); }}
          disabled={!from || !to}
          className="px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-40 transition hover:bg-primary/90"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
