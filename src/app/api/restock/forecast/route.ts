import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError } from "@/lib/utils/api";
import { getRestockData } from "@/lib/services/restock-service";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const data = await getRestockData(userId);
    return apiSuccess(data);
  } catch (err) {
    return apiServerError(err);
  }
}
