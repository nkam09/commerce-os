import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, apiError } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const { content, taskId } = body as { content: string; taskId: string };

    if (!content || !taskId) {
      return apiError("Missing content or taskId", 400);
    }

    // Verify the task belongs to the user
    const task = await prisma.pMTask.findFirst({
      where: { id: taskId, list: { space: { userId } } },
    });
    if (!task) {
      return apiError("Task not found", 404);
    }

    const comment = await prisma.pMComment.create({
      data: {
        content,
        taskId,
      },
    });

    return apiSuccess({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (err) {
    return apiServerError(err);
  }
}
