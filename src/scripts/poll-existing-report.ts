import { AdsApiClient } from "@/lib/amazon/ads-api-client";
import { getAdsConfigForUser } from "@/lib/amazon/get-sp-client-for-user";

async function main() {
  const config = getAdsConfigForUser();
  const client = new AdsApiClient(config);

  const reportId = process.argv[2] || "f8d7209e-efec-4490-b0c5-d08fd5ee0985";
  console.log(`Polling report: ${reportId}`);

  const report = await client.pollReport(reportId, { maxAttempts: 120, intervalMs: 15_000 });
  console.log(`Status: ${report.status} | File size: ${report.fileSize ?? "N/A"}`);

  if (report.url) {
    const buffer = await client.downloadReport(report.url);
    const rows = await client.parseGzipJsonReport(buffer);
    console.log(`Fetched ${rows.length} rows`);
    if (rows.length > 0) {
      console.log(`\nTARGETING FIRST RAW ROW:\n${JSON.stringify(rows[0], null, 2)}`);
    }
  } else {
    console.log("No download URL — report may have failed");
    console.log("Details:", report.statusDetails);
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
