/**
 * Seed warehouseName + totalUnitsReceived for existing Kitchen Strong orders.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/seed-warehouse-data.ts
 */
import { prisma } from "@/lib/db/prisma";

async function main() {
  // Update Kitchen Strong orders (Ningbo) — set warehouse to factory
  const ksOrders = await prisma.supplierOrder.findMany({
    where: { supplier: { contains: "Ningbo" } },
    include: { lineItems: true },
  });

  for (const order of ksOrders) {
    const totalUnits = order.lineItems
      .filter((i) => !i.isOneTimeFee)
      .reduce((s, i) => s + i.quantity, 0);
    const isDelivered = order.status === "Delivered";

    await prisma.supplierOrder.update({
      where: { id: order.id },
      data: {
        warehouseName: "Ningbo Doublefly Factory",
        totalUnitsReceived: isDelivered ? totalUnits : 0,
      },
    });
    console.log(`  Updated ${order.orderNumber}: warehouse=Ningbo Doublefly Factory, received=${isDelivered ? totalUnits : 0} (status: ${order.status})`);
  }

  // Update ConceptInks order (TAISEI) — set warehouse to Rivera
  const ciOrders = await prisma.supplierOrder.findMany({
    where: { supplier: { contains: "TAISEI" } },
  });

  for (const order of ciOrders) {
    await prisma.supplierOrder.update({
      where: { id: order.id },
      data: {
        warehouseName: "Rivera Air Freight Corp",
        totalUnitsReceived: 0, // not received yet
      },
    });
    console.log(`  Updated ${order.orderNumber}: warehouse=Rivera Air Freight Corp, received=0 (status: ${order.status})`);
  }

  console.log("\nDone!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
