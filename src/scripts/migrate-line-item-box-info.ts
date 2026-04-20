/**
 * Add carton/box info columns to supplier_order_items.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/migrate-line-item-box-info.ts
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
  console.log("Adding carton/box info columns to supplier_order_items...");
  await addColumn("supplier_order_items", '"unitsPerBox"', "INTEGER");
  await addColumn("supplier_order_items", '"boxLengthIn"', "DECIMAL(8,2)");
  await addColumn("supplier_order_items", '"boxWidthIn"', "DECIMAL(8,2)");
  await addColumn("supplier_order_items", '"boxHeightIn"', "DECIMAL(8,2)");
  await addColumn("supplier_order_items", '"boxWeightLbs"', "DECIMAL(8,2)");

  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'supplier_order_items' ORDER BY ordinal_position"
  );
  console.log("\nsupplier_order_items columns:", cols.map((c) => c.column_name).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
