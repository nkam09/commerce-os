import { requireUser } from "@/lib/auth/require-user";
import {
  apiSuccess,
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
        shipments: {
          orderBy: { sortOrder: "asc" },
          include: { items: true },
        },
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
      transactionFeePct,
      warehouseName,
      totalUnitsReceived,
      estProductionDays,
      estDeliveryDays,
      actProductionEnd,
      actDeliveryDate,
      status,
      notes,
      lineItems,
      payments,
      shipments,
    } = body;

    // Update the order scalar fields
    await prisma.supplierOrder.update({
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
        ...(transactionFeePct !== undefined && { transactionFeePct }),
        ...(warehouseName !== undefined && { warehouseName }),
        ...(totalUnitsReceived !== undefined && { totalUnitsReceived }),
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
              unitsPerBox?: number | null;
              boxLengthIn?: number | null;
              boxWidthIn?: number | null;
              boxHeightIn?: number | null;
              boxWeightLbs?: number | null;
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
            unitsPerBox: item.unitsPerBox ?? null,
            boxLengthIn: item.boxLengthIn ?? null,
            boxWidthIn: item.boxWidthIn ?? null,
            boxHeightIn: item.boxHeightIn ?? null,
            boxWeightLbs: item.boxWeightLbs ?? null,
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

    // Replace shipments (with nested items) if provided
    if (shipments !== undefined) {
      // Cascading delete removes shipment items automatically
      await prisma.supplierOrderShipment.deleteMany({ where: { orderId: id } });
      for (let i = 0; i < shipments.length; i++) {
        const s = shipments[i] as {
          units?: number;
          destination?: string;
          amazonShipId?: string | null;
          shipDate?: string | null;
          receivedDate?: string | null;
          status?: string;
          notes?: string | null;
          placementFee?: number;
          shippingCost?: number;
          items?: { asin: string; units: number }[];
        };
        const shipItems = s.items ?? [];
        const totalUnits = shipItems.reduce((sum, it) => sum + (it.units || 0), 0);
        await prisma.supplierOrderShipment.create({
          data: {
            orderId: id,
            units: s.units ?? totalUnits,
            destination: s.destination ?? "FBA",
            amazonShipId: s.amazonShipId ?? null,
            shipDate: s.shipDate ? new Date(s.shipDate) : null,
            receivedDate: s.receivedDate ? new Date(s.receivedDate) : null,
            status: s.status ?? "Pending",
            notes: s.notes ?? null,
            placementFee: s.placementFee ?? 0,
            shippingCost: s.shippingCost ?? 0,
            sortOrder: i,
            items: {
              create: shipItems.map((it) => ({
                asin: it.asin,
                units: it.units ?? 0,
              })),
            },
          },
        });
      }
    }

    // Re-fetch with includes
    const updated = await prisma.supplierOrder.findUnique({
      where: { id },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { sortOrder: "asc" } },
        shipments: {
          orderBy: { sortOrder: "asc" },
          include: { items: true },
        },
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
    transactionFeePct: Number(order.transactionFeePct ?? 2.9901),
    warehouseName: order.warehouseName ?? null,
    totalUnitsReceived: order.totalUnitsReceived ?? 0,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lineItems: (order.lineItems ?? []).map((item: any) => ({
      id: item.id,
      asin: item.asin,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      isOneTimeFee: item.isOneTimeFee ?? false,
      sortOrder: item.sortOrder,
      unitsPerBox: item.unitsPerBox ?? null,
      boxLengthIn: item.boxLengthIn != null ? Number(item.boxLengthIn) : null,
      boxWidthIn: item.boxWidthIn != null ? Number(item.boxWidthIn) : null,
      boxHeightIn: item.boxHeightIn != null ? Number(item.boxHeightIn) : null,
      boxWeightLbs: item.boxWeightLbs != null ? Number(item.boxWeightLbs) : null,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payments: (order.payments ?? []).map((p: any) => ({
      id: p.id,
      label: p.label,
      amount: Number(p.amount),
      paidDate: p.paidDate ? p.paidDate.toISOString().split("T")[0] : null,
      sortOrder: p.sortOrder,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shipments: (order.shipments ?? []).map((s: any) => ({
      id: s.id,
      units: s.units,
      destination: s.destination,
      amazonShipId: s.amazonShipId ?? null,
      shipDate: s.shipDate ? s.shipDate.toISOString().split("T")[0] : null,
      receivedDate: s.receivedDate ? s.receivedDate.toISOString().split("T")[0] : null,
      status: s.status,
      notes: s.notes ?? null,
      sortOrder: s.sortOrder,
      placementFee: Number(s.placementFee ?? 0),
      shippingCost: Number(s.shippingCost ?? 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (s.items ?? []).map((it: any) => ({
        id: it.id,
        asin: it.asin,
        units: it.units,
      })),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
