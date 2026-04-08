import { NextRequest } from "next/server";
import {
  getRankTrackingData,
  getRankTrackingProducts,
} from "@/lib/services/rank-tracking-service";
import { apiSuccess, apiError } from "@/lib/utils/api";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const asin = searchParams.get("asin") ?? "B0EXAMPLE1";
  const dateRange = searchParams.get("dateRange") ?? "last30";

  // Validate dateRange
  if (!["last7", "last30", "last90"].includes(dateRange)) {
    return apiError("Invalid dateRange. Use last7, last30, or last90.", 400);
  }

  const products = getRankTrackingProducts();
  const data = getRankTrackingData(
    asin,
    dateRange as "last7" | "last30" | "last90",
  );

  return apiSuccess({
    products,
    ...data,
  });
}
