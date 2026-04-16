import { requireUser } from "@/lib/auth/require-user";
import { archivePurchaseOrder } from "@/lib/services/archive-service";
import {
  apiSuccess,
  apiNotFound,
  apiUnauthorized,
  apiServerError,
} from "@/lib/utils/api";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const po = await archivePurchaseOrder(userId, id);
    return apiSuccess(po);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    if (err instanceof Error && err.message === "Not found") return apiNotFound("Purchase order");
    return apiServerError(err);
  }
}
