const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const products = await p.product.findMany({
    select: { asin: true, title: true },
  });
  console.log("Products in database:");
  for (const pr of products) {
    console.log(" ", pr.asin, "-", pr.title);
  }

  const runs = await p.syncJobRun.findMany({
    where: { jobName: "sync-orders" },
    orderBy: { startedAt: "desc" },
    take: 5,
  });
  console.log("\nLast 5 sync-orders runs:");
  for (const r of runs) {
    console.log("  fetched:", r.fetchedCount, "written:", r.writtenCount, "at:", r.startedAt);
  }
  await p["$disconnect"]();
}
main();
