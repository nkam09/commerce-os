const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const result = await p.dailySale.aggregate({
    where: {
      date: { gte: new Date("2026-03-01"), lt: new Date("2026-04-01") },
    },
    _sum: {
      grossSales: true,
      unitsSold: true,
      orderCount: true,
    },
  });
  console.log("March daily_sales:", JSON.stringify(result, null, 2));

  const maxDate = await p.dailySale.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  console.log("Latest daily_sales date:", maxDate);

  const marchDays = await p.dailySale.groupBy({
    by: ["date"],
    where: {
      date: { gte: new Date("2026-03-01"), lt: new Date("2026-04-01") },
    },
    _count: true,
    orderBy: { date: "desc" },
    take: 5,
  });
  console.log("Last 5 March days:", JSON.stringify(marchDays, null, 2));

  await p["$disconnect"]();
}
main();
