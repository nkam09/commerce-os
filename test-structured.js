const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const apiKey = env.match(/SCRAPER_API_KEY=(.+)/)[1].trim();

async function test() {
  // ScraperAPI structured data endpoint for Amazon reviews
  const url = `https://api.scraperapi.com/structured/amazon/review?api_key=${apiKey}&asin=B07XYBW774&country=us`;
  console.log("Testing structured endpoint...");
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Length:", text.length);
  console.log("First 1000 chars:", text.substring(0, 1000));
}
test().catch(console.error);
