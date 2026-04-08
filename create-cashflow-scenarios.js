const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "cashflow_scenarios" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "inputs" JSONB NOT NULL DEFAULT '{}',
      "outputs" JSONB NOT NULL DEFAULT '{}',
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "cashflow_scenarios_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log("cashflow_scenarios table created");
  await p.$disconnect();
}
main();
