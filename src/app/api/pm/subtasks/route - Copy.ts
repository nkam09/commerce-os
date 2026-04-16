import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, apiError } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const { title, taskId } = body as { title: string; taskId: string };

    if (!title || !taskId) {
      return apiError("Missing title or taskId", 400);
    }

    // Verify the task belongs to the user
    const task = await prisma.pMTask.findFirst({
      where: { id: taskId, list: { space: { userId } } },
    });
    if (!task) {
      return apiError("Task not found", 404);
    }

    // Get the next order value
    const maxOrder = await prisma.pMSubtask.aggregate({
      where: { taskId },
      _max: { order: true },
    });

    const subtask = await prisma.pMSubtask.create({
      data: {
        title,
        taskId,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    return apiSuccess({
      id: subtask.id,
      title: subtask.title,
      completed: subtask.completed,
      order: subtask.order,
    });
  } catch (err) {
    return apiServerError(err);
  }
}
