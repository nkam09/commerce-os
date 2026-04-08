import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, apiError } from "@/lib/utils/api";
import { getSpaces } from "@/lib/services/pm-service";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const spaces = await getSpaces(userId);
    return apiSuccess(spaces);
  } catch (err) {
    return apiServerError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const { name, color } = body as { name: string; color?: string };

    if (!name) {
      return apiError("Missing name", 400);
    }

    // Get the next order value
    const maxOrder = await prisma.pMSpace.aggregate({
      where: { userId },
      _max: { order: true },
    });

    const space = await prisma.pMSpace.create({
      data: {
        userId,
        name,
        color: color ?? "#3b82f6",
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    return apiSuccess({
      id: space.id,
      name: space.name,
      color: space.color,
      order: space.order,
      lists: [],
    });
  } catch (err) {
    return apiServerError(err);
  }
}
