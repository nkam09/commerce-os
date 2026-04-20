/**
 * Returns the user's known ASINs for the review scraper dropdown:
 *   - All ACTIVE products the user owns
 *   - Plus any ASIN that already has scraped reviews (even if no product row)
 */
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

    const [products, scrapedAsins] = await Promise.all([
      prisma.product.findMany({
        where: { userId, status: "ACTIVE" },
        select: { asin: true, title: true, brand: true },
        orderBy: { title: "asc" },
      }),
      prisma.review.findMany({
        where: { userId },
        distinct: ["asin"],
        select: { asin: true },
      }),
    ]);

    const productAsins = new Set(products.map((p) => p.asin));
    const extras = scrapedAsins
      .map((r) => r.asin)
      .filter((a) => !productAsins.has(a))
      .map((a) => ({ asin: a, title: null as string | null, brand: null as string | null }));

    return apiSuccess({
      asins: [
        ...products.map((p) => ({ asin: p.asin, title: p.title, brand: p.brand })),
        ...extras,
      ],
    });
  } catch (err) {
    return apiServerError(err);
  }
}
