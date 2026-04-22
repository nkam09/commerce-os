import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiServerError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";
import { computeNextRunDate } from "@/lib/services/recurring-task-service";
import type { Prisma } from "@prisma/client";

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

export async function GET(req: NextRequest) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }
    const sp = req.nextUrl.searchParams;
    const spaceId = sp.get("spaceId");
    const where: Prisma.RecurringTaskWhereInput = { userId };
    if (spaceId) where.spaceId = spaceId;
    const rts = await prisma.recurringTask.findMany({
      where,
      orderBy: [{ active: "desc" }, { nextRunDate: "asc" }],
    });
    return apiSuccess(rts.map(serialize));
  } catch (err) {
    return apiServerError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }
    const body = await req.json().catch(() => ({}));
    const {
      listId,
      spaceId,
      title,
      description,
      frequency,
      intervalDays,
      dayOfWeek,
      dayOfMonth,
      startDate,
      active,
    } = body as Record<string, unknown>;

    if (!title || !frequency || !startDate) {
      return apiError("Missing required fields: title, frequency, startDate", 400);
    }

    const start = new Date(startDate as string);
    // nextRunDate is initially the startDate (so the first run fires on or after startDate)
    const nextRun = new Date(start);

    const rt = await prisma.recurringTask.create({
      data: {
        userId,
        listId: (listId as string | null | undefined) ?? null,
        spaceId: (spaceId as string | null | undefined) ?? null,
        title: title as string,
        description: (description as string | null | undefined) ?? null,
        frequency: frequency as string,
        intervalDays: typeof intervalDays === "number" ? intervalDays : null,
        dayOfWeek: typeof dayOfWeek === "number" ? dayOfWeek : null,
        dayOfMonth: typeof dayOfMonth === "number" ? dayOfMonth : null,
        startDate: start,
        nextRunDate: nextRun,
        active: active === false ? false : true,
      },
    });

    // Silence unused import if server-side helpers don't recompute here
    void computeNextRunDate;

    return apiSuccess(serialize(rt));
  } catch (err) {
    return apiServerError(err);
  }
}
