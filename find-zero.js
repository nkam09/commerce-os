const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const days = await p.dailySale.findMany({
    where: {
      date: { gte: new Date("2026-03-01"), lt: new Date("2026-04-01") },
      product: { asin: "B07XYBW774" },
    },
    select: { date: true, unitsSold: true, grossSales: true, orderCount: true },
    orderBy: { date: "asc" },
  });
  for (const d of days) {
    const avg = d.unitsSold > 0 ? (parseFloat(d.grossSales) / d.unitsSold).toFixed(2) : "N/A";
    console.log(d.date.toISOString().slice(0, 10), "units:", d.unitsSold, "sales:", parseFloat(d.grossSales).toFixed(2), "avg:", avg);
  }
  await p["$disconnect"]();
}
main();
