/**
 * Cleanup script — keeps only the 4 branded SKUs, deletes everything else.
 * Run with: npx tsx scripts/cleanup-products.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Your 4 real branded SKUs — edit this list if needed
const KEEP_SKUS = [
  "KLZ-50PACK",
  "KLZ-100PACK",
  "CI-MARKERS",
  "CI-PRO-SET",
];

async function main() {
  const userId = process.env.COMMERCE_OS_USER_ID;
  if (!userId) throw new Error("COMMERCE_OS_USER_ID not set in .env.local");

  const all = await prisma.product.findMany({ where: { userId } });
  console.log(`Found ${all.length} total products`);

  const toDelete = all.filter(p => !KEEP_SKUS.includes(p.sku));
  const toKeep   = all.filter(p =>  KEEP_SKUS.includes(p.sku));

  console.log(`Keeping:  ${toKeep.map(p => p.sku).join(", ")}`);
  console.log(`Deleting: ${toDelete.length} products`);
  toDelete.forEach(p => console.log(`  - ${p.sku} (${p.asin})`));

  if (toDelete.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Delete in correct order (cascade handles related records)
  const ids = toDelete.map(p => p.id);

  await prisma.inventorySnapshot.deleteMany({ where: { productId: { in: ids } } });
  await prisma.dailySales.deleteMany({       where: { productId: { in: ids } } });
  await prisma.dailyFees.deleteMany({        where: { productId: { in: ids } } });
  await prisma.dailyAds.deleteMany({         where: { productId: { in: ids } } });
  await prisma.productSettings.deleteMany({  where: { productId: { in: ids } } });
  await prisma.product.deleteMany({          where: { id:        { in: ids } } });

  console.log(`\n✓ Deleted ${toDelete.length} products and all their related data.`);
  console.log(`✓ ${toKeep.length} branded products remain.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
