import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { parseBody, UpdateShipmentSchema } from "@/lib/utils/validation";
import { updateShipment } from "@/lib/services/update-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const body = await req.json();

    const parsed = parseBody(UpdateShipmentSchema, body);
    if (parsed.error || !parsed.data) {
      return apiError(parsed.error ?? "Invalid request body", 400);
    }

    const normalized = {
      ...parsed.data,
      etaDeparture: parsed.data.etaDeparture ?? undefined,
      etaArrival: parsed.data.etaArrival ?? undefined,
    };

    const shipment = await updateShipment(userId, id, normalized);
    return apiSuccess(shipment);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }

    return apiError(
      err instanceof Error ? err.message : "Failed to update shipment",
      500
    );
  }
}