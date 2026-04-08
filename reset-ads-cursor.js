require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  await p.$executeRawUnsafe(`UPDATE sync_cursors SET cursor = '2026-04-04' WHERE "jobName" = 'sync-ads-products'`);
  console.log("Reset ads cursor to Apr 4");
  await p.$disconnect();
}
main();
