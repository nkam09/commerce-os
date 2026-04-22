/**
 * Shared types and constants for RecurringTask.
 */

export const RECURRING_FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
  "CUSTOM",
] as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  CUSTOM: "Custom interval",
};

export type RecurringTaskData = {
  id: string;
  userId: string;
  listId: string | null;
  spaceId: string | null;
  title: string;
  description: string | null;
  frequency: string;
  intervalDays: number | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string; // YYYY-MM-DD
  nextRunDate: string;
  lastRunDate: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Given the current run date + frequency, returns the next run date.
 * Pure function — safe to use from both client and server code. All date
 * math is done in UTC to avoid DST drift.
 */
export function computeNextRunDate(
  fromDate: Date,
  frequency: string,
  intervalDays: number | null
): Date {
  const next = new Date(fromDate);
  switch (frequency) {
    case "DAILY":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "BIWEEKLY":
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case "MONTHLY":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "QUARTERLY":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "YEARLY":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
    case "CUSTOM":
    default:
      if (intervalDays && intervalDays > 0) {
        next.setUTCDate(next.getUTCDate() + intervalDays);
      } else {
        // Fallback: advance one day so we don't infinite-loop on a bad row
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;
  }
  return next;
}
