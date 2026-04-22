import { requireUser } from "@/lib/auth/require-user";
import { apiNotFound, apiServerError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string }> };

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

export async function PUT(request: Request, ctx: Params) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }

    const { id } = await ctx.params;
    const existing = await prisma.experimentSubtask.findFirst({
      where: { id, experiment: { userId } },
    });
    if (!existing) return apiNotFound("Subtask");

    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      description?: string | null;
      dueDate?: string | null;
      completed?: boolean;
      order?: number;
    };
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.completed !== undefined) data.completed = body.completed;
    if (body.order !== undefined) data.order = body.order;

    const updated = await prisma.experimentSubtask.update({ where: { id }, data });
    return apiSuccess(serialize(updated));
  } catch (err) {
    return apiServerError(err);
  }
}

export async function DELETE(_request: Request, ctx: Params) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }

    const { id } = await ctx.params;
    const existing = await prisma.experimentSubtask.findFirst({
      where: { id, experiment: { userId } },
    });
    if (!existing) return apiNotFound("Subtask");

    await prisma.experimentSubtask.delete({ where: { id } });
    return apiSuccess({ deleted: id });
  } catch (err) {
    return apiServerError(err);
  }
}
