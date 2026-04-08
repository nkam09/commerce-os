const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  // Check if any snapshot was EVER written for this product
  const anySnap = await p.inventorySnapshot.findMany({
    where: { productId: "cmmode3cw0005dh4yfcvj1aa2" },
  });
  console.log("All snapshots for B0D7NNL4BL:", anySnap.length);

  // Check daily_sales to confirm this product has sales (proves it exists in FBA)
  const sales = await p.dailySale.aggregate({
    where: { productId: "cmmode3cw0005dh4yfcvj1aa2", date: { gte: new Date("2026-03-01") } },
    _sum: { unitsSold: true, grossSales: true },
    _count: true,
  });
  console.log("Mar-Apr sales:", JSON.stringify(sales, null, 2));
  
  await p["$disconnect"]();
}
main();
