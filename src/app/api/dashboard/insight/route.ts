import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, parseBrand } from "@/lib/utils/api";
import { getDashboardInsight } from "@/lib/services/ai-insight-service";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const brand = parseBrand(req.nextUrl.searchParams);
    const message = await getDashboardInsight(userId, brand);
    return apiSuccess({ message });
  } catch (err) {
    return apiServerError(err);
  }
}
