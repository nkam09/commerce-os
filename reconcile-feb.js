const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const days = await p.dailySale.groupBy({
    by: ["date"],
    where: {
      date: { gte: new Date("2026-02-01"), lt: new Date("2026-03-01") },
    },
    _sum: { grossSales: true, unitsSold: true, orderCount: true },
    orderBy: { date: "asc" },
  });
  console.log("Feb daily breakdown:");
  for (const d of days) {
    const date = d.date.toISOString().slice(0, 10);
    console.log(date, "units:", d._sum.unitsSold, "orders:", d._sum.orderCount, "sales:", parseFloat(d._sum.grossSales).toFixed(2));
  }
  await p["$disconnect"]();
}
main();
