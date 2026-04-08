const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const prod = await p.product.findFirst({ where: { asin: "B0D7NNL4BL" }, select: { id: true, asin: true, title: true } });
  console.log("Product:", prod);
  
  const snaps = await p.inventorySnapshot.findMany({
    where: { productId: prod.id },
    orderBy: { snapshotDate: "desc" },
    take: 5,
  });
  console.log("Snapshots:", JSON.stringify(snaps, null, 2));
  
  await p["$disconnect"]();
}
main();
