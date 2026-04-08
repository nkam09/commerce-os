import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError } from "@/lib/utils/api";
import { getPMPageData } from "@/lib/services/pm-service";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const data = await getPMPageData(userId);
    return apiSuccess(data);
  } catch (err) {
    return apiServerError(err);
  }
}
