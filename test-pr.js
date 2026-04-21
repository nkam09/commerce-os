const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const apiKey = env.match(/SCRAPER_API_KEY=(.+)/)[1].trim();

async function test(url) {
  const scrapeUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&country_code=us`;
  const res = await fetch(scrapeUrl, { signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  const reviewCount = (text.match(/data-hook="review"/g) ?? []).length;
  const totalMatch = text.match(/([\d,]+)\s*global ratings/i);
  console.log(url.substring(url.indexOf("amazon.com")));
  console.log("  Status:", res.status, "| Reviews:", reviewCount, "| Total ratings:", totalMatch?.[1] ?? "N/A");
}

(async () => {
  await test("https://www.amazon.com/product-reviews/B07XYBW774/ref=cm_cr_arp_d_paging_btm_next_1?pageNumber=1&sortBy=recent");
  await test("https://www.amazon.com/product-reviews/B07XYBW774/ref=cm_cr_arp_d_viewopt_sr?pageNumber=1");
  await test("https://www.amazon.com/product-reviews/B07XYBW774/ref=acr_dp_hist_5?pageNumber=1");
  await test("https://www.amazon.com/B07XYBW774/reviews/");
  await test("https://www.amazon.com/product-reviews/B07XYBW774/?pageNumber=2");
})();
