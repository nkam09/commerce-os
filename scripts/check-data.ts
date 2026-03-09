import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const userId = process.env.COMMERCE_OS_USER_ID!;
  const marketplaceId = process.env.NEXT_PUBLIC_MARKETPLACE_ID!;

  console.log(`\nChecking DB for userId=${userId}, marketplaceId=${marketplaceId}\n`);

  const marketplace = await prisma.marketplace.findMany({ where: { userId } });
  console.log("Marketplaces:", marketplace.map(m => `${m.id} (${m.amazonMarketplaceId})`));

  const products = await prisma.product.findMany({ where: { userId }, include: { settings: true } });
  console.log(`\nProducts: ${products.length}`);
  products.forEach(p => console.log(`  ${p.sku.padEnd(20)} ${p.asin}  settings=${!!p.settings}  id=${p.id}`));

  // Check fees by product
  console.log("\ndailyFees per product:");
  for (const p of products) {
    const fees = await prisma.dailyFees.findMany({ where: { productId: p.id }, take: 3, orderBy: { date: "desc" } });
    if (fees.length > 0) {
      console.log(`  ${p.sku}: ${fees.length} rows, latest referral=${fees[0].referralFees} fba=${fees[0].fbaFees}`);
    } else {
      console.log(`  ${p.sku}: 0 rows`);
    }
  }

  // Check sales by product
  console.log("\ndailySales per product:");
  for (const p of products) {
    const sales = await prisma.dailySales.findMany({ where: { productId: p.id }, take: 3, orderBy: { date: "desc" } });
    if (sales.length > 0) {
      console.log(`  ${p.sku}: ${sales.length} rows, latest grossSales=${sales[0].grossSales} units=${sales[0].unitsSold}`);
    } else {
      console.log(`  ${p.sku}: 0 rows`);
    }
  }

  // Total counts
  const totalFees = await prisma.dailyFees.count();
  const totalSales = await prisma.dailySales.count();
  console.log(`\nTotal dailyFees rows: ${totalFees}`);
  console.log(`Total dailySales rows: ${totalSales}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

