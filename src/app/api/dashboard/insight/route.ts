import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError } from "@/lib/utils/api";
import { getDashboardInsight } from "@/lib/services/ai-insight-service";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const message = await getDashboardInsight(userId);
    return apiSuccess({ message });
  } catch (err) {
    return apiServerError(err);
  }
}
