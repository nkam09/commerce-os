/**
 * Add transactionFeePct, warehouseName, totalUnitsReceived columns to supplier_orders,
 * and create supplier_order_shipments table.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/migrate-order-shipments.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function addColumn(table: string, col: string, def: string) {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    console.log(`  Added ${table}.${col}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists")) {
      console.log(`  ${table}.${col} already exists`);
    } else {
      console.error(`  ERROR adding ${table}.${col}:`, msg.slice(0, 120));
    }
  }
}

async function main() {
  console.log("Adding columns to supplier_orders...");
  await addColumn("supplier_orders", '"transactionFeePct"', "DECIMAL(8,4) NOT NULL DEFAULT 2.9901");
  await addColumn("supplier_orders", '"warehouseName"', "TEXT");
  await addColumn("supplier_orders", '"totalUnitsReceived"', "INTEGER NOT NULL DEFAULT 0");

  console.log("\nCreating supplier_order_shipments table...");
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS supplier_order_shipments (
        id TEXT PRIMARY KEY,
        "orderId" TEXT NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
        units INTEGER NOT NULL,
        destination TEXT NOT NULL DEFAULT 'FBA',
        "amazonShipId" TEXT,
        "shipDate" DATE,
        "receivedDate" DATE,
        status TEXT NOT NULL DEFAULT 'Pending',
        notes TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  Created supplier_order_shipments table");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists")) {
      console.log("  supplier_order_shipments table already exists");
    } else {
      console.error("  ERROR creating table:", msg.slice(0, 200));
    }
  }

  // Verify
  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'supplier_orders' ORDER BY ordinal_position"
  );
  console.log("\nsupplier_orders columns:", cols.map(c => c.column_name).join(", "));

  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'supplier_order_shipments'"
  );
  console.log("supplier_order_shipments exists:", tables.length > 0);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
