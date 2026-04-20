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
        shipments: {
          orderBy: { sortOrder: "asc" },
          include: { items: true },
        },
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
        currency: currency ?? "USD",
        exchangeRate: exchangeRate ?? null,
        shippingCost: shippingCost ?? 0,
        shippingCurrency: shippingCurrency ?? "USD",
        shipToAddress: shipToAddress ?? null,
        shipMethod: shipMethod ?? null,
        transactionFeePct: transactionFeePct ?? 2.9901,
        warehouseName: warehouseName ?? null,
        totalUnitsReceived: totalUnitsReceived ?? 0,
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
                isOneTimeFee?: boolean;
              },
              i: number
            ) => ({
              asin: item.asin,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit ?? "pc.",
              unitPrice: item.unitPrice,
              isOneTimeFee: item.isOneTimeFee ?? false,
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
        shipments: {
          create: (shipments ?? []).map(
            (
              s: {
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
              },
              i: number
            ) => {
              const shipItems = s.items ?? [];
              const totalUnits = shipItems.reduce((sum, it) => sum + (it.units || 0), 0);
              return {
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
              };
            }
          ),
        },
      },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { sortOrder: "asc" } },
        shipments: {
          orderBy: { sortOrder: "asc" },
          include: { items: true },
        },
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
    lineItems: order.lineItems.map(// eslint-disable-next-line @typescript-eslint/no-explicit-any
      (item: any) => ({
      id: item.id,
      asin: item.asin,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      isOneTimeFee: item.isOneTimeFee ?? false,
      sortOrder: item.sortOrder,
    })),
    payments: order.payments.map(// eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => ({
      id: p.id,
      label: p.label,
      amount: Number(p.amount),
      paidDate: p.paidDate ? p.paidDate.toISOString().split("T")[0] : null,
      sortOrder: p.sortOrder,
    })),
    shipments: (order.shipments ?? []).map(// eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => ({
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
