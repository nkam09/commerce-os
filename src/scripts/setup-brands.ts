/**
 * Set up brand field on existing products + create new brand products.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/setup-brands.ts
 */

import { prisma } from "@/lib/db/prisma";

async function main() {
  // Use the user that owns the Kitchen Strong products
  const ksProduct = await prisma.product.findFirst({
    where: { asin: "B07XYBW774" },
    select: { userId: true },
  });
  if (!ksProduct) {
    console.error("No Kitchen Strong product found — cannot determine userId");
    process.exit(1);
  }
  const userId = ksProduct.userId;
  console.log(`userId: ${userId}`);

  // ── 1. Update existing Kitchen Strong products ──────────────────────────
  const ksResult = await prisma.product.updateMany({
    where: { userId, asin: { in: ["B07XYBW774", "B0B27GRHFR", "B0D7NNL4BL"] } },
    data: { brand: "Kitchen Strong" },
  });
  console.log(`Updated ${ksResult.count} Kitchen Strong products`);

  // ── 2. ConceptInks - Tire Marker Pens ───────────────────────────────────
  const tireMarker = await prisma.product.upsert({
    where: { userId_asin: { userId, asin: "B08H8PKF5W" } },
    create: {
      userId,
      asin: "B08H8PKF5W",
      sku: "CI-TIREMARKER-WHITE3PK",
      fnsku: "X005283337",
      title:
        "ConceptInks Premium Tire Marker Pens, White Waterproof Paint Markers For Car Tire Lettering, Made In Japan (3 Pack-White)",
      brand: "ConceptInks",
      status: "ACTIVE",
    },
    update: {
      sku: "CI-TIREMARKER-WHITE3PK",
      fnsku: "X005283337",
      title:
        "ConceptInks Premium Tire Marker Pens, White Waterproof Paint Markers For Car Tire Lettering, Made In Japan (3 Pack-White)",
      brand: "ConceptInks",
      status: "ACTIVE",
    },
  });
  console.log(`Tire Marker: id=${tireMarker.id}, asin=${tireMarker.asin}`);

  // Create product settings for tire marker
  await prisma.productSetting.upsert({
    where: { productId: tireMarker.id },
    create: { productId: tireMarker.id, landedCogs: 2.89 },
    update: { landedCogs: 2.89 },
  });
  console.log(`Tire Marker settings: landedCogs=$2.89`);

  // ── 3. Kleanaza - Portable Bidet ────────────────────────────────────────
  const bidet = await prisma.product.upsert({
    where: { userId_asin: { userId, asin: "B0G312Y7TJ" } },
    create: {
      userId,
      asin: "B0G312Y7TJ",
      sku: "EZTZ1BLK",
      fnsku: "X004X4Z1NV",
      title: "Kleanaza Portable Bidet (Black)",
      brand: "Kleanaza",
      status: "ACTIVE",
    },
    update: {
      sku: "EZTZ1BLK",
      fnsku: "X004X4Z1NV",
      title: "Kleanaza Portable Bidet (Black)",
      brand: "Kleanaza",
      status: "ACTIVE",
    },
  });
  console.log(`Bidet: id=${bidet.id}, asin=${bidet.asin}`);

  // ── Summary ─────────────────────────────────────────────────────────────
  const products = await prisma.product.findMany({
    where: { userId },
    select: { asin: true, brand: true, title: true, status: true },
    orderBy: { brand: "asc" },
  });
  console.log("\nAll products:");
  for (const p of products) {
    console.log(`  [${p.brand ?? "NO BRAND"}] ${p.asin} — ${p.title ?? "(no title)"} (${p.status})`);
  }

  console.log("\nDone!");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
