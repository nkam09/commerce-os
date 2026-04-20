/**
 * Seed carton/box info for existing Kitchen Strong line items (matched by ASIN).
 *
 * Idempotent: runs `updateMany` which simply overwrites the values; safe to re-run.
 *
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/seed-box-info.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type BoxSeed = {
  asin: string;
  label: string;
  unitsPerBox: number;
  boxLengthIn: number;
  boxWidthIn: number;
  boxHeightIn: number;
  boxWeightLbs: number;
};

const SEEDS: BoxSeed[] = [
  { asin: "B07XYBW774", label: "100 BC",  unitsPerBox: 40,  boxLengthIn: 24.9, boxWidthIn: 19.5, boxHeightIn: 14.6, boxWeightLbs: 33.00 },
  { asin: "B0B27GRHFR", label: "50 BC",   unitsPerBox: 50,  boxLengthIn: 19.1, boxWidthIn: 13.0, boxHeightIn: 18.5, boxWeightLbs: 23.15 },
  { asin: "B0D7NNL4BL", label: "20 BCL",  unitsPerBox: 150, boxLengthIn: 18.9, boxWidthIn: 11.9, boxHeightIn: 19.7, boxWeightLbs: 30.90 },
];

async function main() {
  console.log("Seeding carton/box info for Kitchen Strong line items...\n");
  let totalUpdated = 0;
  for (const seed of SEEDS) {
    const result = await prisma.supplierOrderItem.updateMany({
      where: { asin: seed.asin, isOneTimeFee: false },
      data: {
        unitsPerBox: seed.unitsPerBox,
        boxLengthIn: new Prisma.Decimal(seed.boxLengthIn),
        boxWidthIn: new Prisma.Decimal(seed.boxWidthIn),
        boxHeightIn: new Prisma.Decimal(seed.boxHeightIn),
        boxWeightLbs: new Prisma.Decimal(seed.boxWeightLbs),
      },
    });
    totalUpdated += result.count;
    console.log(
      `  ${seed.asin} (${seed.label}): updated ${result.count} line item${result.count === 1 ? "" : "s"}`
    );
    console.log(
      `    units/box=${seed.unitsPerBox}, dims=${seed.boxLengthIn}×${seed.boxWidthIn}×${seed.boxHeightIn} in, weight=${seed.boxWeightLbs} lbs`
    );
  }
  console.log(`\nDone. ${totalUpdated} line item(s) updated in total.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
