/*
 * FULL DIAGNOSTIC: Commerce OS vs Sellerboard
 * Queries every relevant table and compares line by line
 */

// Sellerboard MTD totals (from CSV export Apr 1-10)
const SB_MTD = {
  sales: 2879.17,
  units: 183,
  refunds: 4,
  refundedAmt: 47.96,
  refundComm: 1.44,
  refundedRef: 7.20,
  refundCostTotal: 42.20,
  promo: 8.90,
  adCost: 480.36,
  fbaFee: 766.57,
  referralFee: 430.77,
  storageFee: 149.63,
  subscription: 39.99,
  awdStorage: 3.78,
  disposal: 2.37,
  reversal: 8.54,
  totalFees: 1384.57,
  cogs: 531.48,
  indirectExp: 366.87,
};

// Sellerboard daily (Apr 1-10)
const SB_DAILY = {
  '2026-04-01': { sales: 272.83, units: 17, refunds: 1, promo: 0.90, adCost: 39.66, fbaFee: 71.73, referralFee: 40.80, storageFee: 0, awdStorage: 0, subscription: 0, disposal: 0, reversal: 0 },
  '2026-04-02': { sales: 141.90, units: 10, refunds: 0, promo: 0, adCost: 46.05, fbaFee: 39.10, referralFee: 21.30, storageFee: 0, awdStorage: 0, subscription: 0, disposal: 0.84, reversal: 0 },
  '2026-04-03': { sales: 242.83, units: 17, refunds: 0, promo: 1.50, adCost: 51.43, fbaFee: 67.05, referralFee: 36.22, storageFee: 0, awdStorage: 0, subscription: 0, disposal: 1.53, reversal: 0 },
  '2026-04-04': { sales: 349.76, units: 24, refunds: 0, promo: 3.30, adCost: 52.84, fbaFee: 96.29, referralFee: 51.99, storageFee: 0, awdStorage: 0, subscription: 39.99, disposal: 0, reversal: 0 },
  '2026-04-05': { sales: 317.82, units: 18, refunds: 1, promo: 0, adCost: 46.73, fbaFee: 80.61, referralFee: 47.70, storageFee: 0, awdStorage: 0, subscription: 0, disposal: 0, reversal: 0 },
  '2026-04-06': { sales: 357.76, units: 24, refunds: 0, promo: 0, adCost: 52.16, fbaFee: 97.42, referralFee: 53.70, storageFee: 149.63, awdStorage: 0, subscription: 0, disposal: 0, reversal: 0 },
  '2026-04-07': { sales: 356.77, units: 23, refunds: 0, promo: 0, adCost: 59.62, fbaFee: 95.64, referralFee: 53.55, storageFee: 0, awdStorage: 3.78, subscription: 0, disposal: 0, reversal: 0 },
  '2026-04-08': { sales: 328.81, units: 19, refunds: 1, promo: 0, adCost: 51.20, fbaFee: 85.13, referralFee: 49.35, storageFee: 0, awdStorage: 0, subscription: 0, disposal: 0, reversal: 0 },
  '2026-04-09': { sales: 413.76, units: 24, refunds: 0, promo: 3.20, adCost: 69.92, fbaFee: 107.10, referralFee: 61.61, storageFee: 0, awdStorage: 0, subscription: 0, disposal: 0, reversal: 8.54 },
  '2026-04-10': { sales: 96.93, units: 7, refunds: 1, promo: 0, adCost: 10.75, fbaFee: 26.50, referralFee: 14.55, storageFee: 0, awdStorage: 0, subscription: 0, disposal: 0, reversal: 0 },
};

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();

  // === DAILY SALES ===
  const salesRows = await p.$queryRawUnsafe(`
    SELECT date, SUM("grossSales") as sales, SUM("unitsSold") as units, 
           SUM("refundCount") as refunds, SUM("refundAmount") as refundAmt,
           SUM("promoAmount") as promo
    FROM daily_sales 
    WHERE date >= '2026-04-01' AND date <= '2026-04-10' 
    GROUP BY date ORDER BY date
  `);

  // === DAILY FEES ===
  const feeRows = await p.$queryRawUnsafe(`
    SELECT date, SUM("referralFee") as referral, SUM("fbaFee") as fba, 
           SUM("storageFee") as storage, SUM("awdStorageFee") as awd,
           SUM("returnProcessingFee") as returnProc, SUM("otherFees") as other,
           SUM("reimbursement") as reimb
    FROM daily_fees 
    WHERE date >= '2026-04-01' AND date <= '2026-04-10' 
    GROUP BY date ORDER BY date
  `);

  // === DAILY ADS ===
  const adRows = await p.$queryRawUnsafe(`
    SELECT date, SUM(spend) as spend 
    FROM daily_ads 
    WHERE date >= '2026-04-01' AND date <= '2026-04-10' 
    GROUP BY date ORDER BY date
  `);

  // === EXPENSES ===
  const expRows = await p.$queryRawUnsafe(`
    SELECT * FROM expenses WHERE "userId" = 'cmmku4pju00003ghoqyc6s408' LIMIT 20
  `);

  // === CURSOR STATE ===
  const cursors = await p.$queryRawUnsafe(`SELECT "jobName", cursor FROM sync_cursors`);

  // Build lookup maps
  const salesMap = {};
  for (const r of salesRows) {
    const d = r.date.toISOString().slice(0, 10);
    salesMap[d] = { sales: Number(r.sales), units: Number(r.units), refunds: Number(r.refunds), refundAmt: Number(r.refundAmt), promo: Number(r.promo) };
  }

  const feeMap = {};
  for (const r of feeRows) {
    const d = r.date.toISOString().slice(0, 10);
    feeMap[d] = { referral: Number(r.referral), fba: Number(r.fba), storage: Number(r.storage), awd: Number(r.awd), other: Number(r.other), reimb: Number(r.reimb) };
  }

  const adMap = {};
  for (const r of adRows) {
    const d = r.date.toISOString().slice(0, 10);
    adMap[d] = Number(r.spend);
  }

  // === COMPARISON ===
  console.log('\n' + '='.repeat(120));
  console.log('DAILY COMPARISON: Commerce OS vs Sellerboard');
  console.log('='.repeat(120));

  const dates = Object.keys(SB_DAILY).sort();
  const diffs = [];

  for (const date of dates) {
    const sb = SB_DAILY[date];
    const cos_s = salesMap[date] || { sales: 0, units: 0, refunds: 0, refundAmt: 0, promo: 0 };
    const cos_f = feeMap[date] || { referral: 0, fba: 0, storage: 0, awd: 0, other: 0, reimb: 0 };
    const cos_ad = adMap[date] || 0;

    const checks = [
      ['Sales', cos_s.sales, sb.sales],
      ['Units', cos_s.units, sb.units],
      ['Refunds', cos_s.refunds, sb.refunds],
      ['Promo', cos_s.promo, sb.promo],
      ['Ad Cost', cos_ad, sb.adCost],
      ['FBA Fee', cos_f.fba, sb.fbaFee],
      ['Referral', cos_f.referral, sb.referralFee],
      ['Storage', cos_f.storage, sb.storageFee],
      ['AWD', cos_f.awd, sb.awdStorage],
      ['Other', cos_f.other, sb.subscription + sb.disposal],
      ['Reimb', cos_f.reimb, sb.reversal],
    ];

    const problems = checks.filter(([name, cos, sb]) => Math.abs(cos - sb) > 0.02);
    if (problems.length > 0) {
      console.log(`\n${date}: ${problems.length} discrepancies`);
      for (const [name, cos, sb] of problems) {
        const diff = cos - sb;
        console.log(`  ${name.padEnd(12)} COS: ${cos.toFixed(2).padStart(10)}  SB: ${sb.toFixed(2).padStart(10)}  DIFF: ${diff.toFixed(2).padStart(10)}`);
        diffs.push({ date, metric: name, cos, sb, diff });
      }
    } else {
      console.log(`${date}: ✓ all match`);
    }
  }

  // === MTD TOTALS ===
  console.log('\n' + '='.repeat(120));
  console.log('MTD TOTALS');
  console.log('='.repeat(120));

  let cosTotalSales = 0, cosTotalUnits = 0, cosTotalRefunds = 0, cosTotalRefundAmt = 0, cosTotalPromo = 0;
  let cosTotalFba = 0, cosTotalRef = 0, cosTotalStorage = 0, cosTotalAwd = 0, cosTotalOther = 0, cosTotalReimb = 0;
  let cosTotalAd = 0;

  for (const date of dates) {
    const s = salesMap[date] || { sales: 0, units: 0, refunds: 0, refundAmt: 0, promo: 0 };
    const f = feeMap[date] || { referral: 0, fba: 0, storage: 0, awd: 0, other: 0, reimb: 0 };
    cosTotalSales += s.sales; cosTotalUnits += s.units; cosTotalRefunds += s.refunds;
    cosTotalRefundAmt += s.refundAmt; cosTotalPromo += s.promo;
    cosTotalFba += f.fba; cosTotalRef += f.referral; cosTotalStorage += f.storage;
    cosTotalAwd += f.awd; cosTotalOther += f.other; cosTotalReimb += f.reimb;
    cosTotalAd += (adMap[date] || 0);
  }

  const mtdChecks = [
    ['Sales', cosTotalSales, SB_MTD.sales],
    ['Units', cosTotalUnits, SB_MTD.units],
    ['Refund Count', cosTotalRefunds, SB_MTD.refunds],
    ['Refund Amount', cosTotalRefundAmt, SB_MTD.refundedAmt],
    ['Promo', cosTotalPromo, SB_MTD.promo],
    ['Ad Cost', cosTotalAd, SB_MTD.adCost],
    ['FBA Fees', cosTotalFba, SB_MTD.fbaFee],
    ['Referral Fees', cosTotalRef, SB_MTD.referralFee],
    ['FBA Storage', cosTotalStorage, SB_MTD.storageFee],
    ['AWD Storage', cosTotalAwd, SB_MTD.awdStorage],
    ['Other (sub+disp)', cosTotalOther, SB_MTD.subscription + SB_MTD.disposal],
    ['Reimbursement', cosTotalReimb, SB_MTD.reversal],
  ];

  for (const [name, cos, sb] of mtdChecks) {
    const match = Math.abs(cos - sb) <= 0.02 ? '✓' : '✗';
    const diff = cos - sb;
    console.log(`${match} ${name.padEnd(18)} COS: ${cos.toFixed(2).padStart(10)}  SB: ${sb.toFixed(2).padStart(10)}  DIFF: ${diff.toFixed(2).padStart(10)}`);
  }

  // === EXPENSES TABLE ===
  console.log('\n' + '='.repeat(120));
  console.log('EXPENSES TABLE');
  console.log('='.repeat(120));
  if (expRows.length === 0) {
    console.log('  (empty - no expenses in DB)');
  } else {
    expRows.forEach(e => console.log(' ', JSON.stringify(e).slice(0, 200)));
  }

  // === CURSOR STATE ===
  console.log('\n' + '='.repeat(120));
  console.log('CURSOR STATE');
  console.log('='.repeat(120));
  cursors.forEach(c => {
    const val = c.cursor || 'NULL';
    const display = val.length > 80 ? val.slice(0, 80) + '...' : val;
    console.log(`  ${c.jobName.padEnd(30)} ${display}`);
  });

  // === ROOT CAUSE ANALYSIS ===
  console.log('\n' + '='.repeat(120));
  console.log('ROOT CAUSE ANALYSIS');
  console.log('='.repeat(120));
  
  if (diffs.length === 0) {
    console.log('  All daily data matches! No issues found.');
  } else {
    // Group by metric
    const byMetric = {};
    for (const d of diffs) {
      if (!byMetric[d.metric]) byMetric[d.metric] = [];
      byMetric[d.metric].push(d);
    }
    
    for (const [metric, items] of Object.entries(byMetric)) {
      console.log(`\n  ${metric}: ${items.length} dates off`);
      for (const item of items) {
        console.log(`    ${item.date}: COS=${item.cos.toFixed(2)} SB=${item.sb.toFixed(2)} (${item.diff > 0 ? '+' : ''}${item.diff.toFixed(2)})`);
      }
    }
  }

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
