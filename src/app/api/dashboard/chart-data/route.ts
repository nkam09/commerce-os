import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getChartViewData } from "@/lib/services/dashboard-chart-service";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const from = req.nextUrl.searchParams.get("from") ?? undefined;
    const to = req.nextUrl.searchParams.get("to") ?? undefined;

    console.log("[chart-data] userId:", userId, "from:", from, "to:", to);

    const data = await getChartViewData(userId);

    console.log("[chart-data] months:", data.monthly?.length ?? 0, "products:", data.products?.length ?? 0);
    return apiSuccess(data);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
