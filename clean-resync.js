const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const deleted = await p.dailySale.deleteMany({});
  console.log("Deleted daily_sales rows:", deleted.count);

  await p.syncCursor.updateMany({
    where: { jobName: "sync-orders" },
    data: { cursor: "2026-01-01T00:00:00Z" },
  });
  console.log("Cursor reset to Jan 1");

  await p["$disconnect"]();
}
main();
