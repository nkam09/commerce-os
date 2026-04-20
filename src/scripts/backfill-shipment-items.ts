/**
 * Backfill SupplierOrderShipmentItem rows for existing shipments.
 *
 * Strategy:
 *   - If the order has exactly ONE product line item (non one-time fee) → assign
 *     all shipment units to that ASIN.
 *   - Otherwise → skip (user will allocate manually in the UI).
 *
 * Idempotent: skips shipments that already have items.
 *
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/backfill-shipment-items.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Loading shipments with related order line items and existing items...");
  const shipments = await prisma.supplierOrderShipment.findMany({
    include: {
      items: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          lineItems: {
            select: { asin: true, isOneTimeFee: true, quantity: true },
          },
        },
      },
    },
  });

  console.log(`Found ${shipments.length} shipments total.`);

  let created = 0;
  let skippedAlreadyHasItems = 0;
  let skippedMultiAsin = 0;
  let skippedNoUnits = 0;
  let skippedNoProductItems = 0;

  for (const s of shipments) {
    if (s.items.length > 0) {
      skippedAlreadyHasItems++;
      continue;
    }
    if (!s.units || s.units <= 0) {
      skippedNoUnits++;
      continue;
    }

    const productItems = s.order.lineItems.filter((li) => !li.isOneTimeFee && li.asin);
    const distinctAsins = new Set(productItems.map((li) => li.asin));

    if (distinctAsins.size === 0) {
      skippedNoProductItems++;
      console.log(
        `  SKIP shipment ${s.id} (order ${s.order.orderNumber}): no product line items`
      );
      continue;
    }

    if (distinctAsins.size > 1) {
      skippedMultiAsin++;
      console.log(
        `  SKIP shipment ${s.id} (order ${s.order.orderNumber}): ${distinctAsins.size} ASINs — manual allocation needed`
      );
      continue;
    }

    const asin = Array.from(distinctAsins)[0];
    await prisma.supplierOrderShipmentItem.create({
      data: {
        shipmentId: s.id,
        asin,
        units: s.units,
      },
    });
    created++;
    console.log(
      `  OK shipment ${s.id} (order ${s.order.orderNumber}): ${s.units} units → ${asin}`
    );
  }

  console.log("\n=== Backfill summary ===");
  console.log(`  Shipments processed:           ${shipments.length}`);
  console.log(`  Items created:                 ${created}`);
  console.log(`  Skipped (already had items):   ${skippedAlreadyHasItems}`);
  console.log(`  Skipped (multi-ASIN order):    ${skippedMultiAsin}`);
  console.log(`  Skipped (no units on shipment): ${skippedNoUnits}`);
  console.log(`  Skipped (no product line items): ${skippedNoProductItems}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
