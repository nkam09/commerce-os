import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, apiError } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const { name, spaceId } = body as { name: string; spaceId: string };

    if (!name || !spaceId) {
      return apiError("Missing name or spaceId", 400);
    }

    // Verify the space belongs to the user
    const space = await prisma.pMSpace.findFirst({
      where: { id: spaceId, userId },
    });
    if (!space) {
      return apiError("Space not found", 404);
    }

    // Get the next order value
    const maxOrder = await prisma.pMList.aggregate({
      where: { spaceId },
      _max: { order: true },
    });

    const list = await prisma.pMList.create({
      data: {
        name,
        spaceId,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    return apiSuccess({
      id: list.id,
      name: list.name,
      spaceId: list.spaceId,
      order: list.order,
      statuses: ["To Do", "In Progress", "Review", "Done"],
      taskCount: 0,
    });
  } catch (err) {
    return apiServerError(err);
  }
}
