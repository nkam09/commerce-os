import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const userId = process.env.COMMERCE_OS_USER_ID!;
  const products = await prisma.product.findMany({ where: { userId } });
  console.log(`\n${products.length} products in DB:`);
  products.forEach(p => console.log(`  SKU: "${p.sku}"  ASIN: "${p.asin}"  title: "${p.title?.slice(0,40)}"`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
