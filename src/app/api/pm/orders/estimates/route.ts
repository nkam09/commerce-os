import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const { userId } = await requireUser();

    // Get all delivered orders with actual dates
    const completed = await prisma.supplierOrder.findMany({
      where: {
        space: { userId },
        actProductionEnd: { not: null },
        actDeliveryDate: { not: null },
      },
      select: {
        orderDate: true,
        actProductionEnd: true,
        actDeliveryDate: true,
      },
    });

    if (completed.length === 0) {
      return apiSuccess({ avgProductionDays: 36, avgDeliveryDays: 71 });
    }

    let totalProd = 0;
    let totalDel = 0;

    for (const o of completed) {
      const orderMs = o.orderDate.getTime();
      totalProd += Math.round(
        (o.actProductionEnd!.getTime() - orderMs) / (1000 * 60 * 60 * 24)
      );
      totalDel += Math.round(
        (o.actDeliveryDate!.getTime() - orderMs) / (1000 * 60 * 60 * 24)
      );
    }

    return apiSuccess({
      avgProductionDays: Math.round(totalProd / completed.length),
      avgDeliveryDays: Math.round(totalDel / completed.length),
    });
  } catch (err) {
    return apiServerError(err);
  }
}
