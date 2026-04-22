"use client";

/**
 * Horizontal strip of experiment cards rendered above Board / List / Order views.
 *
 * Used by board-view, list-view, order-board-view, order-list-view to surface
 * experiments in the same space without dedicating a full view to them.
 * Clicking a card opens the edit form via `onExperimentClick`.
 *
 * Calendar and Timeline render experiments differently (bars over time) and
 * do NOT use this component.
 */
import { cn } from "@/lib/utils/cn";
import { EXPERIMENT_TYPE_COLOR, type ExperimentData } from "@/lib/types/experiment";

type Props = {
  experiments: ExperimentData[];
  onExperimentClick?: (exp: ExperimentData) => void;
  /** Show only non-terminal (Planned / Active) by default. Override with true to show all. */
  showCompletedAndCancelled?: boolean;
};

const STATUS_BADGE: Record<string, string> = {
  Planned: "bg-slate-500/20 text-slate-400",
  Active: "bg-green-500/20 text-green-400",
  Completed: "bg-blue-500/20 text-blue-400",
  Cancelled: "bg-red-500/20 text-red-400",
};

function formatShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ExperimentStrip({
  experiments,
  onExperimentClick,
  showCompletedAndCancelled = false,
}: Props) {
  const visible = showCompletedAndCancelled
    ? experiments
    : experiments.filter((e) => e.status === "Active" || e.status === "Planned");

  if (visible.length === 0) return null;

  return (
    <section className="mb-4">
      <h3 className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Experiments ({visible.length})
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {visible.map((exp) => (
          <button
            key={exp.id}
            type="button"
            onClick={() => onExperimentClick?.(exp)}
            className="flex-shrink-0 w-[240px] rounded-lg border border-border bg-card p-3 text-left hover:border-primary/40 hover:bg-elevated/40 transition"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    EXPERIMENT_TYPE_COLOR[exp.type] ?? "bg-gray-500"
                  )}
                />
                <span className="text-2xs text-muted-foreground truncate">{exp.type}</span>
              </div>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0",
                  STATUS_BADGE[exp.status] ?? "bg-muted text-muted-foreground"
                )}
              >
                {exp.status}
              </span>
            </div>
            <p className="text-xs font-medium text-foreground truncate">{exp.title}</p>
            <p className="text-2xs text-muted-foreground mt-1 tabular-nums">
              {formatShort(exp.startDate)} → {formatShort(exp.endDate)}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
