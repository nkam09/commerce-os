/**
 * Create review_scrape_jobs and reviews tables.
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/migrate-reviews.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run(sql: string, label: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`  OK ${label}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ERROR ${label}: ${msg.slice(0, 200)}`);
  }
}

async function main() {
  console.log("Creating review_scrape_jobs...");
  await run(
    `CREATE TABLE IF NOT EXISTS review_scrape_jobs (
       id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       asin TEXT NOT NULL,
       status TEXT DEFAULT 'pending',
       "totalReviews" INTEGER,
       "scrapedCount" INTEGER DEFAULT 0,
       "errorMessage" TEXT,
       "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
       "completedAt" TIMESTAMP(3)
     )`,
    "table review_scrape_jobs"
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_rsj_user_asin ON review_scrape_jobs("userId", asin)`,
    "idx_rsj_user_asin"
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_rsj_user_started ON review_scrape_jobs("userId", "startedAt")`,
    "idx_rsj_user_started"
  );

  console.log("\nCreating reviews...");
  await run(
    `CREATE TABLE IF NOT EXISTS reviews (
       id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       asin TEXT NOT NULL,
       "scrapeJobId" TEXT REFERENCES review_scrape_jobs(id) ON DELETE SET NULL,
       "amazonReviewId" TEXT NOT NULL,
       rating INTEGER NOT NULL,
       title TEXT,
       body TEXT,
       "authorName" TEXT,
       "reviewDate" TIMESTAMP(3) NOT NULL,
       "verifiedPurchase" BOOLEAN DEFAULT false,
       "helpfulVotes" INTEGER DEFAULT 0,
       variant TEXT,
       "imageUrls" TEXT[] DEFAULT '{}',
       country TEXT,
       "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
       UNIQUE("userId", asin, "amazonReviewId")
     )`,
    "table reviews"
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_reviews_user_asin ON reviews("userId", asin)`,
    "idx_reviews_user_asin"
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_reviews_user_asin_date ON reviews("userId", asin, "reviewDate")`,
    "idx_reviews_user_asin_date"
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_reviews_user_asin_rating ON reviews("userId", asin, rating)`,
    "idx_reviews_user_asin_rating"
  );

  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('reviews', 'review_scrape_jobs') ORDER BY tablename"
  );
  console.log("\nTables present:", tables.map((t) => t.tablename).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
