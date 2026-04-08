/**
 * Job Connection Resolver
 *
 * Loads the SyncConnection and Marketplace records needed to build a JobContext.
 * Each runner calls this before executing a job.
 *
 * Single-user design: finds the first active SP_API and ADS_API connections
 * for the given userId, plus the first (US) marketplace.
 *
 * TODO: For multi-marketplace support, accept a marketplaceCode argument.
 * TODO: Validate that connection status ACTIVE is the correct guard live.
 */

import { prisma } from "@/lib/db/prisma";
import type { JobContext } from "@/lib/jobs/job-types";

/**
 * Resolves JobContext for a userId.
 * Throws if required connections or marketplace are not found.
 */
export async function resolveJobContext(userId: string): Promise<JobContext> {
  const [spConn, adsConn, marketplace] = await Promise.all([
    prisma.syncConnection.findFirst({
      where: { userId, type: "SP_API", status: { not: "INACTIVE" } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.syncConnection.findFirst({
      where: { userId, type: "ADS_API", status: { not: "INACTIVE" } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.marketplace.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!spConn) {
    throw new Error(
      `No active SP_API SyncConnection found for user ${userId}. ` +
      `Run the seed or create a SyncConnection record with type=SP_API.`
    );
  }
  if (!adsConn) {
    throw new Error(
      `No active ADS_API SyncConnection found for user ${userId}. ` +
      `Run the seed or create a SyncConnection record with type=ADS_API.`
    );
  }
  if (!marketplace) {
    throw new Error(
      `No Marketplace found for user ${userId}. ` +
      `Run the seed or create a Marketplace record.`
    );
  }

  return {
    userId,
    spConnectionId: spConn.id,
    adsConnectionId: adsConn.id,
    marketplace: {
      id: marketplace.id,
      code: marketplace.code,
      region: marketplace.region,
    },
  };
}

/**
 * Resolves the internal user id for runner scripts.
 *
 * Resolution order:
 *   1. JOB_USER_ID        — direct internal DB user id (fastest, most explicit)
 *   2. CLERK_SYNC_USER_ID — looks up user by clerkId
 *   3. Fallback           — most recently created user in DB (single-user app)
 *
 * For Render deployments set JOB_USER_ID to your internal user id.
 * Your current internal user id: set JOB_USER_ID=cmmku4pju00003ghoqyc6s408
 */
export async function resolveUserId(): Promise<string> {
  // 1. Direct internal id override — most explicit, no DB lookup needed
  const directId = process.env.JOB_USER_ID;
  if (directId) {
    const user = await prisma.user.findUnique({
      where: { id: directId },
      select: { id: true },
    });
    if (user) return user.id;
    throw new Error(`No user found with JOB_USER_ID=${directId}`);
  }

  // 2. Clerk id lookup
  const clerkId = process.env.CLERK_SYNC_USER_ID;
  if (clerkId) {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (user) return user.id;
    throw new Error(`No user found with CLERK_SYNC_USER_ID=${clerkId}`);
  }

  // 3. Fallback: most recently created user (avoids returning stale seed rows)
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      "No users in database. Sign in at least once before running sync jobs."
    );
  }
  return user.id;
}
