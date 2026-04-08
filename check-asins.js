const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const products = await p.product.findMany({ select: { asin: true, sku: true } });
  console.log("Known ASINs:", products.map(x => x.asin));
  console.log("Known SKUs:", products.map(x => x.sku));

  const orders = await p.order.findMany({
    where: {
      purchaseDate: { gte: new Date("2026-03-12"), lt: new Date("2026-03-13") },
    },
    select: { amazonOrderId: true, purchaseDate: true, orderStatus: true },
  });
  console.log("\nMarch 12 orders in DB:", orders.length);

  await p["$disconnect"]();
}
main();
