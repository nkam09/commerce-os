const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const count = await p.inventorySnapshot.count();
  const sample = await p.inventorySnapshot.findMany({ take: 3, orderBy: { snapshotDate: "desc" }, include: { product: { select: { asin: true, title: true } } } });
  const dateRange = await p.inventorySnapshot.aggregate({ _min: { snapshotDate: true }, _max: { snapshotDate: true } });
  console.log("Total snapshots:", count);
  console.log("Date range:", dateRange._min.snapshotDate, "to", dateRange._max.snapshotDate);
  console.log("Sample:", JSON.stringify(sample, null, 2));
  await p["$disconnect"]();
}
main();
