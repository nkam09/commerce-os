import { requireUser } from "@/lib/auth/require-user";
import {
  apiSuccess,
  apiError,
  apiNotFound,
  apiServerError,
} from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await ctx.params;

    const order = await prisma.supplierOrder.findFirst({
      where: { id, space: { userId } },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!order) return apiNotFound("Order");

    return apiSuccess(serializeOrder(order));
  } catch (err) {
    return apiServerError(err);
  }
}

export async function PUT(request: Request, ctx: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await ctx.params;

    const existing = await prisma.supplierOrder.findFirst({
      where: { id, space: { userId } },
    });
    if (!existing) return apiNotFound("Order");

    const body = await request.json();
    const {
      orderNumber,
      supplier,
      orderDate,
      deliveryAddress,
      amazonOrderId,
      amazonRefId,
      terms,
      currency,
      exchangeRate,
      shippingCost,
      shippingCurrency,
      shipToAddress,
      shipMethod,
      estProductionDays,
      estDeliveryDays,
      actProductionEnd,
      actDeliveryDate,
      status,
      notes,
      lineItems,
      payments,
    } = body;

    // Update the order scalar fields
    const order = await prisma.supplierOrder.update({
      where: { id },
      data: {
        ...(orderNumber !== undefined && { orderNumber }),
        ...(supplier !== undefined && { supplier }),
        ...(orderDate !== undefined && { orderDate: new Date(orderDate) }),
        ...(deliveryAddress !== undefined && { deliveryAddress }),
        ...(amazonOrderId !== undefined && { amazonOrderId }),
        ...(amazonRefId !== undefined && { amazonRefId }),
        ...(terms !== undefined && { terms }),
        ...(currency !== undefined && { currency }),
        ...(exchangeRate !== undefined && { exchangeRate }),
        ...(shippingCost !== undefined && { shippingCost }),
        ...(shippingCurrency !== undefined && { shippingCurrency }),
        ...(shipToAddress !== undefined && { shipToAddress }),
        ...(shipMethod !== undefined && { shipMethod }),
        ...(estProductionDays !== undefined && { estProductionDays }),
        ...(estDeliveryDays !== undefined && { estDeliveryDays }),
        ...(actProductionEnd !== undefined && {
          actProductionEnd: actProductionEnd ? new Date(actProductionEnd) : null,
        }),
        ...(actDeliveryDate !== undefined && {
          actDeliveryDate: actDeliveryDate ? new Date(actDeliveryDate) : null,
        }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
    });

    // Replace line items if provided
    if (lineItems !== undefined) {
      await prisma.supplierOrderItem.deleteMany({ where: { orderId: id } });
      await prisma.supplierOrderItem.createMany({
        data: lineItems.map(
          (
            item: {
              asin: string;
              description: string;
              quantity: number;
              unit?: string;
              unitPrice: number;
              isOneTimeFee?: boolean;
            },
            i: number
          ) => ({
            orderId: id,
            asin: item.asin,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit ?? "pc.",
            unitPrice: item.unitPrice,
            isOneTimeFee: item.isOneTimeFee ?? false,
            sortOrder: i,
          })
        ),
      });
    }

    // Replace payments if provided
    if (payments !== undefined) {
      await prisma.supplierOrderPayment.deleteMany({ where: { orderId: id } });
      await prisma.supplierOrderPayment.createMany({
        data: payments.map(
          (
            p: { label: string; amount: number; paidDate?: string | null },
            i: number
          ) => ({
            orderId: id,
            label: p.label,
            amount: p.amount,
            paidDate: p.paidDate ? new Date(p.paidDate) : null,
            sortOrder: i,
          })
        ),
      });
    }

    // Re-fetch with includes
    const updated = await prisma.supplierOrder.findUnique({
      where: { id },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { sortOrder: "asc" } },
      },
    });

    return apiSuccess(serializeOrder(updated));
  } catch (err) {
    return apiServerError(err);
  }
}

export async function DELETE(_request: Request, ctx: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await ctx.params;

    const existing = await prisma.supplierOrder.findFirst({
      where: { id, space: { userId } },
    });
    if (!existing) return apiNotFound("Order");

    await prisma.supplierOrder.delete({ where: { id } });
    return apiSuccess({ deleted: true });
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
    currency: order.currency ?? "USD",
    exchangeRate: order.exchangeRate ? Number(order.exchangeRate) : null,
    shippingCost: Number(order.shippingCost ?? 0),
    shippingCurrency: order.shippingCurrency ?? "USD",
    shipToAddress: order.shipToAddress ?? null,
    shipMethod: order.shipMethod ?? null,
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
    lineItems: (order.lineItems ?? []).map((item: any) => ({
      id: item.id,
      asin: item.asin,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      isOneTimeFee: item.isOneTimeFee ?? false,
      sortOrder: item.sortOrder,
    })),
    payments: (order.payments ?? []).map((p: any) => ({
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
