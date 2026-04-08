import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import {
  parseBody,
  UpdateProductSettingsSchema,
} from "@/lib/utils/validation";
import { updateProductSettings } from "@/lib/services/update-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const body = await req.json();

    const parsed = parseBody(UpdateProductSettingsSchema, body);
    if (parsed.error || !parsed.data) {
      return apiError(parsed.error ?? "Invalid request body", 400);
    }

    const setting = await updateProductSettings(userId, id, parsed.data);
    return apiSuccess(setting);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }

    return apiError(
      err instanceof Error ? err.message : "Failed to update product settings",
      500
    );
  }
}