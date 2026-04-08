/**
 * Recompute Orchestration Service
 *
 * Scaffold for triggering derived metric recomputation and AI insight
 * generation after sync jobs complete.
 *
 * Currently a no-op placeholder. Future implementations will:
 *   - Recompute per-product profitability aggregates
 *   - Refresh inventory reorder trigger calculations
 *   - Evaluate rule-based insight conditions
 *   - Write AIInsight records for threshold breaches
 *
 * Called at the end of each sync job runner.
 */

import { prisma } from "@/lib/db/prisma";

export type RecomputeScope = {
  userId: string;
  productIds?: string[]; // Limit recompute to specific products if available
  fromDate?: Date;
  toDate?: Date;
};

/**
 * Main entry point for post-sync recomputation.
 * Currently logs scope and returns — no actual computation yet.
 *
 * TODO: Implement profitability recompute (DailySale + DailyFee → net revenue).
 * TODO: Implement inventory health scoring (available / avg daily sales = days left).
 * TODO: Implement cash flow projection from expenses + PO balances.
 * TODO: Implement rule evaluation and AIInsight creation.
 */
export async function runRecompute(scope: RecomputeScope): Promise<void> {
  console.log("[recompute] scope:", {
    userId: scope.userId,
    productIds: scope.productIds?.length ?? "all",
    fromDate: scope.fromDate?.toISOString(),
    toDate: scope.toDate?.toISOString(),
  });

  // TODO: Implement recompute steps below.
  // Step 1: Recompute profitability aggregates
  // Step 2: Refresh inventory health
  // Step 3: Evaluate AI insight rules
  // Step 4: Write AIInsight records for new breaches
}

/**
 * Refreshes sync health for all connections belonging to a user.
 * Updates SyncConnection.status based on most recent job run per connection.
 *
 * TODO: Expand to update lastTestedAt and surface partial sync state.
 */
export async function refreshSyncHealth(userId: string): Promise<void> {
  const connections = await prisma.syncConnection.findMany({
    where: { userId },
    select: { id: true },
  });

  for (const conn of connections) {
    const lastRun = await prisma.syncJobRun.findFirst({
      where: { connectionId: conn.id },
      orderBy: { startedAt: "desc" },
    });

    if (!lastRun) continue;

    const status =
      lastRun.status === "FAILED" ? "ERROR"
      : lastRun.status === "SUCCESS" || lastRun.status === "PARTIAL" ? "ACTIVE"
      : "ACTIVE";

    await prisma.syncConnection.update({
      where: { id: conn.id },
      data: { status },
    });
  }
}
