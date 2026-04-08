import { requireUser } from "@/lib/auth/require-user";
import { getCashflowPageData } from "@/lib/services/cashflow-service";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const data = await getCashflowPageData(userId);
    return apiSuccess(data);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
