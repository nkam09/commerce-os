import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { parseBody, CreateShipmentSchema } from "@/lib/utils/validation";
import { createShipment } from "@/lib/services/create-service";

export async function POST(req: Request) {
  try {
    const { userId } = await requireUser();
    const body = await req.json();

    const parsed = parseBody(CreateShipmentSchema, body);
    if (parsed.error || !parsed.data) {
      return apiError(parsed.error ?? "Invalid request body", 400);
    }

    const shipment = await createShipment(userId, parsed.data);
    return apiSuccess(shipment, 201);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }

    return apiError(
      err instanceof Error ? err.message : "Failed to create shipment",
      500
    );
  }
}