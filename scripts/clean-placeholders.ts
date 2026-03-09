import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Products that had REAL sales in finances (only these 3 had real data)
const REAL_SALES_SKUS = ["V7-IMUQ-04E5", "LS-F7X1-BY3D", "KS-BW20L"];

async function main() {
  const userId = process.env.COMMERCE_OS_USER_ID!;
  const products = await prisma.product.findMany({ where: { userId } });

  const realSkus   = new Set(REAL_SALES_SKUS);
  const noSalesPids = products.filter(p => !realSkus.has(p.sku)).map(p => p.id);

  console.log("Products with no real sales (will clear placeholder data):");
  products.filter(p => !realSkus.has(p.sku)).forEach(p => console.log(`  ${p.sku}`));

  // Delete placeholder dailySales for products with no real sales
  const deleted = await prisma.dailySales.deleteMany({
    where: { productId: { in: noSalesPids } },
  });
  console.log(`\nDeleted ${deleted.count} placeholder dailySales rows`);

  // Also verify real products have fee data
  console.log("\nFee data check:");
  for (const p of products.filter(p => realSkus.has(p.sku))) {
    const fees = await prisma.dailyFees.findMany({
      where: { productId: p.id },
      orderBy: { date: "desc" },
      take: 1,
    });
    if (fees.length > 0) {
      const f = fees[0];
      console.log(`  ${p.sku}: referral=$${f.referralFees} fba=$${f.fbaFees} ✓`);
    } else {
      console.log(`  ${p.sku}: NO FEE DATA ✗`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
