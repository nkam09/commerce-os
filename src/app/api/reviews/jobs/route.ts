import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }

    const jobs = await prisma.reviewScrapeJob.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 25,
    });

    return apiSuccess(
      jobs.map((j) => ({
        id: j.id,
        asin: j.asin,
        status: j.status,
        totalReviews: j.totalReviews,
        scrapedCount: j.scrapedCount,
        errorMessage: j.errorMessage,
        startedAt: j.startedAt.toISOString(),
        completedAt: j.completedAt ? j.completedAt.toISOString() : null,
      }))
    );
  } catch (err) {
    return apiServerError(err);
  }
}
