import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiServerError } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const { userId } = await requireUser();

    // Calculate estimates from historical orders
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

    let avgProductionDays = 36;
    let avgDeliveryDays = 71;

    if (completed.length > 0) {
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
      avgProductionDays = Math.round(totalProd / completed.length);
      avgDeliveryDays = Math.round(totalDel / completed.length);
    }

    return apiSuccess({
      supplier: "Ningbo Doublefly Import And Export Co., Ltd",
      terms: [
        "50/50 Upfront/Before Delivery",
        "30/70 Upfront/Before Delivery",
      ],
      products: [
        {
          asin: "B07XYBW774",
          description: "100 BC",
          unitPrice: 4.365,
          unit: "pc.",
        },
        {
          asin: "B0B27GRHFR",
          description: "50 BC",
          unitPrice: 2.65,
          unit: "pc.",
        },
        {
          asin: "B0D7NNL4BL",
          description: "20 BCL",
          unitPrice: 1.4,
          unit: "pc.",
        },
      ],
      estimates: { avgProductionDays, avgDeliveryDays },
    });
  } catch (err) {
    return apiServerError(err);
  }
}
