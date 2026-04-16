import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getOverviewDashboard } from "@/lib/services/dashboard-query-service";
import { apiSuccess, apiServerError, apiUnauthorized, parseBrand } from "@/lib/utils/api";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const brand = parseBrand(req.nextUrl.searchParams);
    const data = await getOverviewDashboard(userId, brand);
    return apiSuccess(data);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
