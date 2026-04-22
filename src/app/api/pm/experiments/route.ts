import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiServerError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type ExperimentWithSubtasks = Prisma.ExperimentGetPayload<{
  include: { subtasks: true };
}>;

function serialize(e: ExperimentWithSubtasks | Prisma.ExperimentGetPayload<Record<string, never>>) {
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
    const status = sp.get("status");
    const asin = sp.get("asin");

    const where: Prisma.ExperimentWhereInput = { userId };
    if (spaceId) where.spaceId = spaceId;
    if (status) where.status = status;
    if (asin) where.asin = asin;

    const experiments = await prisma.experiment.findMany({
      where,
      orderBy: { startDate: "desc" },
      include: { subtasks: { orderBy: { order: "asc" } } },
    });
    return apiSuccess(experiments.map(serialize));
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
    } = body as {
      spaceId?: string | null;
      asin?: string | null;
      type?: string;
      title?: string;
      description?: string | null;
      startDate?: string;
      endDate?: string;
      status?: string;
      expectedImpact?: string | null;
      actualImpact?: string | null;
      notes?: string | null;
    };

    if (!title || !type || !startDate || !endDate) {
      return apiError("Missing required fields: title, type, startDate, endDate", 400);
    }

    const experiment = await prisma.experiment.create({
      data: {
        userId,
        spaceId: spaceId ?? null,
        asin: asin ?? null,
        type,
        title,
        description: description ?? null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: status ?? "Planned",
        expectedImpact: expectedImpact ?? null,
        actualImpact: actualImpact ?? null,
        notes: notes ?? null,
      },
      include: { subtasks: true },
    });

    return apiSuccess(serialize(experiment));
  } catch (err) {
    return apiServerError(err);
  }
}
