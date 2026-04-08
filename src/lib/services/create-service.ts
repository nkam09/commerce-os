import { prisma } from "@/lib/db/prisma";
import { toNum } from "@/lib/utils/math";

// ─── Product ──────────────────────────────────────────────────────────────────

export async function createProduct(
  userId: string,
  data: {
    asin: string;
    sku?: string | null;
    fnsku?: string | null;
    title?: string | null;
    brand?: string | null;
    category?: string | null;
  }
) {
  return prisma.product.create({
    data: { userId, ...data },
  });
}

// ─── Purchase Order ───────────────────────────────────────────────────────────

export async function createPurchaseOrder(
  userId: string,
  data: {
    supplier: string;
    poNumber?: string | null;
    totalAmount: number;
    depositAmount?: number;
    currency?: string;
    expectedEta?: Date | null;
    notes?: string | null;
  }
) {
  const total = data.totalAmount;
  const deposit = data.depositAmount ?? 0;
  return prisma.purchaseOrder.create({
    data: {
      userId,
      supplier: data.supplier,
      poNumber: data.poNumber,
      totalAmount: total,
      depositAmount: deposit,
      balanceDue: total - deposit,
      currency: data.currency ?? "USD",
      expectedEta: data.expectedEta,
      notes: data.notes,
    },
  });
}

// ─── Shipment ─────────────────────────────────────────────────────────────────

export async function createShipment(
  userId: string,
  data: {
    reference?: string | null;
    supplier?: string | null;
    origin?: string | null;
    destination?: string | null;
    mode?: string;
    stage?: string;
    carrier?: string | null;
    trackingNumber?: string | null;
    cartons?: number | null;
    units?: number | null;
    shippingCost?: number | null;
    currency?: string;
    etaDeparture?: Date | null;
    etaArrival?: Date | null;
    notes?: string | null;
  }
) {
  return prisma.shipment.create({
    data: {
      userId,
      reference: data.reference,
      supplier: data.supplier,
      origin: data.origin,
      destination: data.destination,
      mode: (data.mode as never) ?? "SEA",
      stage: (data.stage as never) ?? "PREPARING",
      carrier: data.carrier,
      trackingNumber: data.trackingNumber,
      cartons: data.cartons,
      units: data.units,
      shippingCost: data.shippingCost,
      currency: data.currency ?? "USD",
      etaDeparture: data.etaDeparture,
      etaArrival: data.etaArrival,
      notes: data.notes,
    },
  });
}

// ─── Expense ──────────────────────────────────────────────────────────────────

export async function createExpense(
  userId: string,
  data: {
    name: string;
    category?: string | null;
    amount: number;
    currency?: string;
    frequency?: string;
    effectiveAt: Date;
    endsAt?: Date | null;
    vendor?: string | null;
    notes?: string | null;
  }
) {
  return prisma.expense.create({
    data: {
      userId,
      name: data.name,
      category: data.category,
      amount: data.amount,
      currency: data.currency ?? "USD",
      frequency: (data.frequency as never) ?? "MONTHLY",
      effectiveAt: data.effectiveAt,
      endsAt: data.endsAt,
      vendor: data.vendor,
      notes: data.notes,
    },
  });
}

// ─── Project ──────────────────────────────────────────────────────────────────

export async function createProject(
  userId: string,
  data: {
    title: string;
    description?: string | null;
    status?: string;
    owner?: string | null;
    dueDate?: Date | null;
    priority?: number;
    notes?: string | null;
  }
) {
  return prisma.project.create({
    data: {
      userId,
      title: data.title,
      description: data.description,
      status: (data.status as never) ?? "BACKLOG",
      owner: data.owner,
      dueDate: data.dueDate,
      priority: data.priority ?? 0,
      notes: data.notes,
    },
  });
}
