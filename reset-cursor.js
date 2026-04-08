const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const result = await p.syncCursor.updateMany({
    where: { jobName: "sync-orders" },
    data: { cursor: "2026-03-01T00:00:00Z" },
  });
  console.log("Reset sync-orders cursor:", result);
  const verify = await p.syncCursor.findFirst({
    where: { jobName: "sync-orders" },
  });
  console.log("Cursor now:", verify);
  await p["$disconnect"]();
}
main();
