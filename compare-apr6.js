const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  // Per-product Apr 6
  const rows = await p.dailySale.findMany({
    where: { date: { gte: new Date("2026-04-06"), lt: new Date("2026-04-07") } },
    include: { product: { select: { asin: true } } },
  });
  console.log("Apr 6 per product:");
  for (const r of rows) {
    console.log(`  ${r.product.asin} | units=${r.unitsSold} | gross=$${r.grossSales} | orders=${r.orderCount}`);
  }
  const totalUnits = rows.reduce((s, r) => s + r.unitsSold, 0);
  const totalSales = rows.reduce((s, r) => s + parseFloat(r.grossSales.toString()), 0);
  console.log(`  TOTAL: ${totalUnits} units / $${totalSales.toFixed(2)}`);

  // Check how many $0 price orders exist
  const zeroRows = rows.filter(r => parseFloat(r.grossSales.toString()) === 0);
  if (zeroRows.length > 0) {
    console.log("\n  $0 gross sales rows:");
    for (const r of zeroRows) {
      console.log(`    ${r.product.asin} | units=${r.unitsSold} | $0`);
    }
  }

  await p.$disconnect();
}
main();
