import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiError, apiServerError } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const url = new URL(request.url);
    const spaceId = url.searchParams.get("spaceId");

    if (!spaceId) {
      return apiError("Missing spaceId", 400);
    }

    // Verify space ownership
    const space = await prisma.pMSpace.findFirst({
      where: { id: spaceId, userId },
    });
    if (!space) return apiError("Space not found", 404);

    const orders = await prisma.supplierOrder.findMany({
      where: { spaceId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { orderDate: "desc" },
    });

    const data = orders.map(serializeOrder);
    return apiSuccess(data);
  } catch (err) {
    return apiServerError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const {
      spaceId,
      orderNumber,
      supplier,
      orderDate,
      deliveryAddress,
      amazonOrderId,
      amazonRefId,
      terms,
      estProductionDays,
      estDeliveryDays,
      actProductionEnd,
      actDeliveryDate,
      status,
      notes,
      lineItems,
      payments,
    } = body;

    if (!spaceId || !orderNumber || !orderDate) {
      return apiError("Missing required fields: spaceId, orderNumber, orderDate", 400);
    }

    // Verify space ownership
    const space = await prisma.pMSpace.findFirst({
      where: { id: spaceId, userId },
    });
    if (!space) return apiError("Space not found", 404);

    const order = await prisma.supplierOrder.create({
      data: {
        spaceId,
        orderNumber,
        supplier: supplier ?? "Ningbo Doublefly Import And Export Co., Ltd",
        orderDate: new Date(orderDate),
        deliveryAddress: deliveryAddress ?? null,
        amazonOrderId: amazonOrderId ?? null,
        amazonRefId: amazonRefId ?? null,
        terms: terms ?? "50/50 Upfront/Before Delivery",
        estProductionDays: estProductionDays ?? null,
        estDeliveryDays: estDeliveryDays ?? null,
        actProductionEnd: actProductionEnd ? new Date(actProductionEnd) : null,
        actDeliveryDate: actDeliveryDate ? new Date(actDeliveryDate) : null,
        status: status ?? "Pending",
        notes: notes ?? null,
        lineItems: {
          create: (lineItems ?? []).map(
            (
              item: {
                asin: string;
                description: string;
                quantity: number;
                unit?: string;
                unitPrice: number;
              },
              i: number
            ) => ({
              asin: item.asin,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit ?? "pc.",
              unitPrice: item.unitPrice,
              sortOrder: i,
            })
          ),
        },
        payments: {
          create: (payments ?? []).map(
            (
              p: { label: string; amount: number; paidDate?: string },
              i: number
            ) => ({
              label: p.label,
              amount: p.amount,
              paidDate: p.paidDate ? new Date(p.paidDate) : null,
              sortOrder: i,
            })
          ),
        },
      },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { sortOrder: "asc" } },
      },
    });

    return apiSuccess(serializeOrder(order));
  } catch (err) {
    return apiServerError(err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeOrder(order: any) {
  return {
    id: order.id,
    spaceId: order.spaceId,
    orderNumber: order.orderNumber,
    supplier: order.supplier,
    orderDate: order.orderDate.toISOString().split("T")[0],
    deliveryAddress: order.deliveryAddress,
    amazonOrderId: order.amazonOrderId,
    amazonRefId: order.amazonRefId,
    terms: order.terms,
    estProductionDays: order.estProductionDays,
    estDeliveryDays: order.estDeliveryDays,
    actProductionEnd: order.actProductionEnd
      ? order.actProductionEnd.toISOString().split("T")[0]
      : null,
    actDeliveryDate: order.actDeliveryDate
      ? order.actDeliveryDate.toISOString().split("T")[0]
      : null,
    status: order.status,
    notes: order.notes,
    lineItems: order.lineItems.map((item: any) => ({
      id: item.id,
      asin: item.asin,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      sortOrder: item.sortOrder,
    })),
    payments: order.payments.map((p: any) => ({
      id: p.id,
      label: p.label,
      amount: Number(p.amount),
      paidDate: p.paidDate ? p.paidDate.toISOString().split("T")[0] : null,
      sortOrder: p.sortOrder,
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
