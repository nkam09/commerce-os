import { requireUser } from "@/lib/auth/require-user";
import { getProductDrawer } from "@/lib/services/product-drawer-service";
import { apiSuccess, apiServerError, apiUnauthorized, apiNotFound } from "@/lib/utils/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const data = await getProductDrawer(userId, id);
    if (!data) return apiNotFound("Product");
    return apiSuccess(data);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
