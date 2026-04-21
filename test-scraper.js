async function main() {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    // Read from .env.local
    const fs = require("fs");
    const env = fs.readFileSync(".env.local", "utf8");
    const match = env.match(/SCRAPER_API_KEY=(.+)/);
    if (!match) { console.log("No API key found"); return; }
    process.env.SCRAPER_API_KEY = match[1].trim();
  }
  
  const key = process.env.SCRAPER_API_KEY;
  console.log("API key:", key.substring(0, 8) + "...");
  
  // Test 1: account check
  const acct = await fetch(`https://api.scraperapi.com/account?api_key=${key}`);
  console.log("\nAccount status:", acct.status);
  if (acct.ok) {
    const data = await acct.json();
    console.log("Credits remaining:", data.requestLimit - data.requestCount);
    console.log("Plan:", data.subscriptionDate);
  } else {
    console.log("Body:", await acct.text());
  }
  
  // Test 2: try to fetch Amazon reviews page
  const targetUrl = "https://www.amazon.com/product-reviews/B07XYBW774/?pageNumber=1";
  const scrapeUrl = `https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(targetUrl)}&country_code=us`;
  
  console.log("\nTest scrape Amazon...");
  const res = await fetch(scrapeUrl);
  console.log("Response status:", res.status);
  const text = await res.text();
  console.log("First 300 chars:", text.substring(0, 300));
}
main().catch(console.error);
