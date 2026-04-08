import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, apiError } from "@/lib/utils/api";
import { getTasksForList, getAllTasks } from "@/lib/services/pm-service";
import { prisma } from "@/lib/db/prisma";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireUser();
    const listId = request.nextUrl.searchParams.get("listId");

    const tasks = listId
      ? await getTasksForList(userId, listId)
      : await getAllTasks(userId);
    return apiSuccess(tasks);
  } catch (err) {
    return apiServerError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const { title, listId, status, priority, dueDate, tags } = body as {
      title: string;
      listId: string;
      status?: string;
      priority?: string;
      dueDate?: string;
      tags?: string[];
    };

    if (!title || !listId) {
      return apiError("Missing title or listId", 400);
    }

    // Verify the list belongs to the user
    const list = await prisma.pMList.findFirst({
      where: { id: listId, space: { userId } },
    });
    if (!list) {
      return apiError("List not found", 404);
    }

    // Get the next order value
    const maxOrder = await prisma.pMTask.aggregate({
      where: { listId },
      _max: { order: true },
    });

    const task = await prisma.pMTask.create({
      data: {
        title,
        listId,
        status: status ?? "To Do",
        priority: priority ?? "Medium",
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: tags ?? [],
        order: (maxOrder._max.order ?? -1) + 1,
      },
      include: {
        subtasks: { orderBy: { order: "asc" } },
        comments: { orderBy: { createdAt: "asc" } },
      },
    });

    return apiSuccess({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.toISOString().split("T")[0] : null,
      startDate: task.startDate
        ? task.startDate.toISOString().split("T")[0]
        : null,
      tags: Array.isArray(task.tags) ? task.tags : [],
      order: task.order,
      listId: task.listId,
      subtasks: [],
      comments: [],
      aiGenerated: task.aiGenerated,
      aiSource: task.aiSource,
      asinRef: task.asinRef,
      campaignRef: task.campaignRef,
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
      createdAt: task.createdAt.toISOString(),
    });
  } catch (err) {
    return apiServerError(err);
  }
}
