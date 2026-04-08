import { requireUser } from "@/lib/auth/require-user";
import { getInventoryPlannerData } from "@/lib/services/inventory-service";
import { apiSuccess, apiServerError } from "@/lib/utils/api";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const data = await getInventoryPlannerData(userId);
    return apiSuccess(data);
  } catch (err) {
    return apiServerError(err);
  }
}
