const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const days = await p.dailySale.groupBy({
    by: ["date"],
    where: {
      date: { gte: new Date("2026-03-01"), lt: new Date("2026-04-01") },
    },
    _sum: { grossSales: true, orderCount: true, unitsSold: true },
    orderBy: { date: "asc" },
  });
  
  console.log("March daily breakdown:");
  let totalSales = 0;
  let totalOrders = 0;
  for (const d of days) {
    const date = d.date.toISOString().slice(0, 10);
    const sales = parseFloat(d._sum.grossSales || 0);
    totalSales += sales;
    totalOrders += d._sum.orderCount || 0;
    console.log(date, "sales:", sales.toFixed(2), "orders:", d._sum.orderCount, "units:", d._sum.unitsSold);
  }
  console.log("\nTotal:", totalSales.toFixed(2), "orders:", totalOrders);

  await p["$disconnect"]();
}
main();
