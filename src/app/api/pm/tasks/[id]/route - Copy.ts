import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, apiNotFound } from "@/lib/utils/api";
import { getTaskById } from "@/lib/services/pm-service";
import { prisma } from "@/lib/db/prisma";
import { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await context.params;
    const task = await getTaskById(userId, id);

    if (!task) {
      return apiNotFound("Task");
    }

    return apiSuccess(task);
  } catch (err) {
    return apiServerError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await context.params;
    const body = await request.json();
    const updates = body as Record<string, unknown>;

    // Verify the task belongs to the user
    const existing = await prisma.pMTask.findFirst({
      where: { id, list: { space: { userId } } },
    });
    if (!existing) {
      return apiNotFound("Task");
    }

    // Build update data from allowed fields
    const data: Record<string, unknown> = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.status !== undefined) {
      data.status = updates.status;
      // Auto-set completedAt when status changes to Done
      if (updates.status === "Done" && !existing.completedAt) {
        data.completedAt = new Date();
      } else if (updates.status !== "Done" && existing.completedAt) {
        data.completedAt = null;
      }
    }
    if (updates.priority !== undefined) data.priority = updates.priority;
    if (updates.dueDate !== undefined)
      data.dueDate = updates.dueDate ? new Date(updates.dueDate as string) : null;
    if (updates.startDate !== undefined)
      data.startDate = updates.startDate ? new Date(updates.startDate as string) : null;
    if (updates.tags !== undefined) data.tags = updates.tags;
    if (updates.order !== undefined) data.order = updates.order;
    if (updates.listId !== undefined) data.listId = updates.listId;

    const updated = await prisma.pMTask.update({
      where: { id },
      data,
      include: {
        subtasks: { orderBy: { order: "asc" } },
        comments: { orderBy: { createdAt: "asc" } },
      },
    });

    // Return the updated task using getTaskById for consistent shape
    const result = await getTaskById(userId, id);
    return apiSuccess(result);
  } catch (err) {
    return apiServerError(err);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await context.params;

    // Verify the task belongs to the user
    const existing = await prisma.pMTask.findFirst({
      where: { id, list: { space: { userId } } },
    });
    if (!existing) {
      return apiNotFound("Task");
    }

    await prisma.pMTask.delete({ where: { id } });
    return apiSuccess({ deleted: id });
  } catch (err) {
    return apiServerError(err);
  }
}
