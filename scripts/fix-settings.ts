import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const userId = process.env.COMMERCE_OS_USER_ID!;
  const products = await prisma.product.findMany({ where: { userId }, include: { settings: true } });

  console.log(`Checking ${products.length} products for settings...\n`);

  for (const p of products) {
    if (p.settings) {
      console.log(`✓ ${p.sku} — has settings (landedCogs=${p.settings.landedCogsPerUnit})`);
      continue;
    }
    await prisma.productSettings.create({
      data: {
        productId:           p.id,
        landedCogsPerUnit:   0,
        overheadPerUnit:     0,
        safetyStockDays:     30,
        productionLeadDays:  30,
        shippingLeadDays:    14,
        receivingBufferDays: 7,
        targetMargin:        0.20,
        targetAcos:          0.25,
      },
    });
    console.log(`✓ Created settings for ${p.sku}`);
  }

  // Also clean up orphaned dailySales rows from deleted products
  const productIds = products.map(p => p.id);
  const orphaned = await prisma.dailySales.deleteMany({
    where: { productId: { notIn: productIds } },
  });
  console.log(`\nCleaned up ${orphaned.count} orphaned dailySales rows`);

  const orphanedFees = await prisma.dailyFees.deleteMany({
    where: { productId: { notIn: productIds } },
  });
  console.log(`Cleaned up ${orphanedFees.count} orphaned dailyFees rows`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
