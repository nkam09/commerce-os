import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, parseBrand } from "@/lib/utils/api";
import {
  getDashboardInsight,
  getProductsInsight,
  getInventoryInsight,
  getCashflowInsight,
  getPPCInsight,
  getKeywordsInsight,
} from "@/lib/services/ai-insight-service";

/**
 * GET /api/dashboard/insight?page=dashboard|products|inventory|cashflow|ppc|keywords&brand=...
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const brand = parseBrand(req.nextUrl.searchParams);
    const page = req.nextUrl.searchParams.get("page") ?? "dashboard";

    let message: string;
    switch (page) {
      case "products":
        message = await getProductsInsight(userId, brand);
        break;
      case "inventory":
        message = await getInventoryInsight(userId, brand);
        break;
      case "cashflow":
        message = await getCashflowInsight(userId, brand);
        break;
      case "ppc":
        message = await getPPCInsight(userId, brand);
        break;
      case "keywords":
        message = await getKeywordsInsight(userId, brand);
        break;
      default:
        message = await getDashboardInsight(userId, brand);
        break;
    }

    return apiSuccess({ message });
  } catch (err) {
    return apiServerError(err);
  }
}
