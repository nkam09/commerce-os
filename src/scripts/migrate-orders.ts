/**
 * Add multi-currency columns to supplier_orders and supplier_order_items.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/migrate-orders.ts
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
  await addColumn("supplier_orders", "currency", "TEXT NOT NULL DEFAULT 'USD'");
  await addColumn("supplier_orders", '"exchangeRate"', "DECIMAL(14,6)");
  await addColumn("supplier_orders", '"shippingCost"', "DECIMAL(14,4) NOT NULL DEFAULT 0");
  await addColumn("supplier_orders", '"shippingCurrency"', "TEXT NOT NULL DEFAULT 'USD'");
  await addColumn("supplier_orders", '"shipToAddress"', "TEXT");
  await addColumn("supplier_orders", '"shipMethod"', "TEXT");

  console.log("Adding columns to supplier_order_items...");
  await addColumn("supplier_order_items", '"isOneTimeFee"', "BOOLEAN NOT NULL DEFAULT false");

  // Verify
  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'supplier_orders' ORDER BY ordinal_position"
  );
  console.log("\nsupplier_orders columns:", cols.map(c => c.column_name).join(", "));

  const itemCols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'supplier_order_items' ORDER BY ordinal_position"
  );
  console.log("supplier_order_items columns:", itemCols.map(c => c.column_name).join(", "));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
