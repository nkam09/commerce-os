import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getInventoryPlannerData } from "@/lib/services/inventory-service";
import { apiSuccess, apiServerError, parseBrand } from "@/lib/utils/api";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const brand = parseBrand(req.nextUrl.searchParams);
    const data = await getInventoryPlannerData(userId, brand);
    return apiSuccess(data);
  } catch (err) {
    return apiServerError(err);
  }
}
