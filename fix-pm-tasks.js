const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  await p.$executeRawUnsafe(`ALTER TABLE "pm_tasks" ADD COLUMN IF NOT EXISTS "asinRef" TEXT`);
  await p.$executeRawUnsafe(`ALTER TABLE "pm_tasks" ADD COLUMN IF NOT EXISTS "campaignRef" TEXT`);
  await p.$executeRawUnsafe(`ALTER TABLE "pm_tasks" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ`);
  console.log("Added missing columns to pm_tasks");
  await p.$disconnect();
}
main();
