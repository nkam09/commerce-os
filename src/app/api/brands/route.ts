import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";

/**
 * GET /api/brands
 * Returns distinct brand names for the authenticated user's products.
 */
export async function GET() {
  try {
    const { userId } = await requireUser();

    const rows = await prisma.product.findMany({
      where: { userId, brand: { not: null }, status: { not: "ARCHIVED" } },
      select: { brand: true },
      distinct: ["brand"],
      orderBy: { brand: "asc" },
    });

    const brands = rows.map((r) => r.brand!);
    return apiSuccess(brands);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
