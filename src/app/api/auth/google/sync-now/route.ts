/**
 * POST /api/auth/google/sync-now
 *
 * Fire-and-forget manual sync trigger from the Settings UI.
 * Returns immediately with a queued status; the worker picks this up
 * on its next cycle anyway, but this lets the user force an immediate run.
 */
import { requireUser } from "@/lib/auth/require-user";
import { apiServerError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { syncToGoogleCalendar } from "@/lib/services/google-calendar-sync-service";

export async function POST() {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }

    // Kick off in the background so the request returns fast.
    syncToGoogleCalendar(userId).catch((err) => {
      console.error("[sync-now] failed:", err);
    });

    return apiSuccess({ queued: true });
  } catch (err) {
    return apiServerError(err);
  }
}
