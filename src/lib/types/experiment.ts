/**
 * Shared types and constants for Experiments.
 */

export const EXPERIMENT_TYPES = [
  "Coupon",
  "Price Test",
  "Listing Optimization",
  "Image Test",
  "Launch",
  "A+ Content",
  "Video",
  "Other",
] as const;

export type ExperimentType = (typeof EXPERIMENT_TYPES)[number];

export const EXPERIMENT_STATUSES = ["Planned", "Active", "Completed", "Cancelled"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

/** Tailwind color class per experiment type (used for calendar bars). */
export const EXPERIMENT_TYPE_COLOR: Record<string, string> = {
  Coupon: "bg-orange-500",
  "Price Test": "bg-blue-500",
  "Listing Optimization": "bg-green-500",
  "Image Test": "bg-purple-500",
  Launch: "bg-red-500",
  "A+ Content": "bg-teal-500",
  Video: "bg-pink-500",
  Other: "bg-gray-500",
};

export type ExperimentSubtaskData = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
  order: number;
};

export type ExperimentData = {
  id: string;
  userId: string;
  spaceId: string | null;
  asin: string | null;
  type: string;
  title: string;
  description: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: string;
  expectedImpact: string | null;
  actualImpact: string | null;
  notes: string | null;
  subtasks: ExperimentSubtaskData[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Generic subtask progress computation, shared across task and experiment views.
 * Both PMSubtask and ExperimentSubtask have the same `{ completed, dueDate }` shape
 * so we can compute progress identically for either.
 */
export function getSubtaskProgress(
  subtasks: { completed: boolean; dueDate: string | null }[]
): {
  total: number;
  completed: number;
  overdue: number;
  percentComplete: number;
  hasOverdue: boolean;
  allComplete: boolean;
} {
  const total = subtasks.length;
  const completed = subtasks.filter((s) => s.completed).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let overdue = 0;
  for (const s of subtasks) {
    if (s.completed || !s.dueDate) continue;
    const d = new Date(s.dueDate);
    if (!isNaN(d.getTime()) && d < today) overdue++;
  }
  return {
    total,
    completed,
    overdue,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
    hasOverdue: overdue > 0,
    allComplete: total > 0 && completed === total,
  };
}
