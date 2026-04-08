const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "settlements" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "periodStart" DATE NOT NULL,
      "periodEnd" DATE NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "grossSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "refunds" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "amazonFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "adSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "otherDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "netPayout" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "paymentDate" DATE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log("settlements table created");
  await p.$disconnect();
}
main();
