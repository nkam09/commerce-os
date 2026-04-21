const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const apiKey = env.match(/SCRAPER_API_KEY=(.+)/)[1].trim();

const urls = [
  "https://www.amazon.com/product-reviews/B07XYBW774",
  "https://www.amazon.com/product-reviews/B07XYBW774/",
  "https://www.amazon.com/product-reviews/B07XYBW774/ref=cm_cr_getr_d_paging_btm_next_1",
  "https://www.amazon.com/dp/B07XYBW774",
];

async function test(url) {
  const scrapeUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&country_code=us`;
  const res = await fetch(scrapeUrl);
  const text = await res.text();
  const isReviewsPage = text.includes("review") && text.includes("data-hook");
  console.log(url);
  console.log("  Status:", res.status, "| Has reviews:", isReviewsPage, "| Length:", text.length);
}

(async () => {
  for (const u of urls) {
    await test(u);
    await new Promise(r => setTimeout(r, 1000));
  }
})();
