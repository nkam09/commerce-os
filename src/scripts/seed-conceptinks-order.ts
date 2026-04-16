/**
 * Seed the ConceptInks supplier order (TAISEI CO., LTD. - JPY).
 * Creates a "ConceptInks" PM space and adds the TE-48054 order.
 * Safe to re-run — upserts by order number.
 *
 * Usage:
 *   npx --yes dotenv-cli -- npx tsx src/scripts/seed-conceptinks-order.ts
 */

import { prisma } from "@/lib/db/prisma";

async function main() {
  // Use the user that owns the Kitchen Strong products
  const ksProduct = await prisma.product.findFirst({
    where: { asin: "B07XYBW774" },
    select: { userId: true },
  });
  if (!ksProduct) throw new Error("No Kitchen Strong product found");
  const userId = ksProduct.userId;
  console.log(`[seed] userId: ${userId}`);

  // Find or create the "ConceptInks" PM space
  let space = await prisma.pMSpace.findFirst({
    where: { userId, name: "ConceptInks" },
  });

  if (!space) {
    const maxOrder = await prisma.pMSpace.aggregate({
      where: { userId },
      _max: { order: true },
    });
    space = await prisma.pMSpace.create({
      data: {
        userId,
        name: "ConceptInks",
        color: "#f97316", // orange
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });
    console.log(`[seed] Created "ConceptInks" space: ${space.id}`);

    // Create a default list for the space
    await prisma.pMList.create({
      data: {
        name: "Tasks",
        spaceId: space.id,
        order: 0,
      },
    });
  } else {
    console.log(`[seed] Using existing "ConceptInks" space: ${space.id}`);
  }

  // Check if order already exists
  const existing = await prisma.supplierOrder.findFirst({
    where: { spaceId: space.id, orderNumber: "TE-48054" },
  });

  if (existing) {
    console.log(`[seed] Order TE-48054 already exists (id: ${existing.id}) — deleting to re-seed`);
    await prisma.supplierOrder.delete({ where: { id: existing.id } });
  }

  // Create the order
  const order = await prisma.supplierOrder.create({
    data: {
      spaceId: space.id,
      orderNumber: "TE-48054",
      supplier: "TAISEI CO., LTD.",
      orderDate: new Date("2026-04-04"),
      deliveryAddress: null,
      terms: "T/T in advance",
      currency: "JPY",
      exchangeRate: 0.006667,
      shippingCost: 0,
      shippingCurrency: "USD",
      shipToAddress: "Rivera Air Freight Corp, 145 W 134th St Ste B, Los Angeles, CA 90061",
      shipMethod: "SEA",
      estProductionDays: null,
      estDeliveryDays: 45, // mid-May from early April
      status: "Pending",
      notes: "Invoice TE-48054. Ship via SEA from Japanese Port to Longbeach Port. ETA mid-May 2026.",
      lineItems: {
        create: [
          {
            asin: "B08H8PKF5W",
            description: "Conceptinks 3pcs marker set",
            quantity: 4000,
            unit: "set",
            unitPrice: 360,
            isOneTimeFee: false,
            sortOrder: 0,
          },
          {
            asin: "",
            description: "Printing Plate Fee Cost (1 color)",
            quantity: 1,
            unit: "lot",
            unitPrice: 15000,
            isOneTimeFee: true,
            sortOrder: 1,
          },
        ],
      },
      payments: {
        create: [
          {
            label: "T/T Upfront (100%)",
            amount: 1455000,
            paidDate: new Date("2026-04-04"),
            sortOrder: 0,
          },
        ],
      },
    },
    include: {
      lineItems: true,
      payments: true,
    },
  });

  const subtotalJPY = order.lineItems.reduce(
    (s, i) => s + i.quantity * Number(i.unitPrice),
    0
  );
  const subtotalUSD = subtotalJPY * 0.006667;

  console.log(`\n[seed] Created order TE-48054:`);
  console.log(`  Supplier: ${order.supplier}`);
  console.log(`  Currency: ${order.currency}`);
  console.log(`  Exchange Rate: ${order.exchangeRate}`);
  console.log(`  Items: ${order.lineItems.length}`);
  for (const item of order.lineItems) {
    const total = item.quantity * Number(item.unitPrice);
    console.log(`    - ${item.description}: ${item.quantity} × ¥${Number(item.unitPrice).toLocaleString()} = ¥${total.toLocaleString()}${item.isOneTimeFee ? " (one-time fee)" : ""}`);
  }
  console.log(`  Subtotal: ¥${subtotalJPY.toLocaleString()} (≈ $${subtotalUSD.toFixed(2)} USD)`);
  console.log(`  Payments: ${order.payments.length}`);
  for (const p of order.payments) {
    console.log(`    - ${p.label}: ¥${Number(p.amount).toLocaleString()}`);
  }
  console.log(`\nDone!`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
