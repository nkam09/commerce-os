import { requireUser } from "@/lib/auth/require-user";
import { getProductsPageData } from "@/lib/services/products-service";
import { apiSuccess, apiServerError } from "@/lib/utils/api";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const data = await getProductsPageData(userId);
    return apiSuccess(data);
  } catch (err) {
    return apiServerError(err);
  }
}
