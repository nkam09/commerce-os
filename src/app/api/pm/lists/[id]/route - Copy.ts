import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, apiNotFound } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";
import { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await context.params;
    const body = await request.json();
    const { name, statuses, order } = body as {
      name?: string;
      statuses?: string[];
      order?: number;
    };

    // Verify the list belongs to the user
    const existing = await prisma.pMList.findFirst({
      where: { id, space: { userId } },
    });
    if (!existing) {
      return apiNotFound("List");
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (statuses !== undefined) data.statuses = statuses;
    if (order !== undefined) data.order = order;

    const updated = await prisma.pMList.update({
      where: { id },
      data,
    });

    return apiSuccess({
      id: updated.id,
      name: updated.name,
      spaceId: updated.spaceId,
      order: updated.order,
      statuses: Array.isArray(updated.statuses)
        ? updated.statuses
        : ["To Do", "In Progress", "Review", "Done"],
    });
  } catch (err) {
    return apiServerError(err);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await context.params;

    const existing = await prisma.pMList.findFirst({
      where: { id, space: { userId } },
    });
    if (!existing) {
      return apiNotFound("List");
    }

    await prisma.pMList.delete({ where: { id } });
    return apiSuccess({ deleted: id });
  } catch (err) {
    return apiServerError(err);
  }
}
