import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError, apiNotFound } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";
import { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await context.params;
    const body = await request.json();
    const { name, color } = body as { name?: string; color?: string };

    const existing = await prisma.pMSpace.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return apiNotFound("Space");
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (color !== undefined) data.color = color;

    const updated = await prisma.pMSpace.update({
      where: { id },
      data,
    });

    return apiSuccess({
      id: updated.id,
      name: updated.name,
      color: updated.color,
      order: updated.order,
    });
  } catch (err) {
    return apiServerError(err);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await context.params;

    const existing = await prisma.pMSpace.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return apiNotFound("Space");
    }

    // Cascade delete is handled by Prisma schema (onDelete: Cascade)
    await prisma.pMSpace.delete({ where: { id } });
    return apiSuccess({ deleted: id });
  } catch (err) {
    return apiServerError(err);
  }
}
