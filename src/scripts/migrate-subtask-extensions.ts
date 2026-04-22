/**
 * Extend pm_subtasks with description + dueDate; create experiment_subtasks.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/migrate-subtask-extensions.ts
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
  console.log("Extending pm_subtasks...");
  await run(`ALTER TABLE pm_subtasks ADD COLUMN IF NOT EXISTS description TEXT`, "pm_subtasks.description");
  await run(`ALTER TABLE pm_subtasks ADD COLUMN IF NOT EXISTS "dueDate" DATE`, "pm_subtasks.dueDate");

  console.log("\nCreating experiment_subtasks...");
  await run(
    `CREATE TABLE IF NOT EXISTS experiment_subtasks (
       id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       title TEXT NOT NULL,
       description TEXT,
       "dueDate" DATE,
       completed BOOLEAN DEFAULT false,
       "order" INTEGER DEFAULT 0,
       "experimentId" TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
       "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
     )`,
    "table experiment_subtasks"
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_exp_subtask_experiment ON experiment_subtasks("experimentId")`,
    "idx_exp_subtask_experiment"
  );

  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'pm_subtasks' ORDER BY ordinal_position"
  );
  console.log("\npm_subtasks columns:", cols.map((c) => c.column_name).join(", "));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
