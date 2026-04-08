import { prisma } from "@/lib/db/prisma";

const now = () => new Date();

export async function archiveProduct(userId: string, id: string) {
  const existing = await prisma.product.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");
  return prisma.product.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: now() },
  });
}

export async function archivePurchaseOrder(userId: string, id: string) {
  const existing = await prisma.purchaseOrder.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");
  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: now() },
  });
}

export async function archiveShipment(userId: string, id: string) {
  const existing = await prisma.shipment.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");
  return prisma.shipment.update({
    where: { id },
    data: { archivedAt: now() },
  });
}

export async function archiveExpense(userId: string, id: string) {
  const existing = await prisma.expense.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");
  return prisma.expense.update({
    where: { id },
    data: { archivedAt: now() },
  });
}

export async function archiveProject(userId: string, id: string) {
  const existing = await prisma.project.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");
  return prisma.project.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: now() },
  });
}
