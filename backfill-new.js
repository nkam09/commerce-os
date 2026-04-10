const path = require("path");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  const client = await getSpClientForUser("cmmku4pju00003ghoqyc6s408", "ATVPDKIKX0DER");

  const products = await p.product.findMany({ where: { userId: "cmmku4pju00003ghoqyc6s408" } });
  const skuMap = new Map();
  for (const prod of products) { if (prod.sku) skuMap.set(prod.sku, prod.id); }
  const marketplaces = await p.marketplace.findMany();
  const mktId = marketplaces.find(m => m.code === "ATVPDKIKX0DER")?.id;
  const fallbackProductId = products[0]?.id;

  const result = await client.getReports({
    reportTypes: ["GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE"],
    pageSize: 10,
    processingStatuses: ["DONE"],
  });

  let totalPromo = 0, totalReimb = 0, totalRefComm = 0, totalRefRef = 0;

  for (const report of (result.reports || [])) {
    const docMeta = await client.getReportDocument(report.reportDocumentId);
    const res = await fetch(docMeta.url);
    const text = await res.text();
    const lines = text.split("\n").filter(l => l.trim());
    const headers = lines[0].split("\t");

    const txIdx = headers.indexOf("transaction-type");
    const skuIdx = headers.indexOf("sku");
    const postedIdx = headers.indexOf("posted-date");
    const orderIdx = headers.indexOf("order-id");
    const promoAmtIdx = headers.indexOf("promotion-amount");
    const otherAmtIdx = headers.indexOf("other-amount");
    const feeTypeIdx = headers.indexOf("item-related-fee-type");
    const feeAmtIdx = headers.indexOf("item-related-fee-amount");

    const promos = new Map();
    const reimbs = new Map();
    const refundFees = new Map();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      const txType = (cols[txIdx] || "").trim();
      const sku = (cols[skuIdx] || "").trim();
      const posted = cols[postedIdx] || "";
      if (!posted) continue;
      const d = new Date(posted);
      const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);

      // PROMO from Order rows
      if (txType === "Order") {
        const promoAmt = parseFloat(cols[promoAmtIdx] || "0") || 0;
        if (promoAmt !== 0 && sku) {
          const key = sku + "::" + dateKey;
          if (!promos.has(key)) promos.set(key, { sku, date: dateKey, amount: 0 });
          promos.get(key).amount += Math.abs(promoAmt);
        }
      }

      // REIMBURSEMENTS
      if (["REVERSAL_REIMBURSEMENT", "WAREHOUSE_DAMAGE", "WAREHOUSE_LOST", "FREE_REPLACEMENT_REFUND_ITEMS"].includes(txType)) {
        const otherAmt = parseFloat(cols[otherAmtIdx] || "0") || 0;
        if (otherAmt !== 0) {
          const effectiveProductId = (sku ? skuMap.get(sku) : null) || fallbackProductId;
          const key = effectiveProductId + "::" + dateKey;
          if (!reimbs.has(key)) reimbs.set(key, { productId: effectiveProductId, date: dateKey, amount: 0 });
          reimbs.get(key).amount += otherAmt; // positive = money back
        }
      }

      // REFUND COMMISSION + REFERRAL FEE from Refund rows
      if (txType === "Refund" && sku) {
        const feeType = (cols[feeTypeIdx] || "").trim();
        const feeAmt = parseFloat(cols[feeAmtIdx] || "0") || 0;
        if (feeType && feeAmt !== 0) {
          const key = sku + "::" + dateKey;
          if (!refundFees.has(key)) refundFees.set(key, { sku, date: dateKey, commission: 0, referral: 0 });
          const rf = refundFees.get(key);
          if (feeType === "Commission" || feeType === "RefundCommission") {
            rf.commission += Math.abs(feeAmt);
          } else if (feeType === "Commission" && feeAmt > 0) {
            rf.referral += feeAmt;
          }
          // Referral fee refund: positive Commission amount means refunded referral
          if (feeType === "Commission" && feeAmt > 0) rf.referral += feeAmt;
          if (feeType === "Commission" && feeAmt < 0) rf.commission += Math.abs(feeAmt);
        }
      }
    }

    console.log("Report", report.reportId, "promos:", promos.size, "reimbs:", reimbs.size, "refundFees:", refundFees.size);

    // Upsert promos
    for (const [, pr] of promos) {
      const productId = skuMap.get(pr.sku);
      if (!productId || !mktId) continue;
      const date = new Date(pr.date + "T00:00:00Z");
      await p.$queryRawUnsafe(
        'UPDATE daily_sales SET "promoAmount" = $1 WHERE "productId" = $2 AND "marketplaceId" = $3 AND date = $4',
        pr.amount, productId, mktId, date
      );
      totalPromo += pr.amount;
    }

    // Upsert reimbursements
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
      totalReimb += rb.amount;
    }
  }

  console.log("\n=== DONE ===");
  console.log("Total promo:", totalPromo.toFixed(2));
  console.log("Total reimbursement:", totalReimb.toFixed(2));

  // Verify April
  const aprPromo = await p.$queryRawUnsafe('SELECT SUM("promoAmount") as p FROM daily_sales WHERE date >= \'2026-04-01\' AND date <= \'2026-04-10\'');
  const aprReimb = await p.$queryRawUnsafe('SELECT SUM("reimbursement") as r FROM daily_fees WHERE date >= \'2026-04-01\' AND date <= \'2026-04-10\'');
  console.log("April promo:", Number(aprPromo[0].p).toFixed(2));
  console.log("April reimbursement:", Number(aprReimb[0].r).toFixed(2));

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
