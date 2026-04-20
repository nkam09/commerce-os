import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiError, apiServerError, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }

    const sp = req.nextUrl.searchParams;
    const asin = sp.get("asin");
    if (!asin) return apiError("Missing asin", 400);

    const ratingParam = sp.get("rating");
    const verifiedParam = sp.get("verified");
    const search = sp.get("search")?.trim() ?? "";
    const limit = Math.min(parseInt(sp.get("limit") ?? "200", 10) || 200, 1000);

    const where: Prisma.ReviewWhereInput = { userId, asin };
    if (ratingParam && /^[1-5]$/.test(ratingParam)) {
      where.rating = parseInt(ratingParam, 10);
    }
    if (verifiedParam === "true") {
      where.verifiedPurchase = true;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { body: { contains: search, mode: "insensitive" } },
        { authorName: { contains: search, mode: "insensitive" } },
      ];
    }

    // Run list + stats in parallel
    const [reviews, totalCount, ratingBuckets, avgAgg] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { reviewDate: "desc" },
        take: limit,
      }),
      prisma.review.count({ where: { userId, asin } }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { userId, asin },
        _count: { rating: true },
      }),
      prisma.review.aggregate({
        where: { userId, asin },
        _avg: { rating: true },
      }),
    ]);

    const ratingDistribution: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const b of ratingBuckets) {
      ratingDistribution[String(b.rating)] = b._count.rating;
    }

    return apiSuccess({
      reviews: reviews.map((r) => ({
        id: r.id,
        asin: r.asin,
        amazonReviewId: r.amazonReviewId,
        rating: r.rating,
        title: r.title,
        body: r.body,
        authorName: r.authorName,
        reviewDate: r.reviewDate.toISOString(),
        verifiedPurchase: r.verifiedPurchase,
        helpfulVotes: r.helpfulVotes,
        variant: r.variant,
        imageUrls: r.imageUrls,
        country: r.country,
      })),
      stats: {
        totalCount,
        filteredCount: reviews.length,
        avgRating: avgAgg._avg.rating ?? 0,
        ratingDistribution,
      },
    });
  } catch (err) {
    return apiServerError(err);
  }
}
