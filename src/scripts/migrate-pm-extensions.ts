/**
 * Create tables for Experiments, RecurringTask, GoogleCalendarConnection,
 * GoogleCalendarEvent.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/migrate-pm-extensions.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run(sql: string, label: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`  OK ${label}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ERROR ${label}: ${msg.slice(0, 200)}`);
  }
}

async function main() {
  console.log("Creating experiments...");
  await run(
    `CREATE TABLE IF NOT EXISTS experiments (
       id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       "spaceId" TEXT REFERENCES pm_spaces(id) ON DELETE SET NULL,
       asin TEXT,
       type TEXT NOT NULL,
       title TEXT NOT NULL,
       description TEXT,
       "startDate" DATE NOT NULL,
       "endDate" DATE NOT NULL,
       status TEXT DEFAULT 'Planned',
       "expectedImpact" TEXT,
       "actualImpact" TEXT,
       notes TEXT,
       "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
     )`,
    "table experiments"
  );
  await run(`CREATE INDEX IF NOT EXISTS idx_exp_user_start ON experiments("userId", "startDate")`, "idx_exp_user_start");
  await run(`CREATE INDEX IF NOT EXISTS idx_exp_user_status ON experiments("userId", status)`, "idx_exp_user_status");
  await run(`CREATE INDEX IF NOT EXISTS idx_exp_user_asin ON experiments("userId", asin)`, "idx_exp_user_asin");

  console.log("\nCreating recurring_tasks...");
  await run(
    `CREATE TABLE IF NOT EXISTS recurring_tasks (
       id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       "listId" TEXT REFERENCES pm_lists(id) ON DELETE SET NULL,
       "spaceId" TEXT REFERENCES pm_spaces(id) ON DELETE SET NULL,
       title TEXT NOT NULL,
       description TEXT,
       frequency TEXT NOT NULL,
       "intervalDays" INTEGER,
       "dayOfWeek" INTEGER,
       "dayOfMonth" INTEGER,
       "startDate" DATE NOT NULL,
       "nextRunDate" DATE NOT NULL,
       "lastRunDate" DATE,
       active BOOLEAN DEFAULT true,
       "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
     )`,
    "table recurring_tasks"
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_rt_user_active_next ON recurring_tasks("userId", active, "nextRunDate")`,
    "idx_rt_user_active_next"
  );

  console.log("\nCreating google_calendar_connections...");
  await run(
    `CREATE TABLE IF NOT EXISTS google_calendar_connections (
       id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       "userId" TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
       "accessToken" TEXT NOT NULL,
       "refreshToken" TEXT NOT NULL,
       "expiresAt" TIMESTAMP(3) NOT NULL,
       "calendarId" TEXT DEFAULT 'primary',
       "syncEnabled" BOOLEAN DEFAULT true,
       "lastSyncedAt" TIMESTAMP(3),
       "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
     )`,
    "table google_calendar_connections"
  );

  console.log("\nCreating google_calendar_events...");
  await run(
    `CREATE TABLE IF NOT EXISTS google_calendar_events (
       id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       "connectionId" TEXT NOT NULL REFERENCES google_calendar_connections(id) ON DELETE CASCADE,
       "entityType" TEXT NOT NULL,
       "entityId" TEXT NOT NULL,
       "googleEventId" TEXT NOT NULL,
       "lastSyncedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
       UNIQUE("connectionId", "entityType", "entityId")
     )`,
    "table google_calendar_events"
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_gce_google_event ON google_calendar_events("googleEventId")`,
    "idx_gce_google_event"
  );

  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
       'experiments', 'recurring_tasks', 'google_calendar_connections', 'google_calendar_events'
     ) ORDER BY tablename`
  );
  console.log("\nTables present:", tables.map((t) => t.tablename).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
