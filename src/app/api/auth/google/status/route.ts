import { requireUser } from "@/lib/auth/require-user";
import { apiServerError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";
import { isGoogleConfigured } from "@/lib/google/google-oauth-client";

export async function GET() {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }
    const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
    return apiSuccess({
      configured: isGoogleConfigured(),
      connected: Boolean(conn),
      syncEnabled: conn?.syncEnabled ?? false,
      calendarId: conn?.calendarId ?? null,
      lastSyncedAt: conn?.lastSyncedAt ? conn.lastSyncedAt.toISOString() : null,
    });
  } catch (err) {
    return apiServerError(err);
  }
}

export async function PUT(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }
    const body = (await req.json().catch(() => ({}))) as { syncEnabled?: boolean };
    const conn = await prisma.googleCalendarConnection.update({
      where: { userId },
      data: { syncEnabled: Boolean(body.syncEnabled) },
    });
    return apiSuccess({ syncEnabled: conn.syncEnabled });
  } catch (err) {
    return apiServerError(err);
  }
}
