/**
 * Scrapes Amazon product reviews via ScraperAPI and persists them.
 *
 * Architecture:
 *   - One ReviewScrapeJob per scrape run (status pending/running/completed/failed)
 *   - Pages fetched one at a time; upserted into `reviews` keyed by
 *     (userId, asin, amazonReviewId) so re-scrapes don't duplicate
 *   - Progress reported back onto the job row (`scrapedCount`, `totalReviews`)
 */
import { prisma } from "@/lib/db/prisma";
import * as cheerio from "cheerio";

const SCRAPER_API_BASE = "https://api.scraperapi.com";
const MAX_PAGES = 500;
const PAGE_TIMEOUT_MS = 60_000;

/* ─── URL + fetch helpers ─────────────────────────────────────────────── */

function buildAmazonReviewUrl(asin: string, page = 1): string {
  return `https://www.amazon.com/product-reviews/${asin}/?pageNumber=${page}&sortBy=recent&reviewerType=all_reviews`;
}

async function fetchViaScraperAPI(url: string): Promise<string> {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) throw new Error("SCRAPER_API_KEY not configured");

  const scraperUrl = `${SCRAPER_API_BASE}?api_key=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}&country_code=us`;

  const res = await fetch(scraperUrl, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ScraperAPI returned ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.text();
}

/* ─── HTML parser ─────────────────────────────────────────────────────── */

export interface ParsedReview {
  amazonReviewId: string;
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string | null;
  reviewDate: Date;
  verifiedPurchase: boolean;
  helpfulVotes: number;
  variant: string | null;
  imageUrls: string[];
  country: string | null;
}

export interface ParsedPage {
  reviews: ParsedReview[];
  totalReviews: number | null;
  hasNextPage: boolean;
}

export function parseReviewsFromHtml(html: string): ParsedPage {
  const $ = cheerio.load(html);
  const reviews: ParsedReview[] = [];

  $('[data-hook="review"]').each((_, el) => {
    const $el = $(el);

    const amazonReviewId = $el.attr("id") || "";
    if (!amazonReviewId) return;

    // Rating ("X.0 out of 5 stars")
    const ratingText = $el
      .find('[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]')
      .first()
      .text();
    const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)\s*out of/);
    const rating = ratingMatch ? Math.round(parseFloat(ratingMatch[1])) : 0;

    // Title — last span within the title element (skip rating prefix spans)
    const titleEl = $el.find('[data-hook="review-title"]');
    const title =
      titleEl.find("span").not('[class*="a-letter-space"]').last().text().trim() || null;

    // Body
    const body = $el.find('[data-hook="review-body"] span').first().text().trim() || null;

    // Author
    const authorName = $el.find(".a-profile-name").first().text().trim() || null;

    // Date + country ("Reviewed in the United States on March 15, 2024")
    const dateText = $el.find('[data-hook="review-date"]').text().trim();
    const dateMatch = dateText.match(/on (.+)$/);
    const countryMatch = dateText.match(/in (?:the )?(.+?) on/);
    const parsed = dateMatch ? new Date(dateMatch[1]) : null;
    const reviewDate = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
    const country = countryMatch ? countryMatch[1] : null;

    // Verified purchase
    const verifiedPurchase = $el.find('[data-hook="avp-badge"]').length > 0;

    // Helpful votes
    const helpfulText = $el.find('[data-hook="helpful-vote-statement"]').text();
    const helpfulMatch = helpfulText.match(/(\d+|One)\s*(?:people|person)/);
    const helpfulVotes = helpfulMatch
      ? helpfulMatch[1] === "One"
        ? 1
        : parseInt(helpfulMatch[1], 10)
      : 0;

    // Variant (format-strip, e.g. "Color: Black, Size: Large")
    const variant = $el.find('[data-hook="format-strip"]').text().trim() || null;

    // Images
    const imageUrls: string[] = [];
    $el
      .find('[data-hook="review-image-tile"] img, .review-image-tile img')
      .each((_i, img) => {
        const src = $(img).attr("src");
        if (src) imageUrls.push(src);
      });

    reviews.push({
      amazonReviewId,
      rating,
      title,
      body,
      authorName,
      reviewDate,
      verifiedPurchase,
      helpfulVotes,
      variant,
      imageUrls,
      country,
    });
  });

  // Total reviews from filter-info text
  const totalText = $('[data-hook="cr-filter-info-review-rating-count"]').text();
  const totalMatch = totalText.match(/([\d,]+)\s*(?:global ratings|total ratings)/i);
  const totalReviews = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ""), 10) : null;

  // Next page detection
  const hasNextPage = $(".a-pagination .a-last").not(".a-disabled").length > 0;

  return { reviews, totalReviews, hasNextPage };
}

/* ─── Main scrape loop ────────────────────────────────────────────────── */

export interface ScrapeResult {
  totalScraped: number;
  newReviews: number;
  pagesFetched: number;
}

export async function scrapeReviewsForAsin(
  userId: string,
  asin: string,
  jobId: string
): Promise<ScrapeResult> {
  let page = 1;
  let totalScraped = 0;
  let newReviews = 0;

  while (true) {
    const url = buildAmazonReviewUrl(asin, page);

    try {
      const html = await fetchViaScraperAPI(url);
      const { reviews, totalReviews, hasNextPage } = parseReviewsFromHtml(html);

      if (page === 1 && totalReviews) {
        await prisma.reviewScrapeJob.update({
          where: { id: jobId },
          data: { totalReviews },
        });
      }

      if (reviews.length === 0) break;

      for (const r of reviews) {
        try {
          const existing = await prisma.review.findUnique({
            where: {
              userId_asin_amazonReviewId: {
                userId,
                asin,
                amazonReviewId: r.amazonReviewId,
              },
            },
            select: { id: true },
          });

          await prisma.review.upsert({
            where: {
              userId_asin_amazonReviewId: {
                userId,
                asin,
                amazonReviewId: r.amazonReviewId,
              },
            },
            create: {
              userId,
              asin,
              scrapeJobId: jobId,
              amazonReviewId: r.amazonReviewId,
              rating: r.rating,
              title: r.title,
              body: r.body,
              authorName: r.authorName,
              reviewDate: r.reviewDate,
              verifiedPurchase: r.verifiedPurchase,
              helpfulVotes: r.helpfulVotes,
              variant: r.variant,
              imageUrls: r.imageUrls,
              country: r.country,
            },
            update: {
              helpfulVotes: r.helpfulVotes,
              rating: r.rating,
            },
          });

          totalScraped++;
          if (!existing) newReviews++;
        } catch (err) {
          console.error(`[scraper] failed to save review ${r.amazonReviewId}:`, err);
        }
      }

      await prisma.reviewScrapeJob.update({
        where: { id: jobId },
        data: { scrapedCount: totalScraped },
      });

      if (!hasNextPage) break;
      page++;

      if (page > MAX_PAGES) {
        console.warn(`[scraper] hit ${MAX_PAGES}-page limit for ASIN ${asin}`);
        break;
      }
    } catch (err) {
      console.error(`[scraper] page ${page} failed:`, err);
      if (page === 1) throw err;
      break;
    }
  }

  return { totalScraped, newReviews, pagesFetched: page };
}
