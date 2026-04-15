import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, parseBrand } from "@/lib/utils/api";
import { getRestockData } from "@/lib/services/restock-service";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const brand = parseBrand(req.nextUrl.searchParams);
    const data = await getRestockData(userId, brand);
    return apiSuccess(data);
  } catch (err) {
    return apiServerError(err);
  }
}
