const path = require("path");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
  const client = await getSpClientForUser("cmmku4pju00003ghoqyc6s408", "ATVPDKIKX0DER");

  const result = await client.getReports({
    reportTypes: ["GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE"],
    pageSize: 10,
    processingStatuses: ["DONE"],
  });

  for (const report of (result.reports || [])) {
    const docMeta = await client.getReportDocument(report.reportDocumentId);
    const res = await fetch(docMeta.url);
    const text = await res.text();
    const lines = text.split("\n").filter(l => l.trim());
    const headers = lines[0].split("\t");
    const txIdx = headers.indexOf("transaction-type");

    // Find non-Order, non-Refund rows
    const interesting = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      const tx = (cols[txIdx] || "").trim();
      if (tx && tx !== "Order" && tx !== "Refund" && tx !== "") {
        interesting.push({ tx, raw: cols });
      }
    }

    if (interesting.length > 0) {
      console.log("\nReport", report.reportId, "- non-order/refund rows:", interesting.length);
      // Show first row of each type with all non-empty columns
      const seen = new Set();
      for (const item of interesting) {
        if (seen.has(item.tx)) continue;
        seen.add(item.tx);
        console.log("  TYPE:", item.tx);
        item.raw.forEach((val, idx) => {
          if (val && val.trim()) console.log("    [" + idx + "] " + headers[idx] + " = " + val.trim());
        });
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
