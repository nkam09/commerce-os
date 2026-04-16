import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { parseBody, UpdatePurchaseOrderSchema } from "@/lib/utils/validation";
import { updatePurchaseOrder } from "@/lib/services/update-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const body = await req.json();

    const parsed = parseBody(UpdatePurchaseOrderSchema, body);
    if (parsed.error || !parsed.data) {
      return apiError(parsed.error ?? "Invalid request body", 400);
    }

    const normalized = {
      ...parsed.data,
      expectedEta: parsed.data.expectedEta ?? undefined,
      depositPaidAt: parsed.data.depositPaidAt ?? undefined,
    };

    const po = await updatePurchaseOrder(userId, id, normalized);
    return apiSuccess(po);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }

    return apiError(
      err instanceof Error ? err.message : "Failed to update purchase order",
      500
    );
  }
}