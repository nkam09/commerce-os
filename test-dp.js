const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const apiKey = env.match(/SCRAPER_API_KEY=(.+)/)[1].trim();

async function main() {
  const url = "https://www.amazon.com/dp/B07XYBW774";
  const scrapeUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&country_code=us`;
  
  console.log("Fetching product page...");
  const res = await fetch(scrapeUrl, { signal: AbortSignal.timeout(60_000) });
  const html = await res.text();
  
  // How many reviews embedded?
  const reviewMatches = html.match(/data-hook="review"/g);
  console.log("Reviews with data-hook on page:", reviewMatches?.length ?? 0);
  
  // Look for "See all reviews" link
  const seeAllMatch = html.match(/href="([^"]*reviews[^"]*)"[^>]*>\s*See all reviews/i);
  console.log("\nSee all reviews link:", seeAllMatch?.[1] ?? "NOT FOUND");
  
  // Look for the current review URL pattern
  const reviewLinks = [...html.matchAll(/href="(\/[^"]*review[^"]*)"/g)].slice(0, 10);
  console.log("\nSample review links found:");
  reviewLinks.forEach(m => console.log("  ", m[1]));
  
  // Check if there is a "customer reviews" section
  const customerReviewsMatch = html.match(/customerReviews[^"]{0,100}/);
  console.log("\ncustomerReviews match:", customerReviewsMatch?.[0]);
  
  // Look for JSON-embedded reviews
  const jsonReviewMatch = html.match(/"reviews"\s*:\s*\[.{0,200}/);
  console.log("\nJSON reviews match:", jsonReviewMatch?.[0]?.substring(0, 200));
  
  // Save HTML to file for inspection
  fs.writeFileSync("dp-sample.html", html);
  console.log("\nSaved full HTML to dp-sample.html for inspection");
}
main().catch(console.error);
