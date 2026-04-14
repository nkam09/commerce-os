/**
 * Fix Refund Data Script
 *
 * Wipes bad refund data written by the old pipeline (sync-returns + provisional
 * sync-refund-events) for dates >= 2026-02-01, then re-populates from the
 * rewritten sync-refund-events (Financial Events API with PostedDate attribution)
 * and finally lets sync-settlement-refunds overwrite for settled periods.
 *
 * Historical data before 2026-02-01 (Sellerboard import) is NOT touched.
 *
 * Run ONCE after deploying the code changes:
 *   npx --yes dotenv-cli -e .env.local -- npx tsx src/scripts/fix-refund-data.ts
 *
 * Steps:
 *   1. UPDATE daily_sales SET refund* = 0 WHERE date >= 2026-02-01
 *   2. Reset sync-refund-events cursor to 2026-02-01
 *   3. Run sync-refund-events (primary, writes from Financial Events API)
 *   4. Run sync-settlement-refunds (authoritative, overwrites for settled periods)
 *
 * Verification after running:
 *   - March refund count should be ~15 (matches Sellerboard)
 *   - April MTD refund count should be ~6 (matches Sellerboard)
 *   - Today's refunds should match Sellerboard
 */

import { PrismaClient } from "@prisma/client";
import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncRefundEventsJob } from "@/lib/jobs/sync-refund-events-job";
import { syncSettlementRefundsJob } from "@/lib/jobs/sync-settlement-refunds-job";

const prisma = new PrismaClient();

const WIPE_FROM_DATE = "2026-02-01";
const RESET_CURSOR_TO = "2026-02-01T00:00:00Z";

async function main() {
  console.log(`[fix-refund-data] starting — wiping refund data from ${WIPE_FROM_DATE}`);

  // ── Step 1: Wipe refund data in daily_sales from the live pipeline start ──
  const wipeResult = await prisma.$executeRawUnsafe<number>(
    `UPDATE daily_sales
     SET "refundCount" = 0,
         "refundAmount" = 0,
         "refundCommission" = 0,
         "refundedReferralFee" = 0
     WHERE date >= $1::date`,
    WIPE_FROM_DATE
  );
  console.log(`[fix-refund-data] wiped refund columns on ${wipeResult} daily_sales rows`);

  // ── Step 2: Resolve user + connection context ─────────────────────────────
  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);
  console.log(`[fix-refund-data] userId=${userId} spConnectionId=${ctx.spConnectionId}`);

  // ── Step 3: Reset sync-refund-events cursor to 2026-02-01 ─────────────────
  await prisma.syncCursor.upsert({
    where: {
      connectionId_jobName: {
        connectionId: ctx.spConnectionId,
        jobName: "sync-refund-events",
      },
    },
    create: {
      connectionId: ctx.spConnectionId,
      jobName: "sync-refund-events",
      cursor: RESET_CURSOR_TO,
    },
    update: {
      cursor: RESET_CURSOR_TO,
    },
  });
  console.log(`[fix-refund-data] reset sync-refund-events cursor to ${RESET_CURSOR_TO}`);

  // ── Step 4: Re-populate from Financial Events API ────────────────────────
  console.log(`[fix-refund-data] running sync-refund-events…`);
  const eventsResult = await syncRefundEventsJob(ctx);
  console.log(`[fix-refund-data] sync-refund-events done:`, eventsResult);

  // ── Step 5: Overwrite with authoritative settlement data ─────────────────
  console.log(`[fix-refund-data] running sync-settlement-refunds…`);
  const settlementResult = await syncSettlementRefundsJob(ctx);
  console.log(`[fix-refund-data] sync-settlement-refunds done:`, settlementResult);

  console.log(`[fix-refund-data] complete. Verify March/April counts against Sellerboard.`);
}

main()
  .catch((err) => {
    console.error("[fix-refund-data] fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
