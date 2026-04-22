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
  createdAt: string;
  updatedAt: string;
};
