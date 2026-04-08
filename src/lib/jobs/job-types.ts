/**
 * Job Types
 *
 * Shared types used by all sync jobs, runners, and the worker entry.
 */

// ─── Job Context ──────────────────────────────────────────────────────────────

/**
 * Runtime context passed into every job function.
 * Resolved by job-connection-resolver.ts before each job runs.
 */
export type JobContext = {
  userId: string;
  spConnectionId: string;   // SyncConnection.id for SP_API type
  adsConnectionId: string;  // SyncConnection.id for ADS_API type
  marketplace: {
    id: string;     // Internal Marketplace.id
    code: string;   // Amazon marketplace ID string (e.g. ATVPDKIKX0DER)
    region: string; // AWS region string (e.g. us-east-1)
  };
};

// ─── Job Result ───────────────────────────────────────────────────────────────

export type JobResult = {
  fetchedCount: number;
  writtenCount: number;
  nextCursor?: string;
  notes?: string; // Optional human-readable summary
};

// ─── Job Runner Config ────────────────────────────────────────────────────────

/**
 * Config passed to runner scripts.
 * Runners read this from env / DB and pass it to jobs.
 */
export type RunnerConfig = {
  userId: string;
  dryRun?: boolean; // If true, fetch but don't write
};
