import { prisma } from "@/lib/db/prisma";

// ─── Product Settings ─────────────────────────────────────────────────────────

export async function updateProductSettings(
  userId: string,
  productId: string,
  data: {
    landedCogs?: number | null;
    freightCost?: number | null;
    prepCost?: number | null;
    overheadCost?: number | null;
    safetyStockDays?: number | null;
    productionLeadDays?: number | null;
    shippingLeadDays?: number | null;
    receivingBufferDays?: number | null;
    reorderCoverageDays?: number | null;
    reorderMinQty?: number | null;
    reorderCasePack?: number | null;
    targetMarginPct?: number | null;
    targetAcosPct?: number | null;
    targetTacosPct?: number | null;
    notes?: string | null;
  }
) {
  // Verify ownership
  const product = await prisma.product.findFirst({ where: { id: productId, userId } });
  if (!product) throw new Error("Not found");

  return prisma.productSetting.upsert({
    where: { productId },
    create: { productId, ...data },
    update: data,
  });
}

// ─── Purchase Order ───────────────────────────────────────────────────────────

export async function updatePurchaseOrder(
  userId: string,
  id: string,
  data: Partial<{
    supplier: string;
    poNumber: string | null;
    status: string;
    totalAmount: number;
    depositAmount: number;
    balanceDue: number;
    currency: string;
    expectedEta: Date | null;
    depositPaidAt: Date | null;
    notes: string | null;
  }>
) {
  const existing = await prisma.purchaseOrder.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");

  return prisma.purchaseOrder.update({
    where: { id },
    data: data as never,
  });
}

// ─── Shipment ─────────────────────────────────────────────────────────────────

export async function updateShipment(
  userId: string,
  id: string,
  data: Partial<{
    reference: string | null;
    supplier: string | null;
    origin: string | null;
    destination: string | null;
    mode: string;
    stage: string;
    carrier: string | null;
    trackingNumber: string | null;
    cartons: number | null;
    units: number | null;
    shippingCost: number | null;
    currency: string;
    etaDeparture: Date | null;
    etaArrival: Date | null;
    notes: string | null;
  }>
) {
  const existing = await prisma.shipment.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");

  return prisma.shipment.update({
    where: { id },
    data: data as never,
  });
}

// ─── Expense ──────────────────────────────────────────────────────────────────

export async function updateExpense(
  userId: string,
  id: string,
  data: Partial<{
    name: string;
    category: string | null;
    amount: number;
    currency: string;
    frequency: string;
    effectiveAt: Date;
    endsAt: Date | null;
    vendor: string | null;
    notes: string | null;
  }>
) {
  const existing = await prisma.expense.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");

  return prisma.expense.update({
    where: { id },
    data: data as never,
  });
}

// ─── Project ──────────────────────────────────────────────────────────────────

export async function updateProject(
  userId: string,
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    status: string;
    owner: string | null;
    dueDate: Date | null;
    priority: number;
    notes: string | null;
  }>
) {
  const existing = await prisma.project.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");

  return prisma.project.update({
    where: { id },
    data: data as never,
  });
}
