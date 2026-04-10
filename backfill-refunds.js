const path = require("path");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  const client = await getSpClientForUser("cmmku4pju00003ghoqyc6s408", "ATVPDKIKX0DER");

  // Get all settlement reports
  const result = await client.getReports({
    reportTypes: ["GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE"],
    pageSize: 10,
    processingStatuses: ["DONE"],
  });

  const skuMap = new Map();
  const products = await p.product.findMany({ where: { userId: "cmmku4pju00003ghoqyc6s408" } });
  for (const prod of products) {
    if (prod.sku) skuMap.set(prod.sku, prod.id);
  }
  const marketplaces = await p.marketplace.findMany();
  const mktId = marketplaces.find(m => m.code === "ATVPDKIKX0DER")?.id;

  console.log("Products:", products.map(p => p.sku + "=" + p.id.slice(0,8)).join(", "));
  console.log("Marketplace:", mktId?.slice(0,8));
  console.log("Reports:", result.reports?.length);

  let totalRefundRows = 0;
  let totalFeeAdj = 0;

  for (const report of (result.reports || [])) {
    const docMeta = await client.getReportDocument(report.reportDocumentId);
    const res = await fetch(docMeta.url);
    const text = await res.text();
    const lines = text.split("\n").filter(l => l.trim());
    const headers = lines[0].split("\t");

    const txIdx = headers.indexOf("transaction-type");
    const skuIdx = headers.indexOf("sku");
    const priceTypeIdx = headers.indexOf("price-type");
    const priceAmtIdx = headers.indexOf("price-amount");
    const postedIdx = headers.indexOf("posted-date");
    const orderIdx = headers.indexOf("order-id");
    const feeTypeIdx = headers.indexOf("item-related-fee-type");
    const feeAmtIdx = headers.indexOf("item-related-fee-amount");

    // Aggregate refunds by sku+date
    const refunds = new Map();
    const feeAdj = new Map();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      if (cols[txIdx] !== "Refund") continue;

      const sku = (cols[skuIdx] || "").trim();
      if (!sku) continue;

      const posted = cols[postedIdx] || "";
      // Convert to Pacific date
      const d = new Date(posted);
      const pacific = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
      const dateKey = pacific; // YYYY-MM-DD

      const key = sku + "::" + dateKey;
      const priceType = (cols[priceTypeIdx] || "").trim().toLowerCase();
      const priceAmt = parseFloat(cols[priceAmtIdx] || "0") || 0;
      const feeType = (cols[feeTypeIdx] || "").trim();
      const feeAmt = parseFloat(cols[feeAmtIdx] || "0") || 0;

      // Refund principal
      if (priceType === "principal" && priceAmt !== 0) {
        if (!refunds.has(key)) refunds.set(key, { sku, date: dateKey, amount: 0, orders: new Set() });
        const r = refunds.get(key);
        r.amount += Math.abs(priceAmt);
        r.orders.add(cols[orderIdx] || "");
      }

      // Fee adjustments
      if (feeType && feeAmt !== 0) {
        if (!feeAdj.has(key)) feeAdj.set(key, { sku, date: dateKey, referral: 0, fba: 0, other: 0 });
        const f = feeAdj.get(key);
        if (feeType === "Commission") f.referral += feeAmt;
        else if (feeType.includes("FBA")) f.fba += feeAmt;
        else f.other += feeAmt;
      }
    }

    console.log("\nReport", report.reportId, ":", refunds.size, "refund groups,", feeAdj.size, "fee adj groups");

    // Upsert refunds
    for (const [, r] of refunds) {
      const productId = skuMap.get(r.sku);
      if (!productId || !mktId) { console.log("  skip unknown sku:", r.sku); continue; }
      const date = new Date(r.date + "T00:00:00Z");

      await p.dailySale.upsert({
        where: { productId_marketplaceId_date: { productId, marketplaceId: mktId, date } },
        create: { productId, marketplaceId: mktId, date, unitsSold: 0, orderCount: 0, grossSales: 0, refundCount: r.orders.size, refundAmount: r.amount },
        update: { refundCount: r.orders.size, refundAmount: r.amount },
      });
      console.log("  refund:", r.sku, r.date, "count:", r.orders.size, "amount:", r.amount.toFixed(2));
      totalRefundRows++;
    }

    // Apply fee adjustments
    for (const [, f] of feeAdj) {
      const productId = skuMap.get(f.sku);
      if (!productId || !mktId) continue;
      const date = new Date(f.date + "T00:00:00Z");

      const existing = await p.dailyFee.findUnique({
        where: { productId_marketplaceId_date: { productId, marketplaceId: mktId, date } },
      });
      if (!existing) continue;

      const newRef = Math.max(0, Number(existing.referralFee) - f.referral);
      const newFba = Math.max(0, Number(existing.fbaFee) - f.fba);
      const newOther = Math.max(0, Number(existing.otherFees) - f.other);

      await p.dailyFee.update({
        where: { productId_marketplaceId_date: { productId, marketplaceId: mktId, date } },
        data: { referralFee: newRef, fbaFee: newFba, otherFees: newOther },
      });
      console.log("  fee adj:", f.sku, f.date, "ref:", f.referral.toFixed(2), "fba:", f.fba.toFixed(2));
      totalFeeAdj++;
    }
  }

  console.log("\n=== DONE ===");
  console.log("Total refund rows:", totalRefundRows);
  console.log("Total fee adjustments:", totalFeeAdj);

  // Verify
  const check = await p.$queryRawUnsafe('SELECT COUNT(*) as cnt, SUM("refundCount") as units, SUM("refundAmount") as amt FROM daily_sales WHERE "refundCount" > 0');
  console.log("DB check:", check);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
