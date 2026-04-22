import { requireUser } from "@/lib/auth/require-user";
import { apiNotFound, apiServerError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

function serialize(rt: Prisma.RecurringTaskGetPayload<Record<string, never>>) {
  return {
    id: rt.id,
    userId: rt.userId,
    listId: rt.listId,
    spaceId: rt.spaceId,
    title: rt.title,
    description: rt.description,
    frequency: rt.frequency,
    intervalDays: rt.intervalDays,
    dayOfWeek: rt.dayOfWeek,
    dayOfMonth: rt.dayOfMonth,
    startDate: rt.startDate.toISOString().slice(0, 10),
    nextRunDate: rt.nextRunDate.toISOString().slice(0, 10),
    lastRunDate: rt.lastRunDate ? rt.lastRunDate.toISOString().slice(0, 10) : null,
    active: rt.active,
    createdAt: rt.createdAt.toISOString(),
    updatedAt: rt.updatedAt.toISOString(),
  };
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
    const existing = await prisma.recurringTask.findFirst({ where: { id, userId } });
    if (!existing) return apiNotFound("Recurring task");

    const body = await req.json().catch(() => ({}));
    const d = body as Record<string, unknown>;
    const data: Prisma.RecurringTaskUpdateInput = {};
    if ("listId" in d) {
      data.list = d.listId ? { connect: { id: d.listId as string } } : { disconnect: true };
    }
    if ("spaceId" in d) {
      data.space = d.spaceId ? { connect: { id: d.spaceId as string } } : { disconnect: true };
    }
    if ("title" in d) data.title = d.title as string;
    if ("description" in d) data.description = (d.description as string | null) ?? null;
    if ("frequency" in d) data.frequency = d.frequency as string;
    if ("intervalDays" in d) data.intervalDays = (d.intervalDays as number | null) ?? null;
    if ("dayOfWeek" in d) data.dayOfWeek = (d.dayOfWeek as number | null) ?? null;
    if ("dayOfMonth" in d) data.dayOfMonth = (d.dayOfMonth as number | null) ?? null;
    if ("startDate" in d) data.startDate = new Date(d.startDate as string);
    if ("nextRunDate" in d) data.nextRunDate = new Date(d.nextRunDate as string);
    if ("active" in d) data.active = Boolean(d.active);

    const updated = await prisma.recurringTask.update({ where: { id }, data });
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
    const existing = await prisma.recurringTask.findFirst({ where: { id, userId } });
    if (!existing) return apiNotFound("Recurring task");
    await prisma.recurringTask.delete({ where: { id } });
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiServerError(err);
  }
}
