const path = require("path");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
  const client = await getSpClientForUser("cmmku4pju00003ghoqyc6s408", "ATVPDKIKX0DER");
  
  const reports = await client.getReports({
    reportTypes: ["GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE"],
    pageSize: 5,
    processingStatuses: ["DONE"],
  });
  
  // Find the biggest report (most lines = most likely to have refunds)
  for (const report of (reports.reports || [])) {
    console.log("Report:", report.reportId, "created:", report.createdTime);
    const docMeta = await client.getReportDocument(report.reportDocumentId);
    const res = await fetch(docMeta.url);
    const text = await res.text();
    const lines = text.split("\n").filter(l => l.trim());
    
    const headers = lines[0].split("\t");
    const txIdx = headers.indexOf("transaction-type");
    const priceTypeIdx = headers.indexOf("price-type");
    
    if (txIdx >= 0) {
      const types = new Set(lines.slice(1).map(l => l.split("\t")[txIdx]).filter(Boolean));
      console.log("  lines:", lines.length, "transaction-types:", [...types]);
      
      // If has Refund, show a sample refund line
      if (types.has("Refund")) {
        const refundLine = lines.find(l => l.split("\t")[txIdx] === "Refund");
        if (refundLine) {
          const cols = refundLine.split("\t");
          console.log("  SAMPLE REFUND:");
          console.log("    transaction-type:", cols[txIdx]);
          console.log("    sku:", cols[21]);
          console.log("    price-type:", cols[priceTypeIdx]);
          console.log("    price-amount:", cols[24]);
          console.log("    posted-date:", cols[17]);
        }
      }
    }
  }
}
main().catch(e => console.error(e));
