const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const prod = await p.product.findFirst({ where: { asin: "B0D7NNL4BL" }, select: { id: true, asin: true, sku: true, fnsku: true, title: true } });
  console.log("Product:", JSON.stringify(prod, null, 2));
  await p["$disconnect"]();
}
main();
