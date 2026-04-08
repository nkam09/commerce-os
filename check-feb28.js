const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const rows = await p.dailySale.findMany({
    where: {
      date: { gte: new Date("2026-02-28"), lt: new Date("2026-03-01") },
    },
    include: { product: { select: { asin: true, title: true } } },
  });
  for (const r of rows) {
    console.log(r.product.asin, "units:", r.unitsSold, "orders:", r.orderCount, "sales:", parseFloat(r.grossSales).toFixed(2));
  }
  console.log("\nTotal units:", rows.reduce((s, r) => s + r.unitsSold, 0));
  await p["$disconnect"]();
}
main();
