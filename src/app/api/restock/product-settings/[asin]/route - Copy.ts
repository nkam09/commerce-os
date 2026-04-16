import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError } from "@/lib/utils/api";
import { getProductSettings } from "@/lib/services/restock-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ asin: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { asin } = await params;
    const settings = await getProductSettings(userId, asin);
    return apiSuccess(settings);
  } catch (err) {
    return apiServerError(err);
  }
}

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ asin: string }> }
) {
  try {
    await requireUser();
    const { asin } = await params;
    // Stub — will wire to Prisma in a future phase
    return apiSuccess({ message: `Settings updated for ${asin}` });
  } catch (err) {
    return apiServerError(err);
  }
}
