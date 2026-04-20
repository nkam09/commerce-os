import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiNotFound, apiServerError, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }

    const { id } = await ctx.params;
    const job = await prisma.reviewScrapeJob.findFirst({ where: { id, userId } });
    if (!job) return apiNotFound("Scrape job");

    return apiSuccess({
      id: job.id,
      asin: job.asin,
      status: job.status,
      totalReviews: job.totalReviews,
      scrapedCount: job.scrapedCount,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    });
  } catch (err) {
    return apiServerError(err);
  }
}
