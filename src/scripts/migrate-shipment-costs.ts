/**
 * Add placementFee and shippingCost columns to supplier_order_shipments.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/migrate-shipment-costs.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function addColumn(table: string, col: string, def: string) {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${def}`);
    console.log(`  OK ${table}.${col}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ERROR ${table}.${col}:`, msg.slice(0, 200));
  }
}

async function main() {
  console.log("Adding placementFee, shippingCost to supplier_order_shipments...");
  await addColumn("supplier_order_shipments", '"placementFee"', "DECIMAL(14,4) NOT NULL DEFAULT 0");
  await addColumn("supplier_order_shipments", '"shippingCost"', "DECIMAL(14,4) NOT NULL DEFAULT 0");

  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'supplier_order_shipments' ORDER BY ordinal_position"
  );
  console.log("\nsupplier_order_shipments columns:", cols.map((c) => c.column_name).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
