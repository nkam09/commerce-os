import { requireUser } from "@/lib/auth/require-user";
import { archiveShipment } from "@/lib/services/archive-service";
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
    const shipment = await archiveShipment(userId, id);
    return apiSuccess(shipment);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    if (err instanceof Error && err.message === "Not found") return apiNotFound("Shipment");
    return apiServerError(err);
  }
}
