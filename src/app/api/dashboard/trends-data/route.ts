import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getTrendsViewData } from "@/lib/services/dashboard-trends-service";
import { apiSuccess, apiServerError, apiUnauthorized, parseBrand } from "@/lib/utils/api";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const range = req.nextUrl.searchParams.get("range") ?? "12m";
    const metric = req.nextUrl.searchParams.get("metric") ?? "grossSales";
    const from = req.nextUrl.searchParams.get("from") ?? undefined;
    const to = req.nextUrl.searchParams.get("to") ?? undefined;

    console.log("[trends-data] userId:", userId, "range:", range, "metric:", metric, "from:", from, "to:", to);

    const brand = parseBrand(req.nextUrl.searchParams);
    const data = await getTrendsViewData(userId, brand);

    console.log("[trends-data] monthly count:", data?.monthly?.length ?? 0);
    return apiSuccess(data);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
