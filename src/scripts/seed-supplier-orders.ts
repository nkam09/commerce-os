/**
 * Seed historical supplier orders.
 *
 * Usage:
 *   npx --yes dotenv-cli -e .env.local -- npx tsx src/scripts/seed-supplier-orders.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find the first user
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No user found — run the app first");

  console.log(`[seed] user: ${user.id} (${user.clerkId})`);

  // Find or create the "Supplier Orders" space
  let space = await prisma.pMSpace.findFirst({
    where: { userId: user.id, name: "Supplier Orders" },
  });

  if (!space) {
    const maxOrder = await prisma.pMSpace.aggregate({
      where: { userId: user.id },
      _max: { order: true },
    });
    space = await prisma.pMSpace.create({
      data: {
        userId: user.id,
        name: "Supplier Orders",
        color: "#f59e0b", // amber
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
    console.log(`[seed] created space: ${space.id}`);
  } else {
    console.log(`[seed] found existing space: ${space.id}`);
  }

  // Delete existing orders in the space (idempotent re-run)
  const deleted = await prisma.supplierOrder.deleteMany({
    where: { spaceId: space.id },
  });
  if (deleted.count > 0) {
    console.log(`[seed] deleted ${deleted.count} existing orders`);
  }

  // ── Order 1 ──────────────────────────────────────────────────────────────
  const order1 = await prisma.supplierOrder.create({
    data: {
      spaceId: space.id,
      orderNumber: "#239755094501025605",
      supplier: "Ningbo Doublefly Import And Export Co., Ltd",
      orderDate: new Date("2025-02-04"),
      deliveryAddress: "PSC2, 1351 S Road 40 E, PASCO, WA, 99301",
      amazonOrderId: "FBA18V3PBJ97",
      amazonRefId: "747VT3OV",
      terms: "50/50 Upfront/Before Delivery",
      actProductionEnd: new Date("2025-03-05"),
      actDeliveryDate: new Date("2025-04-08"),
      status: "Delivered",
      lineItems: {
        create: [
          { asin: "B07XYBW774", description: "100 BC", quantity: 1200, unitPrice: 4.865, sortOrder: 0 },
          { asin: "B0B27GRHFR", description: "50 BC", quantity: 900, unitPrice: 2.895, sortOrder: 1 },
          { asin: "B0D7NNL4BL", description: "20 BCL", quantity: 900, unitPrice: 1.55, sortOrder: 2 },
        ],
      },
      payments: {
        create: [
          { label: "Upfront Payment", amount: 5066.34, paidDate: new Date("2025-02-04"), sortOrder: 0 },
          { label: "Payment", amount: 5066.34, paidDate: new Date("2025-03-05"), sortOrder: 1 },
        ],
      },
    },
  });
  console.log(`[seed] order 1: ${order1.id} (${order1.orderNumber})`);

  // ── Order 2 (Sheet4) ─────────────────────────────────────────────────────
  const order2 = await prisma.supplierOrder.create({
    data: {
      spaceId: space.id,
      orderNumber: "#247061830001025605",
      supplier: "Ningbo Doublefly Import And Export Co., Ltd",
      orderDate: new Date("2025-03-24"),
      deliveryAddress: "IUSR, 1120 Mt Olive Rd, COWPENS, SC, 29330",
      amazonOrderId: "STAR-WBBWMBE2XXEZM",
      amazonRefId: "8AZPXR4F",
      terms: "50/50 Upfront/Before Delivery",
      actProductionEnd: new Date("2025-05-16"),
      actDeliveryDate: new Date("2025-06-28"),
      status: "Delivered",
      lineItems: {
        create: [
          { asin: "B07XYBW774", description: "100 BC", quantity: 2000, unitPrice: 4.365, sortOrder: 0 },
          { asin: "B0B27GRHFR", description: "50 BC", quantity: 1000, unitPrice: 2.65, sortOrder: 1 },
          { asin: "B0D7NNL4BL", description: "20 BCL", quantity: 2250, unitPrice: 1.4, sortOrder: 2 },
        ],
      },
      payments: {
        create: [
          { label: "Upfront Payment", amount: 7482.23, paidDate: new Date("2025-03-24"), sortOrder: 0 },
          { label: "Payment", amount: 7482.23, paidDate: new Date("2025-05-16"), sortOrder: 1 },
        ],
      },
    },
  });
  console.log(`[seed] order 2: ${order2.id} (${order2.orderNumber})`);

  // ── Order 3 (Sheet3) ─────────────────────────────────────────────────────
  const order3 = await prisma.supplierOrder.create({
    data: {
      spaceId: space.id,
      orderNumber: "#276220490001025605",
      supplier: "Ningbo Doublefly Import And Export Co., Ltd",
      orderDate: new Date("2025-09-12"),
      deliveryAddress: "TCY1 - 2690 East Arch Airport Road 95206",
      amazonOrderId: "FBA1926J0B8M",
      amazonRefId: "1FT8R5EQ",
      terms: "50/50 Upfront/Before Delivery",
      actProductionEnd: new Date("2025-10-08"),
      actDeliveryDate: new Date("2025-11-04"),
      status: "Delivered",
      lineItems: {
        create: [
          { asin: "B07XYBW774", description: "100 BC", quantity: 2520, unitPrice: 4.365, sortOrder: 0 },
          { asin: "B0B27GRHFR", description: "50 BC", quantity: 2500, unitPrice: 2.65, sortOrder: 1 },
          { asin: "B0D7NNL4BL", description: "20 BCL", quantity: 0, unitPrice: 1.4, sortOrder: 2 },
        ],
      },
      payments: {
        create: [
          { label: "Upfront Payment", amount: 9075.90, paidDate: new Date("2025-09-12"), sortOrder: 0 },
          { label: "Payment", amount: 9075.90, paidDate: new Date("2025-10-08"), sortOrder: 1 },
        ],
      },
    },
  });
  console.log(`[seed] order 3: ${order3.id} (${order3.orderNumber})`);

  // ── Order 4 (Sheet2 — current/pending) ────────────────────────────────────
  const order4 = await prisma.supplierOrder.create({
    data: {
      spaceId: space.id,
      orderNumber: "#292675263501025605",
      supplier: "Ningbo Doublefly Import And Export Co., Ltd",
      orderDate: new Date("2026-03-01"),
      terms: "30/70 Upfront/Before Delivery",
      status: "In Production",
      lineItems: {
        create: [
          { asin: "B07XYBW774", description: "100 BC", quantity: 2520, unitPrice: 4.365, sortOrder: 0 },
          { asin: "B0B27GRHFR", description: "50 BC", quantity: 2500, unitPrice: 2.65, sortOrder: 1 },
          { asin: "B0D7NNL4BL", description: "20 BCL", quantity: 1350, unitPrice: 1.4, sortOrder: 2 },
        ],
      },
      payments: {
        create: [
          { label: "Upfront Payment", amount: 6029.49, paidDate: new Date("2026-03-01"), sortOrder: 0 },
        ],
      },
    },
  });
  console.log(`[seed] order 4: ${order4.id} (${order4.orderNumber})`);

  console.log("[seed] done — 4 supplier orders seeded");
}

main()
  .catch((err) => {
    console.error("[seed] fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
