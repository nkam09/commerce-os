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

  console.log("Fallback product:", fallbackProductId?.slice(0,8));

  const result = await client.getReports({
    reportTypes: ["GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE"],
    pageSize: 10,
    processingStatuses: ["DONE"],
  });

  console.log("Reports found:", result.reports?.length);

  let totalStorage = 0, totalDisposal = 0, totalSub = 0, totalOther = 0;

  for (const report of (result.reports || [])) {
    const docMeta = await client.getReportDocument(report.reportDocumentId);
    const res = await fetch(docMeta.url);
    const text = await res.text();
    const lines = text.split("\n").filter(l => l.trim());
    const headers = lines[0].split("\t");

    const txIdx = headers.indexOf("transaction-type");
    const skuIdx = headers.indexOf("sku");
    const postedIdx = headers.indexOf("posted-date");
    const otherAmtIdx = headers.indexOf("other-amount");
    const otherReasonIdx = headers.indexOf("other-fee-reason-description");

    // Aggregate by date
    const fees = new Map();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      const txType = (cols[txIdx] || "").trim();
      const otherAmt = parseFloat(cols[otherAmtIdx] || "0") || 0;

      if (otherAmt === 0) continue;

      let feeType = null;
      if (txType === "Storage Fee" || txType === "AWD Storage Fee") feeType = "storage";
      else if (txType === "DisposalComplete") feeType = "disposal";
      else if (txType === "Subscription Fee") feeType = "subscription";
      else continue;

      const posted = cols[postedIdx] || "";
      let dateKey;
      if (posted) {
        const d = new Date(posted);
        dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
      } else {
        // Some settlement rows don't have posted-date, use settlement start date
        continue;
      }

      const sku = (cols[skuIdx] || "").trim();
      const productId = sku ? skuMap.get(sku) : null;
      const effectiveProductId = productId || fallbackProductId;

      const key = effectiveProductId + "::" + dateKey;
      if (!fees.has(key)) fees.set(key, { productId: effectiveProductId, date: dateKey, storage: 0, disposal: 0, subscription: 0 });
      const f = fees.get(key);

      const absAmt = Math.abs(otherAmt);
      if (feeType === "storage") { f.storage += absAmt; totalStorage += absAmt; }
      else if (feeType === "disposal") { f.disposal += absAmt; totalDisposal += absAmt; }
      else if (feeType === "subscription") { f.subscription += absAmt; totalSub += absAmt; }
    }

    console.log("\nReport", report.reportId, ":", fees.size, "fee groups");

    for (const [, f] of fees) {
      if (!f.productId || !mktId) continue;
      const date = new Date(f.date + "T00:00:00Z");

      const existing = await p.dailyFee.findUnique({
        where: { productId_marketplaceId_date: { productId: f.productId, marketplaceId: mktId, date } },
      });

      if (existing) {
        const updates = {};
        if (f.storage > 0) updates.storageFee = Number(existing.storageFee) + f.storage;
        if (f.disposal > 0) updates.otherFees = Number(existing.otherFees) + f.disposal;
        if (f.subscription > 0) updates.otherFees = (updates.otherFees || Number(existing.otherFees)) + f.subscription;

        if (Object.keys(updates).length > 0) {
          await p.dailyFee.update({
            where: { productId_marketplaceId_date: { productId: f.productId, marketplaceId: mktId, date } },
            data: updates,
          });
          console.log("  updated:", f.date, "storage:", f.storage.toFixed(2), "disposal:", f.disposal.toFixed(2), "sub:", f.subscription.toFixed(2));
        }
      } else {
        // Create new fee row
        await p.dailyFee.create({
          data: {
            productId: f.productId,
            marketplaceId: mktId,
            date,
            referralFee: 0,
            fbaFee: 0,
            storageFee: f.storage,
            returnProcessingFee: 0,
            otherFees: f.disposal + f.subscription,
          },
        });
        console.log("  created:", f.date, "storage:", f.storage.toFixed(2), "disposal:", f.disposal.toFixed(2), "sub:", f.subscription.toFixed(2));
      }
    }
  }

  console.log("\n=== DONE ===");
  console.log("Total storage:", totalStorage.toFixed(2));
  console.log("Total disposal:", totalDisposal.toFixed(2));
  console.log("Total subscription:", totalSub.toFixed(2));

  // Verify
  const marchStorage = await p.$queryRawUnsafe('SELECT SUM("storageFee") as s FROM daily_fees WHERE date >= \'2026-03-01\' AND date <= \'2026-03-31\'');
  const aprStorage = await p.$queryRawUnsafe('SELECT SUM("storageFee") as s FROM daily_fees WHERE date >= \'2026-04-01\' AND date <= \'2026-04-10\'');
  console.log("March storage:", Number(marchStorage[0].s).toFixed(2));
  console.log("April storage:", Number(aprStorage[0].s).toFixed(2));

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
