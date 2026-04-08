const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const cursors = await p.syncCursor.findMany({
    orderBy: { updatedAt: "desc" },
  });
  console.log("All sync cursors:");
  for (const c of cursors) {
    console.log(c.jobName, "->", c.cursor, "updated:", c.updatedAt);
  }
  await p["$disconnect"]();
}
main();
