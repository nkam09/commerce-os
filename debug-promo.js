const path = require("path");
require("dotenv").config({ path: ".env.local" });
async function main() {
  const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
  const client = await getSpClientForUser("cmmku4pju00003ghoqyc6s408", "ATVPDKIKX0DER");
  const result = await client.getReports({ reportTypes: ["GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE"], pageSize: 5, processingStatuses: ["DONE"] });
  
  // Find a report with promos (the big one)
  for (const report of (result.reports || [])) {
    const docMeta = await client.getReportDocument(report.reportDocumentId);
    const res = await fetch(docMeta.url);
    const text = await res.text();
    const lines = text.split("\n").filter(l => l.trim());
    const headers = lines[0].split("\t");
    const txIdx = headers.indexOf("transaction-type");
    const promoAmtIdx = headers.indexOf("promotion-amount");
    const promoTypeIdx = headers.indexOf("promotion-type");
    const promoIdIdx = headers.indexOf("promotion-id");
    const priceTypeIdx = headers.indexOf("price-type");
    const skuIdx = headers.indexOf("sku");
    const postedIdx = headers.indexOf("posted-date");
    const orderIdx = headers.indexOf("order-id");
    const feeTypeIdx = headers.indexOf("item-related-fee-type");
    const feeAmtIdx = headers.indexOf("item-related-fee-amount");

    // Find ALL rows with non-zero promotion-amount
    const promoRows = [];
    // Find ALL Refund fee rows
    const refundFeeRows = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      const promoAmt = parseFloat(cols[promoAmtIdx] || "0") || 0;
      if (promoAmt !== 0) {
        promoRows.push({
          tx: cols[txIdx], order: cols[orderIdx], sku: cols[skuIdx],
          priceType: cols[priceTypeIdx], promoAmt, promoType: cols[promoTypeIdx],
          promoId: cols[promoIdIdx], posted: cols[postedIdx]?.slice(0,10)
        });
      }
      if (cols[txIdx] === "Refund" && cols[feeTypeIdx]?.trim()) {
        refundFeeRows.push({
          sku: cols[skuIdx], feeType: cols[feeTypeIdx], feeAmt: parseFloat(cols[feeAmtIdx] || "0"),
          posted: cols[postedIdx]?.slice(0,10), order: cols[orderIdx]
        });
      }
    }

    if (promoRows.length > 0 || refundFeeRows.length > 0) {
      console.log("\nReport", report.reportId, "lines:", lines.length);
      
      if (promoRows.length > 0) {
        console.log("\n=== PROMO ROWS (" + promoRows.length + ") ===");
        // Show first 10
        promoRows.slice(0, 15).forEach(r => console.log(
          "  tx:", r.tx, "| order:", r.order?.slice(-6), "| sku:", r.sku,
          "| priceType:", r.priceType, "| promo:", r.promoAmt,
          "| promoType:", r.promoType, "| posted:", r.posted
        ));
        // Count by priceType
        const byPriceType = {};
        promoRows.forEach(r => {
          const key = r.priceType || "(empty)";
          if (!byPriceType[key]) byPriceType[key] = { count: 0, total: 0 };
          byPriceType[key].count++;
          byPriceType[key].total += Math.abs(r.promoAmt);
        });
        console.log("\n  By priceType:", JSON.stringify(byPriceType));
        
        // Count unique orders with promos
        const uniqueOrders = new Set(promoRows.map(r => r.order));
        console.log("  Unique orders with promos:", uniqueOrders.size);
      }

      if (refundFeeRows.length > 0) {
        console.log("\n=== REFUND FEE ROWS (" + refundFeeRows.length + ") ===");
        refundFeeRows.forEach(r => console.log(
          "  sku:", r.sku, "| feeType:", r.feeType, "| amt:", r.feeAmt, "| posted:", r.posted
        ));
      }
      break; // Only need one report
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
