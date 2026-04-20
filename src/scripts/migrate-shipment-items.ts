/**
 * Create supplier_order_shipment_items table.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/migrate-shipment-items.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating supplier_order_shipment_items table...");
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS supplier_order_shipment_items (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "shipmentId" TEXT NOT NULL REFERENCES supplier_order_shipments(id) ON DELETE CASCADE,
        asin TEXT NOT NULL,
        units INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  Created supplier_order_shipment_items table");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists")) {
      console.log("  supplier_order_shipment_items table already exists");
    } else {
      console.error("  ERROR creating table:", msg.slice(0, 200));
    }
  }

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_sosi_shipment ON supplier_order_shipment_items("shipmentId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_sosi_asin ON supplier_order_shipment_items(asin)`
  );
  console.log("  Indexes ensured");

  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'supplier_order_shipment_items'"
  );
  console.log("supplier_order_shipment_items exists:", tables.length > 0);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
