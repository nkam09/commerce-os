import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiNotFound, apiServerError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

type SubtaskPayload = {
  experimentId?: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  order?: number;
};

function serialize(s: {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  completed: boolean;
  order: number;
}) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    dueDate: s.dueDate ? s.dueDate.toISOString().slice(0, 10) : null,
    completed: s.completed,
    order: s.order,
  };
}

export async function POST(request: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }

    const body = (await request.json().catch(() => ({}))) as SubtaskPayload;
    const { experimentId, title, description, dueDate, order } = body;
    if (!experimentId || !title) {
      return apiError("Missing experimentId or title", 400);
    }

    // Verify the experiment belongs to the user
    const exp = await prisma.experiment.findFirst({ where: { id: experimentId, userId } });
    if (!exp) return apiNotFound("Experiment");

    // Auto-compute order when absent
    let resolvedOrder = order;
    if (resolvedOrder == null) {
      const max = await prisma.experimentSubtask.aggregate({
        where: { experimentId },
        _max: { order: true },
      });
      resolvedOrder = (max._max.order ?? -1) + 1;
    }

    const subtask = await prisma.experimentSubtask.create({
      data: {
        experimentId,
        title,
        description: description ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
        order: resolvedOrder,
      },
    });

    return apiSuccess(serialize(subtask));
  } catch (err) {
    return apiServerError(err);
  }
}
