const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const targets = ["2026-03-12", "2026-03-13", "2026-03-21"];
  for (const d of targets) {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 1);
    const result = await p.dailySale.aggregate({
      where: {
        date: { gte: new Date(d), lt: next },
      },
      _sum: { grossSales: true, unitsSold: true, orderCount: true },
    });
    console.log(d, "->", JSON.stringify(result._sum));
  }
  await p["$disconnect"]();
}
main();
