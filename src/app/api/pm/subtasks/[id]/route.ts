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
    const { title, completed, description, dueDate } = body as {
      title?: string;
      completed?: boolean;
      description?: string | null;
      dueDate?: string | null;
    };

    // Verify the subtask belongs to the user
    const existing = await prisma.pMSubtask.findFirst({
      where: { id, task: { list: { space: { userId } } } },
    });
    if (!existing) {
      return apiNotFound("Subtask");
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (completed !== undefined) data.completed = completed;
    if (description !== undefined) data.description = description;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

    const updated = await prisma.pMSubtask.update({
      where: { id },
      data,
    });

    return apiSuccess({
      id: updated.id,
      title: updated.title,
      description: updated.description,
      dueDate: updated.dueDate ? updated.dueDate.toISOString().slice(0, 10) : null,
      completed: updated.completed,
      order: updated.order,
    });
  } catch (err) {
    return apiServerError(err);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await context.params;

    const existing = await prisma.pMSubtask.findFirst({
      where: { id, task: { list: { space: { userId } } } },
    });
    if (!existing) {
      return apiNotFound("Subtask");
    }

    await prisma.pMSubtask.delete({ where: { id } });
    return apiSuccess({ deleted: id });
  } catch (err) {
    return apiServerError(err);
  }
}
