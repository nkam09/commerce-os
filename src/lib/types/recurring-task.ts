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
