const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  await p.syncCursor.updateMany({
    where: { jobName: "sync-orders" },
    data: { cursor: "2026-01-01T00:00:00Z" },
  });
  const verify = await p.syncCursor.findFirst({
    where: { jobName: "sync-orders" },
  });
  console.log("Cursor reset to:", verify.cursor);
  await p["$disconnect"]();
}
main();
