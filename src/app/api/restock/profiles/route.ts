import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError } from "@/lib/utils/api";
import { getRestockData } from "@/lib/services/restock-service";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const data = await getRestockData(userId);
    return apiSuccess(data.profiles);
  } catch (err) {
    return apiServerError(err);
  }
}

export async function POST() {
  try {
    await requireUser();
    // Stub — will wire to Prisma in a future phase
    return apiSuccess({ message: "Profile created" }, 201);
  } catch (err) {
    return apiServerError(err);
  }
}
