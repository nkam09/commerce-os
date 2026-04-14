const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
async function main() {
  // 1. All April refunds
  console.log("=== APRIL 2026 REFUNDS ===");
  const aprRefunds = await p.$queryRawUnsafe(`
    SELECT ds.date, p.asin, ds."refundCount"::int as cnt, ds."refundAmount"::float as amt
    FROM daily_sales ds JOIN products p ON ds."productId" = p.id
    WHERE ds."refundCount" > 0 AND ds.date >= '2026-04-01' AND ds.date <= '2026-04-14'
    ORDER BY ds.date, p.asin
  `);
  let aprTotal = 0;
  aprRefunds.forEach(r => {
    aprTotal += r.cnt;
    console.log(r.date?.toISOString().slice(0,10), r.asin, 'count:', r.cnt, 'amt:', r.amt?.toFixed(2));
  });
  console.log("Total Apr refunds:", aprTotal, "(SB: 6)");

  // 2. All March refunds
  console.log("\n=== MARCH 2026 REFUNDS ===");
  const marRefunds = await p.$queryRawUnsafe(`
    SELECT ds.date, p.asin, ds."refundCount"::int as cnt, ds."refundAmount"::float as amt
    FROM daily_sales ds JOIN products p ON ds."productId" = p.id
    WHERE ds."refundCount" > 0 AND ds.date >= '2026-03-01' AND ds.date <= '2026-03-31'
    ORDER BY ds.date, p.asin
  `);
  let marTotal = 0;
  marRefunds.forEach(r => {
    marTotal += r.cnt;
    console.log(r.date?.toISOString().slice(0,10), r.asin, 'count:', r.cnt, 'amt:', r.amt?.toFixed(2));
  });
  console.log("Total Mar refunds:", marTotal, "(SB: 15)");

  // 3. Today's data
  console.log("\n=== TODAY (Apr 14) ===");
  const today = await p.$queryRawUnsafe(`
    SELECT p.asin, ds."grossSales"::float as sales, ds."unitsSold"::int as units, 
           ds."refundCount"::int as refunds, ds."refundAmount"::float as refAmt,
           ds."promoAmount"::float as promo
    FROM daily_sales ds JOIN products p ON ds."productId" = p.id
    WHERE ds.date = '2026-04-14'
    ORDER BY p.asin
  `);
  today.forEach(r => console.log(r.asin, 'sales:', r.sales?.toFixed(2), 'units:', r.units, 'refunds:', r.refunds, 'refAmt:', r.refAmt?.toFixed(2), 'promo:', r.promo?.toFixed(2)));

  // 4. Check which sync job wrote each refund - look at dates that don't match SB
  console.log("\n=== SYNC CURSOR STATE ===");
  const cursors = await p.$queryRawUnsafe(`SELECT "jobName", cursor FROM sync_cursors ORDER BY "jobName"`);
  cursors.forEach(c => {
    const val = typeof c.cursor === 'string' ? c.cursor.slice(0, 60) : String(c.cursor);
    console.log(' ', c.jobName, ':', val);
  });
}
main().catch(console.error).finally(()=>p.$disconnect());
