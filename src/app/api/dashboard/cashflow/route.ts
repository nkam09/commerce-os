import { requireUser } from "@/lib/auth/require-user";
import { getCashFlowDashboard } from "@/lib/services/dashboard-query-service";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const data = await getCashFlowDashboard(userId);
    return apiSuccess(data);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
