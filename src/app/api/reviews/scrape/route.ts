import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiError, apiServerError, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";
import { scrapeReviewsForAsin } from "@/lib/services/review-scraper-service";

export async function POST(req: NextRequest) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }

    const body = await req.json().catch(() => ({}));
    const { asin } = body as { asin?: string };
    if (!asin || typeof asin !== "string" || !/^[A-Z0-9]{10}$/.test(asin)) {
      return apiError("Invalid ASIN — must be 10 uppercase alphanumeric characters", 400);
    }

    const job = await prisma.reviewScrapeJob.create({
      data: { userId, asin, status: "running" },
    });

    // Fire-and-forget: background scrape updates job status as it progresses
    scrapeReviewsForAsin(userId, asin, job.id)
      .then(async (result) => {
        await prisma.reviewScrapeJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            scrapedCount: result.totalScraped,
            completedAt: new Date(),
          },
        });
      })
      .catch(async (err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[reviews/scrape] job ${job.id} failed:`, message);
        await prisma.reviewScrapeJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            errorMessage: message.slice(0, 500),
            completedAt: new Date(),
          },
        });
      });

    return apiSuccess({ jobId: job.id, asin, status: "running" });
  } catch (err) {
    return apiServerError(err);
  }
}
