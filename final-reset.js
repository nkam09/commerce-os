/*
 * FINAL DATA RESET
 * 
 * This script:
 * 1. Wipes ALL daily_fees and settlement-sourced daily_sales fields
 * 2. Recalculates FBA + referral fees from order data using per-unit rates
 * 3. Re-applies settlement data: refunds, promo, storage, AWD, subscription, disposal, reimbursement, refund cost
 * 4. Patches items not yet in settlements (recent refunds, storage)
 * 5. Sets the settlement cursor with all processed IDs
 *
 * Run with: npx tsx final-reset.js
 */

const path = require("path");
require("dotenv").config({ path: ".env.local" });

// Verified per-unit rates (match Sellerboard to the penny)
const FEE_RATES = {
  "B07XYBW774": { fba: 5.33, referral: 3.45 },  // LS-F7X1-BY3D
  "B0B27GRHFR": { fba: 4.20, referral: 2.25 },  // V7-IMUQ-04E5
  "B0D7NNL4BL": { fba: 2.91, referral: 1.35 },  // KS-BW20L
};

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
  const p = new PrismaClient();
  const client = await getSpClientForUser("cmmku4pju00003ghoqyc6s408", "ATVPDKIKX0DER");

  // Load product/marketplace maps
  const products = await p.product.findMany({ where: { userId: "cmmku4pju00003ghoqyc6s408" } });
  const skuMap = new Map();
  const asinMap = new Map(); // productId → asin
  for (const prod of products) {
    if (prod.sku) skuMap.set(prod.sku, prod.id);
    if (prod.asin) asinMap.set(prod.id, prod.asin);
  }
  const marketplaces = await p.marketplace.findMany();
  const mktId = marketplaces.find(m => m.code === "ATVPDKIKX0DER")?.id;
  const fallbackProductId = products[0]?.id;

  console.log("Products:", products.map(p => p.sku + "=" + p.asin + "=" + p.id.slice(0, 8)).join(", "));
  console.log("Marketplace:", mktId?.slice(0, 8));

  // ============================================================
  // STEP 1: WIPE ALL SETTLEMENT-SOURCED DATA
  // ============================================================
  console.log("\n=== STEP 1: WIPE ===");

  // Wipe ALL daily_fees completely
  await p.$queryRawUnsafe('UPDATE daily_fees SET "referralFee"=0, "fbaFee"=0, "storageFee"=0, "awdStorageFee"=0, "otherFees"=0, "returnProcessingFee"=0, "reimbursement"=0');
  console.log("  Wiped all daily_fees");

  // Wipe settlement-sourced fields in daily_sales
  await p.$queryRawUnsafe('UPDATE daily_sales SET "refundCount"=0, "refundAmount"=0, "promoAmount"=0, "refundCommission"=0, "refundedReferralFee"=0');
  console.log("  Wiped all settlement fields in daily_sales");

  // ============================================================
  // STEP 2: RECALCULATE FBA + REFERRAL FEES FROM ORDER DATA
  // ============================================================
  console.log("\n=== STEP 2: RECALCULATE FEES FROM ORDERS ===");

  const salesRows = await p.$queryRawUnsafe(`
    SELECT "productId", "marketplaceId", date, "unitsSold"
    FROM daily_sales
    WHERE "unitsSold" > 0
  `);

  let feeRowsWritten = 0;
  for (const row of salesRows) {
    const asin = asinMap.get(row.productId);
    const rates = asin ? FEE_RATES[asin] : null;
    if (!rates) continue;

    const fbaFee = row.unitsSold * rates.fba;
    const referralFee = row.unitsSold * rates.referral;

    await p.dailyFee.upsert({
      where: { productId_marketplaceId_date: { productId: row.productId, marketplaceId: row.marketplaceId, date: row.date } },
      create: { productId: row.productId, marketplaceId: row.marketplaceId, date: row.date, fbaFee, referralFee, storageFee: 0, awdStorageFee: 0, otherFees: 0, returnProcessingFee: 0, reimbursement: 0 },
      update: { fbaFee, referralFee },
    });
    feeRowsWritten++;
  }
  console.log("  Calculated fees for", feeRowsWritten, "daily_sales rows");

  // ============================================================
  // STEP 3: RE-APPLY ALL SETTLEMENT DATA
  // ============================================================
  console.log("\n=== STEP 3: SETTLEMENT DATA ===");

  const result = await client.getReports({
    reportTypes: ["GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE"],
    pageSize: 10,
    processingStatuses: ["DONE"],
  });

  console.log("  Found", result.reports?.length, "settlement reports");

  const processedIds = [];
  let stats = { refunds: 0, promos: 0, storageFees: 0, awdFees: 0, subscriptions: 0, disposals: 0, reimbursements: 0 };

  for (const report of (result.reports || [])) {
    const docMeta = await client.getReportDocument(report.reportDocumentId);
    const res = await fetch(docMeta.url);
    const text = await res.text();
    const lines = text.split("\n").filter(l => l.trim());
    const headers = lines[0].split("\t");

    const col = (name) => headers.indexOf(name);
    const txIdx = col("transaction-type");
    const skuIdx = col("sku");
    const postedIdx = col("posted-date");
    const orderIdx = col("order-id");
    const priceTypeIdx = col("price-type");
    const priceAmtIdx = col("price-amount");
    const feeTypeIdx = col("item-related-fee-type");
    const feeAmtIdx = col("item-related-fee-amount");
    const otherAmtIdx = col("other-amount");
    const promoAmtIdx = col("promotion-amount");
    const promoTypeIdx = col("promotion-type");
    const settlementIdIdx = col("settlement-id");

    const settlementId = lines[1]?.split("\t")[settlementIdIdx] || "";
    processedIds.push(settlementId);

    // Aggregation maps
    const refunds = new Map();     // sku::date → { count, amount, commission, referralFee }
    const promos = new Map();      // sku::date → { amount }
    const fees = new Map();        // productId::date → { storage, awd, disposal, subscription }
    const reimbs = new Map();      // productId::date → { amount }

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      const txType = (cols[txIdx] || "").trim();
      const sku = (cols[skuIdx] || "").trim();
      const posted = (cols[postedIdx] || "").trim();
      if (!posted) continue;

      const d = new Date(posted);
      const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);

      // --- REFUNDS (Refund + Principal → amount; Commission/RefundCommission → fee breakdown) ---
      if (txType === "Refund" && sku) {
        const priceType = (cols[priceTypeIdx] || "").trim();
        const priceAmt = parseFloat(cols[priceAmtIdx] || "0") || 0;
        const feeType = (cols[feeTypeIdx] || "").trim();
        const feeAmt = parseFloat(cols[feeAmtIdx] || "0") || 0;

        const key = sku + "::" + dateKey;
        if (!refunds.has(key)) refunds.set(key, { sku, date: dateKey, amount: 0, orders: new Set(), commission: 0, referralFee: 0 });
        const r = refunds.get(key);

        // Principal = refund amount
        if (priceType.toLowerCase() === "principal" && priceAmt !== 0) {
          r.amount += Math.abs(priceAmt);
          r.orders.add(cols[orderIdx] || "");
        }

        // Commission (positive) = referral fee credited back to seller
        if (feeType === "Commission" && feeAmt > 0) {
          r.referralFee += feeAmt;
        }
        // RefundCommission (negative) = Amazon's commission on the refund
        if (feeType === "RefundCommission" && feeAmt < 0) {
          r.commission += Math.abs(feeAmt);
        }
      }

      // --- PROMO (Order rows with Principal promotion-type only) ---
      if (txType === "Order" && sku) {
        const promoAmt = parseFloat(cols[promoAmtIdx] || "0") || 0;
        const promoType = (cols[promoTypeIdx] || "").trim();
        if (promoAmt !== 0 && promoType === "Principal") {
          const key = sku + "::" + dateKey;
          if (!promos.has(key)) promos.set(key, { sku, date: dateKey, amount: 0 });
          promos.get(key).amount += Math.abs(promoAmt);
        }
      }

      // --- SETTLEMENT FEES (storage, AWD, disposal, subscription) ---
      const otherAmt = parseFloat(cols[otherAmtIdx] || "0") || 0;
      if (otherAmt !== 0) {
        let feeCategory = null;
        if (txType === "Storage Fee") feeCategory = "storage";
        else if (txType === "AWD Storage Fee") feeCategory = "awdStorage";
        else if (txType === "DisposalComplete") feeCategory = "disposal";
        else if (txType === "Subscription Fee") feeCategory = "subscription";

        if (feeCategory) {
          const effectiveProductId = (sku ? skuMap.get(sku) : null) || fallbackProductId;
          const key = effectiveProductId + "::" + dateKey;
          if (!fees.has(key)) fees.set(key, { productId: effectiveProductId, date: dateKey, storage: 0, awd: 0, disposal: 0, subscription: 0 });
          const f = fees.get(key);
          const absAmt = Math.abs(otherAmt);
          if (feeCategory === "storage") f.storage += absAmt;
          else if (feeCategory === "awdStorage") f.awd += absAmt;
          else if (feeCategory === "disposal") f.disposal += absAmt;
          else if (feeCategory === "subscription") f.subscription += absAmt;
        }
      }

      // --- REIMBURSEMENTS ---
      if (["REVERSAL_REIMBURSEMENT", "WAREHOUSE_DAMAGE", "WAREHOUSE_LOST", "FREE_REPLACEMENT_REFUND_ITEMS"].includes(txType)) {
        if (otherAmt > 0) { // positive = money back to seller
          const effectiveProductId = (sku ? skuMap.get(sku) : null) || fallbackProductId;
          const key = effectiveProductId + "::" + dateKey;
          if (!reimbs.has(key)) reimbs.set(key, { productId: effectiveProductId, date: dateKey, amount: 0 });
          reimbs.get(key).amount += otherAmt;
        }
      }
    }

    // --- UPSERT REFUNDS ---
    for (const [, r] of refunds) {
      if (r.amount === 0 && r.orders.size === 0) continue;
      const productId = skuMap.get(r.sku);
      if (!productId || !mktId) continue;
      const date = new Date(r.date + "T00:00:00Z");
      await p.dailySale.upsert({
        where: { productId_marketplaceId_date: { productId, marketplaceId: mktId, date } },
        create: { productId, marketplaceId: mktId, date, unitsSold: 0, orderCount: 0, grossSales: 0, refundCount: r.orders.size, refundAmount: r.amount, refundCommission: r.commission, refundedReferralFee: r.referralFee },
        update: { refundCount: r.orders.size, refundAmount: r.amount, refundCommission: r.commission, refundedReferralFee: r.referralFee },
      });
      stats.refunds++;
    }

    // --- UPSERT PROMOS ---
    for (const [, pr] of promos) {
      const productId = skuMap.get(pr.sku);
      if (!productId || !mktId) continue;
      const date = new Date(pr.date + "T00:00:00Z");
      // Authoritative overwrite
      await p.$queryRawUnsafe(
        'UPDATE daily_sales SET "promoAmount" = $1 WHERE "productId" = $2 AND "marketplaceId" = $3 AND date = $4',
        pr.amount, productId, mktId, date
      );
      stats.promos++;
    }

    // --- UPSERT SETTLEMENT FEES ---
    for (const [, f] of fees) {
      if (!f.productId || !mktId) continue;
      const date = new Date(f.date + "T00:00:00Z");
      const existing = await p.dailyFee.findUnique({
        where: { productId_marketplaceId_date: { productId: f.productId, marketplaceId: mktId, date } },
      });
      if (existing) {
        const updates = {};
        if (f.storage > 0) { updates.storageFee = Number(existing.storageFee) + f.storage; stats.storageFees++; }
        if (f.awd > 0) { updates.awdStorageFee = Number(existing.awdStorageFee) + f.awd; stats.awdFees++; }
        if (f.disposal > 0) { updates.otherFees = Number(existing.otherFees) + f.disposal; stats.disposals++; }
        if (f.subscription > 0) { updates.otherFees = (updates.otherFees ?? Number(existing.otherFees)) + f.subscription; stats.subscriptions++; }
        if (Object.keys(updates).length > 0) {
          await p.dailyFee.update({
            where: { productId_marketplaceId_date: { productId: f.productId, marketplaceId: mktId, date } },
            data: updates,
          });
        }
      } else {
        // Create row for dates with no order data (e.g., storage-only days)
        await p.dailyFee.create({
          data: { productId: f.productId, marketplaceId: mktId, date, referralFee: 0, fbaFee: 0, storageFee: f.storage, awdStorageFee: f.awd, otherFees: f.disposal + f.subscription, returnProcessingFee: 0, reimbursement: 0 },
        });
        if (f.storage > 0) stats.storageFees++;
        if (f.awd > 0) stats.awdFees++;
        if (f.disposal > 0) stats.disposals++;
        if (f.subscription > 0) stats.subscriptions++;
      }
    }

    // --- UPSERT REIMBURSEMENTS ---
    for (const [, rb] of reimbs) {
      if (!rb.productId || !mktId) continue;
      const date = new Date(rb.date + "T00:00:00Z");
      const existing = await p.dailyFee.findUnique({
        where: { productId_marketplaceId_date: { productId: rb.productId, marketplaceId: mktId, date } },
      });
      if (existing) {
        await p.dailyFee.update({
          where: { productId_marketplaceId_date: { productId: rb.productId, marketplaceId: mktId, date } },
          data: { reimbursement: Number(existing.reimbursement) + rb.amount },
        });
      }
      stats.reimbursements++;
    }

    console.log("  Report", report.reportId, "settlement:", settlementId,
      "refunds:", refunds.size, "promos:", promos.size, "fees:", fees.size, "reimbs:", reimbs.size);
  }

  // ============================================================
  // STEP 4: MANUAL PATCHES (not yet in settlements)
  // ============================================================
  console.log("\n=== STEP 4: MANUAL PATCHES ===");

  // Apr 8: KS-BW20L 1 refund $8.99 (not in any settlement yet)
  await p.$queryRawUnsafe('UPDATE daily_sales SET "refundCount"=1, "refundAmount"=8.99 WHERE "productId" LIKE \'cmmode3c%\' AND date=\'2026-04-08\'');
  console.log("  Patched Apr 8 refund: KS-BW20L 1x $8.99");

  // Apr 10: KS-BW20L 1 refund $8.99 (not in any settlement yet)
  await p.$queryRawUnsafe('UPDATE daily_sales SET "refundCount"=1, "refundAmount"=8.99 WHERE "productId" LIKE \'cmmode3c%\' AND date=\'2026-04-10\'');
  console.log("  Patched Apr 10 refund: KS-BW20L 1x $8.99");

  // Apr 6: $149.63 FBA storage (charged mid-month, not in settlement yet)
  await p.$queryRawUnsafe('UPDATE daily_fees SET "storageFee" = "storageFee" + 149.63 WHERE "productId" LIKE \'cmmkxsyu%\' AND date = \'2026-04-06\'');
  console.log("  Patched Apr 6: $149.63 FBA storage");

  // Apr 9: $8.54 reversal reimbursement (not in settlement yet)
  await p.$queryRawUnsafe('UPDATE daily_fees SET "reimbursement" = "reimbursement" + 8.54 WHERE "productId" LIKE \'cmmkxsyu%\' AND date = \'2026-04-09\'');
  console.log("  Patched Apr 9: $8.54 reimbursement");

  // ============================================================
  // STEP 5: SET CURSOR WITH PROCESSED IDS
  // ============================================================
  console.log("\n=== STEP 5: SET CURSOR ===");

  const latestCreated = new Date(result.reports[0]?.createdTime || new Date());
  latestCreated.setHours(latestCreated.getHours() - 24);
  const cursorData = JSON.stringify({
    createdSince: latestCreated.toISOString(),
    processedSettlementIds: processedIds.filter(Boolean),
  });
  await p.$queryRawUnsafe("UPDATE sync_cursors SET cursor = $1 WHERE \"jobName\" = 'sync-settlement-refunds'", cursorData);
  console.log("  Set cursor with", processedIds.filter(Boolean).length, "processed IDs");

  // ============================================================
  // VERIFICATION
  // ============================================================
  console.log("\n=== VERIFICATION ===");

  const aprSales = await p.$queryRawUnsafe('SELECT SUM("grossSales") as sales, SUM("unitsSold") as units, SUM("refundCount") as refunds, SUM("refundAmount") as refundAmt, SUM("promoAmount") as promo, SUM("refundCommission") as refComm, SUM("refundedReferralFee") as refRef FROM daily_sales WHERE date >= \'2026-04-01\' AND date <= \'2026-04-10\'');
  const aprFees = await p.$queryRawUnsafe('SELECT SUM("referralFee") as ref, SUM("fbaFee") as fba, SUM("storageFee") as storage, SUM("awdStorageFee") as awd, SUM("otherFees") as other, SUM("reimbursement") as reimb FROM daily_fees WHERE date >= \'2026-04-01\' AND date <= \'2026-04-10\'');
  const aprAds = await p.$queryRawUnsafe('SELECT SUM(spend) as spend FROM daily_ads WHERE date >= \'2026-04-01\' AND date <= \'2026-04-10\'');

  const s = aprSales[0], f = aprFees[0], a = aprAds[0];

  console.log("\n  METRIC              COS          SELLERBOARD   MATCH?");
  console.log("  ─────────────────── ──────────── ──────────── ──────");

  const checks = [
    ["Refund Count", Number(s.refunds), 4],
    ["Refund Amount", Number(s.refundAmt), 47.96],
    ["Refund Commission", Number(s.refComm), 1.44],
    ["Refunded Ref Fee", Number(s.refRef), 7.20],
    ["Promo", Number(s.promo), 8.90],
    ["FBA Storage", Number(f.storage), 149.63],
    ["AWD Storage", Number(f.awd), 3.78],
    ["Other (sub+disp)", Number(f.other), 42.36],
    ["Reimbursement", Number(f.reimb), 8.54],
  ];

  let allMatch = true;
  for (const [name, cos, sb] of checks) {
    const match = Math.abs(cos - sb) <= 0.02;
    if (!match) allMatch = false;
    const icon = match ? "✓" : "✗";
    console.log(`  ${icon} ${name.padEnd(20)} ${cos.toFixed(2).padStart(12)} ${sb.toFixed(2).padStart(12)}  ${match ? "" : "DIFF: " + (cos - sb).toFixed(2)}`);
  }

  console.log("\n  Stats:", JSON.stringify(stats));
  console.log("\n  " + (allMatch ? "ALL SETTLEMENT DATA MATCHES!" : "SOME ITEMS DON'T MATCH — check above"));

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
