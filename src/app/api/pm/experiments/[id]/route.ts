import { requireUser } from "@/lib/auth/require-user";
import { apiNotFound, apiServerError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

function serialize(e: Prisma.ExperimentGetPayload<Record<string, never>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtasks = (e as any).subtasks as
    | { id: string; title: string; description: string | null; dueDate: Date | null; completed: boolean; order: number }[]
    | undefined;
  return {
    id: e.id,
    userId: e.userId,
    spaceId: e.spaceId,
    asin: e.asin,
    type: e.type,
    title: e.title,
    description: e.description,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate.toISOString().slice(0, 10),
    status: e.status,
    expectedImpact: e.expectedImpact,
    actualImpact: e.actualImpact,
    notes: e.notes,
    subtasks: (subtasks ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      dueDate: s.dueDate ? s.dueDate.toISOString().slice(0, 10) : null,
      completed: s.completed,
      order: s.order,
    })),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export async function GET(_req: Request, ctx: Params) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }
    const { id } = await ctx.params;
    const exp = await prisma.experiment.findFirst({
      where: { id, userId },
      include: { subtasks: { orderBy: { order: "asc" } } },
    });
    if (!exp) return apiNotFound("Experiment");
    return apiSuccess(serialize(exp));
  } catch (err) {
    return apiServerError(err);
  }
}

export async function PUT(req: Request, ctx: Params) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }
    const { id } = await ctx.params;
    const existing = await prisma.experiment.findFirst({ where: { id, userId } });
    if (!existing) return apiNotFound("Experiment");

    const body = await req.json().catch(() => ({}));
    const {
      spaceId,
      asin,
      type,
      title,
      description,
      startDate,
      endDate,
      status,
      expectedImpact,
      actualImpact,
      notes,
    } = body as Record<string, unknown>;

    const data: Prisma.ExperimentUpdateInput = {};
    if (spaceId !== undefined) data.space = spaceId ? { connect: { id: spaceId as string } } : { disconnect: true };
    if (asin !== undefined) data.asin = (asin as string | null) ?? null;
    if (type !== undefined) data.type = type as string;
    if (title !== undefined) data.title = title as string;
    if (description !== undefined) data.description = (description as string | null) ?? null;
    if (startDate !== undefined) data.startDate = new Date(startDate as string);
    if (endDate !== undefined) data.endDate = new Date(endDate as string);
    if (status !== undefined) data.status = status as string;
    if (expectedImpact !== undefined) data.expectedImpact = (expectedImpact as string | null) ?? null;
    if (actualImpact !== undefined) data.actualImpact = (actualImpact as string | null) ?? null;
    if (notes !== undefined) data.notes = (notes as string | null) ?? null;

    await prisma.experiment.update({ where: { id }, data });
    const updated = await prisma.experiment.findUnique({
      where: { id },
      include: { subtasks: { orderBy: { order: "asc" } } },
    });
    if (!updated) return apiNotFound("Experiment");
    return apiSuccess(serialize(updated));
  } catch (err) {
    return apiServerError(err);
  }
}

export async function DELETE(_req: Request, ctx: Params) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }
    const { id } = await ctx.params;
    const existing = await prisma.experiment.findFirst({ where: { id, userId } });
    if (!existing) return apiNotFound("Experiment");
    await prisma.experiment.delete({ where: { id } });
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiServerError(err);
  }
}
