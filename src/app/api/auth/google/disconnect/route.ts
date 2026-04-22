import { requireUser } from "@/lib/auth/require-user";
import { apiServerError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }
    await prisma.googleCalendarConnection.deleteMany({ where: { userId } });
    return apiSuccess({ disconnected: true });
  } catch (err) {
    return apiServerError(err);
  }
}
