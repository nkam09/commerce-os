const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const apiKey = env.match(/SCRAPER_API_KEY=(.+)/)[1].trim();

async function test() {
  const target = "https://www.amazon.com/product-reviews/B07XYBW774/?pageNumber=1";
  const url = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(target)}&country_code=us&premium=true`;
  console.log("Testing with premium=true (residential proxy)...");
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  console.log("Status:", res.status);
  const text = await res.text();
  const reviewCount = (text.match(/data-hook="review"/g) ?? []).length;
  console.log("Length:", text.length, "| Reviews found:", reviewCount);
  console.log("First 300 chars:", text.substring(0, 300).replace(/\s+/g, " "));
}
test().catch(console.error);
