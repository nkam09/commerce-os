/**
 * Restore real products that were incorrectly deleted,
 * and fix the 4 seed placeholder products with real ASINs.
 * Run with: npx tsx scripts/restore-products.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Real products to restore (were incorrectly deleted)
const RESTORE_PRODUCTS = [
  { sku: "KS-BW20L",     asin: "B0D7NNL4BL", title: "Kitchen Strong 20 Bowl Covers - Reusable Plastic Food Covers with Elastic" },
  { sku: "V7-IMUQ-04E5", asin: "B0B27GRHFR", title: "Kitchen Strong Plastic Bowl Covers, 50 Pack, Stretch Fit, 3 Sizes" },
  { sku: "LS-F7X1-BY3D", asin: "B07XYBW774", title: "Kitchen Strong Plastic Bowl Covers, 100 Pack, Stretch Fit, 3 Sizes" },
  { sku: "EZTZ1",        asin: "B0G2ZPP5RW", title: "Kleanaza Portable Bidet" },
  { sku: "EZTZ1BLK",     asin: "B0G312Y7TJ", title: "Kleanaza Portable Bidet (Black)" },
  // Uncomment if you have these sizes:
  // { sku: "KS-BW20S",  asin: "B0D7NTKJF2", title: "Kitchen Strong 20 Bowl Covers - Small" },
  // { sku: "KS-BW20M",  asin: "B0D7NHPDVH", title: "Kitchen Strong 20 Bowl Covers - Medium" },
];

// Fix placeholder SKUs that have fake ASINs from seed data
// Map: fake placeholder SKU → real ASIN (leave null to skip/delete)
const FIX_PLACEHOLDERS: Record<string, string | null> = {
  "KLZ-50PACK":  null, // delete — V7-IMUQ-04E5 is the real 50-pack
  "KLZ-100PACK": null, // delete — LS-F7X1-BY3D is the real 100-pack
  "CI-MARKERS":  null, // delete — not a real product
  "CI-PRO-SET":  null, // delete — not a real product
};

async function main() {
  const userId = process.env.COMMERCE_OS_USER_ID!;
  if (!userId) throw new Error("COMMERCE_OS_USER_ID not set");

  // Step 1: Delete placeholder seed products
  console.log("Step 1: Removing placeholder seed products...");
  for (const [sku, realAsin] of Object.entries(FIX_PLACEHOLDERS)) {
    if (realAsin !== null) continue; // skip if we're keeping/updating
    const p = await prisma.product.findFirst({ where: { userId, sku } });
    if (!p) { console.log(`  Not found (already gone): ${sku}`); continue; }
    const id = p.id;
    await prisma.inventorySnapshot.deleteMany({ where: { productId: id } });
    await prisma.dailySales.deleteMany({       where: { productId: id } });
    await prisma.dailyFees.deleteMany({        where: { productId: id } });
    await prisma.dailyAds.deleteMany({         where: { productId: id } });
    await prisma.productSettings.deleteMany({  where: { productId: id } });
    await prisma.product.delete({              where: { id } });
    console.log(`  ✓ Deleted placeholder: ${sku}`);
  }

  // Step 2: Restore real products
  console.log("\nStep 2: Restoring real products...");
  for (const p of RESTORE_PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { userId, asin: p.asin } });
    if (existing) {
      // Update SKU/title in case it was registered with wrong SKU
      await prisma.product.update({ where: { id: existing.id }, data: { sku: p.sku, title: p.title, status: "ACTIVE" } });
      console.log(`  Updated: ${p.sku} (${p.asin})`);
      continue;
    }
    const created = await prisma.product.create({
      data: { userId, sku: p.sku, asin: p.asin, title: p.title, status: "ACTIVE" },
    });
    await prisma.productSettings.create({
      data: { productId: created.id, reorderPoint: 50, reorderQty: 200, leadTimeDays: 30, targetMargin: 0.20, maxAcos: 0.25 },
    });
    console.log(`  ✓ Restored: ${p.sku} (${p.asin})`);
  }

  // Step 3: Show final state
  const all = await prisma.product.findMany({ where: { userId } });
  console.log(`\n✓ Done! ${all.length} products in DB:`);
  all.forEach(p => console.log(`  ${p.sku.padEnd(20)} ${p.asin}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
