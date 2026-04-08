const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const months = [
    { name: "January", from: "2026-01-01", to: "2026-02-01" },
    { name: "February", from: "2026-02-01", to: "2026-03-01" },
    { name: "March", from: "2026-03-01", to: "2026-04-01" },
    { name: "April MTD", from: "2026-04-01", to: "2026-04-04" },
  ];
  for (const m of months) {
    const result = await p.dailySale.aggregate({
      where: { date: { gte: new Date(m.from), lt: new Date(m.to) } },
      _sum: { grossSales: true, unitsSold: true, orderCount: true },
    });
    console.log(m.name, "->", JSON.stringify(result._sum));
  }

  console.log("\nMarch boundary days:");
  for (const d of ["2026-02-28", "2026-03-01", "2026-03-31", "2026-04-01"]) {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 1);
    const result = await p.dailySale.aggregate({
      where: { date: { gte: new Date(d), lt: next } },
      _sum: { grossSales: true, unitsSold: true, orderCount: true },
    });
    console.log(d, "->", JSON.stringify(result._sum));
  }

  await p["$disconnect"]();
}
main();
