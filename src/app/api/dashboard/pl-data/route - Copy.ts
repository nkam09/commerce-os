import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getPLColumnsData, type PLGranularity } from "@/lib/services/dashboard-pl-service";
import { apiSuccess, apiServerError, apiUnauthorized, parseBrand } from "@/lib/utils/api";

const VALID_GRANULARITIES = new Set(["daily", "weekly", "monthly"]);

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const raw = req.nextUrl.searchParams.get("granularity") ?? "monthly";
    const granularity: PLGranularity = VALID_GRANULARITIES.has(raw)
      ? (raw as PLGranularity)
      : "monthly";
    const from = req.nextUrl.searchParams.get("from") ?? undefined;
    const to = req.nextUrl.searchParams.get("to") ?? undefined;

    console.log("[pl-data] userId:", userId, "granularity:", granularity, "from:", from, "to:", to);

    const brand = parseBrand(req.nextUrl.searchParams);
    const data = await getPLColumnsData(userId, granularity, from, to, brand);

    console.log("[pl-data] returned", data.columns.length, "columns");
    return apiSuccess(data);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
