/**
 * Sync Orchestration Service
 *
 * Provides two responsibilities:
 *   1. Cursor management — read/write SyncCursor records for incremental sync
 *   2. Job run lifecycle — create RUNNING record at start, mark SUCCESS/FAILED at end
 *
 * All jobs use this service. It is the single place that touches SyncCursor
 * and SyncJobRun tables.
 */

import { prisma } from "@/lib/db/prisma";

// ─── Cursor ──────────────────────────────────────────────────────────────────

const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * Returns the stored cursor (ISO date string or next token) for a job.
 * If no cursor exists, returns a date DEFAULT_LOOKBACK_DAYS ago.
 *
 * Jobs may override the fallback by passing their own defaultCursor.
 */
export async function getCursor(
  connectionId: string,
  jobName: string,
  defaultCursor?: string
): Promise<string> {
  const record = await prisma.syncCursor.findUnique({
    where: { connectionId_jobName: { connectionId, jobName } },
  });

  if (record?.cursor) return record.cursor;

  if (defaultCursor) return defaultCursor;

  const d = new Date();
  d.setUTCDate(d.getUTCDate() - DEFAULT_LOOKBACK_DAYS);
  return d.toISOString();
}

/**
 * Upserts the cursor for a job to the given value.
 * Call after a successful sync page or at the end of a job.
 */
export async function updateCursor(
  connectionId: string,
  jobName: string,
  cursor: string
): Promise<void> {
  await prisma.syncCursor.upsert({
    where: { connectionId_jobName: { connectionId, jobName } },
    create: {
      connectionId,
      jobName,
      cursor,
      lastRunAt: new Date(),
    },
    update: {
      cursor,
      lastRunAt: new Date(),
    },
  });
}

// ─── Job Run Lifecycle ───────────────────────────────────────────────────────

/**
 * Creates a RUNNING SyncJobRun record and returns its ID.
 * Call at the start of every job.
 */
export async function beginJobRun(
  connectionId: string,
  jobName: string
): Promise<string> {
  const run = await prisma.syncJobRun.create({
    data: {
      connectionId,
      jobName,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
  return run.id;
}

/**
 * Marks a job run as SUCCESS with fetched/written counts.
 */
export async function completeJobRun(
  runId: string,
  counts: { fetchedCount: number; writtenCount: number }
): Promise<void> {
  await prisma.syncJobRun.update({
    where: { id: runId },
    data: {
      status: "SUCCESS",
      fetchedCount: counts.fetchedCount,
      writtenCount: counts.writtenCount,
      finishedAt: new Date(),
    },
  });
}

/**
 * Marks a job run as FAILED with an error message.
 */
export async function failJobRun(
  runId: string,
  errorMessage: string
): Promise<void> {
  await prisma.syncJobRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      errorMessage: errorMessage.slice(0, 1000), // Guard against very long stack traces
      finishedAt: new Date(),
    },
  });
}

/**
 * Marks a job run as PARTIAL (some records written, some errors encountered).
 */
export async function partialJobRun(
  runId: string,
  counts: { fetchedCount: number; writtenCount: number },
  errorMessage: string
): Promise<void> {
  await prisma.syncJobRun.update({
    where: { id: runId },
    data: {
      status: "PARTIAL",
      fetchedCount: counts.fetchedCount,
      writtenCount: counts.writtenCount,
      errorMessage: errorMessage.slice(0, 1000),
      finishedAt: new Date(),
    },
  });
}

// ─── Connection health refresh ────────────────────────────────────────────────

/**
 * Updates the status of a SyncConnection based on its most recent job run.
 * Called by run-sync-health-refresh.ts.
 */
export async function refreshConnectionStatus(connectionId: string): Promise<void> {
  const lastRun = await prisma.syncJobRun.findFirst({
    where: { connectionId },
    orderBy: { startedAt: "desc" },
  });

  if (!lastRun) return;

  const status =
    lastRun.status === "FAILED" ? "ERROR"
    : lastRun.status === "SUCCESS" || lastRun.status === "PARTIAL" ? "ACTIVE"
    : "ACTIVE";

  await prisma.syncConnection.update({
    where: { id: connectionId },
    data: { status },
  });
}
