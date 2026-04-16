import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess, apiUnauthorized } from "@/lib/utils/api";
import { parseBody, UpdateExpenseSchema } from "@/lib/utils/validation";
import { updateExpense } from "@/lib/services/update-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const body = await req.json();

    const parsed = parseBody(UpdateExpenseSchema, body);
    if (parsed.error || !parsed.data) {
      return apiError(parsed.error ?? "Invalid request body", 400);
    }

    const data = parsed.data;

    const normalized = {
      ...data,
      effectiveAt: data.effectiveAt ?? undefined,
      endsAt: data.endsAt ?? undefined,
    };

    const expense = await updateExpense(userId, id, normalized);
    return apiSuccess(expense);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }

    return apiError(
      err instanceof Error ? err.message : "Failed to update expense",
      500
    );
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;

    // Verify expense belongs to this user
    const expense = await prisma.expense.findFirst({
      where: { id, userId },
    });

    if (!expense) {
      return apiError("Expense not found", 404);
    }

    await prisma.expense.delete({ where: { id } });

    return apiSuccess({ deleted: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }
    return apiError(
      err instanceof Error ? err.message : "Failed to delete expense",
      500
    );
  }
}