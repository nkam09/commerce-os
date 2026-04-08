const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RestockProfile" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "manufacturingDays" INTEGER NOT NULL DEFAULT 30,
      "usePrepCenter" BOOLEAN NOT NULL DEFAULT false,
      "shippingToPrepDays" INTEGER NOT NULL DEFAULT 0,
      "shippingToFbaDays" INTEGER NOT NULL DEFAULT 35,
      "fbaBufferDays" INTEGER NOT NULL DEFAULT 10,
      "targetStockRangeDays" INTEGER NOT NULL DEFAULT 60,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "RestockProfile_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log("RestockProfile table created");
  await p.$disconnect();
}
main();
