import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Correct SKU mappings: ASIN → real SKU
const CORRECT_SKUS: Record<string, string> = {
  "B07XYBW774": "LS-F7X1-BY3D",   // was "Amazon.Found.B07XYBW774"
  // Add more here if needed
};

async function main() {
  const userId = process.env.COMMERCE_OS_USER_ID!;

  for (const [asin, correctSku] of Object.entries(CORRECT_SKUS)) {
    const p = await prisma.product.findFirst({ where: { userId, asin } });
    if (!p) { console.log(`Not found: ${asin}`); continue; }
    if (p.sku === correctSku) { console.log(`Already correct: ${correctSku}`); continue; }
    await prisma.product.update({ where: { id: p.id }, data: { sku: correctSku } });
    console.log(`✓ Fixed: "${p.sku}" → "${correctSku}" (${asin})`);
  }

  const all = await prisma.product.findMany({ where: { userId } });
  console.log(`\nFinal DB state (${all.length} products):`);
  all.forEach(p => console.log(`  ${p.sku.padEnd(22)} ${p.asin}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
