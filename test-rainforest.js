const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/RAINFOREST_API_KEY=(.+)/);
if (!match) { console.log("No key"); process.exit(1); }
const key = match[1].trim();

async function main() {
  const url = `https://api.rainforestapi.com/request?api_key=${key}&type=reviews&amazon_domain=amazon.com&asin=B07XYBW774`;
  console.log("Fetching Rainforest API...");
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  console.log("Status:", res.status);
  const data = await res.json();
  
  if (data.request_info?.success) {
    console.log("\n? Success!");
    console.log("Total reviews:", data.summary?.total_reviews);
    console.log("Avg rating:", data.summary?.rating);
    console.log("Reviews returned:", data.reviews?.length);
    console.log("\nFirst review:");
    console.log(JSON.stringify(data.reviews?.[0], null, 2));
  } else {
    console.log("Error:", JSON.stringify(data, null, 2).substring(0, 500));
  }
}
main().catch(console.error);
