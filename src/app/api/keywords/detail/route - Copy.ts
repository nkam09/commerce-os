import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getKeywordDetail } from "@/lib/services/keyword-service";
import { apiSuccess, apiError, apiServerError, apiUnauthorized, parseBrand } from "@/lib/utils/api";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const sp = req.nextUrl.searchParams;

    const keyword = sp.get("keyword");
    const matchType = sp.get("matchType");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");

    if (!keyword || !matchType) {
      return apiError("keyword and matchType are required", 400);
    }

    const now = new Date();
    const dateTo = toParam ? new Date(toParam + "T23:59:59Z") : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00Z")
      : new Date(now.getTime() - 30 * 86400000);

    console.log("[keywords-detail-api] params:", { keyword: keyword.slice(0, 30), matchType, from: dateFrom.toISOString().slice(0, 10), to: dateTo.toISOString().slice(0, 10) });

    const brand = parseBrand(sp);
    const detail = await getKeywordDetail(userId, keyword, matchType, dateFrom, dateTo, brand);

    console.log("[keywords-detail-api] result:", { campaigns: detail.campaigns.length, spend: detail.totalSpend });

    return apiSuccess(detail);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
