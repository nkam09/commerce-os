import { prisma } from "@/lib/db/prisma";
import { toNum } from "@/lib/utils/math";

// ─── Products page ────────────────────────────────────────────────────────────

export type ProductsPagePayload = {
  products: {
    id: string;
    asin: string;
    sku: string | null;
    title: string | null;
    brand: string | null;
    status: string;
    hasSettings: boolean;
    available: number;
    createdAt: string;
  }[];
};

export async function getProductsPage(userId: string, brand?: string): Promise<ProductsPagePayload> {
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" }, ...(brand ? { brand } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      asin: true,
      sku: true,
      title: true,
      brand: true,
      status: true,
      createdAt: true,
      setting: { select: { id: true } },
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
        select: { available: true },
      },
    },
  });

  return {
    products: products.map((p) => ({
      id: p.id,
      asin: p.asin,
      sku: p.sku,
      title: p.title,
      brand: p.brand,
      status: p.status,
      hasSettings: !!p.setting,
      available: p.inventorySnapshots[0]?.available ?? 0,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

// ─── Purchase Orders page ─────────────────────────────────────────────────────

export type PurchaseOrdersPagePayload = {
  purchaseOrders: {
    id: string;
    poNumber: string | null;
    supplier: string;
    status: string;
    totalAmount: number;
    depositAmount: number;
    balanceDue: number;
    currency: string;
    expectedEta: string | null;
    createdAt: string;
  }[];
};

export async function getPurchaseOrdersPage(userId: string): Promise<PurchaseOrdersPagePayload> {
  const pos = await prisma.purchaseOrder.findMany({
    where: { userId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return {
    purchaseOrders: pos.map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      supplier: po.supplier,
      status: po.status,
      totalAmount: toNum(po.totalAmount),
      depositAmount: toNum(po.depositAmount),
      balanceDue: toNum(po.balanceDue),
      currency: po.currency,
      expectedEta: po.expectedEta?.toISOString() ?? null,
      createdAt: po.createdAt.toISOString(),
    })),
  };
}

// ─── Shipments page ───────────────────────────────────────────────────────────

export type ShipmentsPagePayload = {
  shipments: {
    id: string;
    reference: string | null;
    supplier: string | null;
    origin: string | null;
    destination: string | null;
    mode: string;
    stage: string;
    carrier: string | null;
    trackingNumber: string | null;
    units: number | null;
    shippingCost: number | null;
    etaArrival: string | null;
    createdAt: string;
  }[];
};

export async function getShipmentsPage(userId: string): Promise<ShipmentsPagePayload> {
  const shipments = await prisma.shipment.findMany({
    where: { userId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return {
    shipments: shipments.map((s) => ({
      id: s.id,
      reference: s.reference,
      supplier: s.supplier,
      origin: s.origin,
      destination: s.destination,
      mode: s.mode,
      stage: s.stage,
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      units: s.units,
      shippingCost: s.shippingCost ? toNum(s.shippingCost) : null,
      etaArrival: s.etaArrival?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}

// ─── Expenses page ────────────────────────────────────────────────────────────

export type ExpensesPagePayload = {
  expenses: {
    id: string;
    name: string;
    category: string | null;
    amount: number;
    currency: string;
    frequency: string;
    effectiveAt: string;
    endsAt: string | null;
    vendor: string | null;
    createdAt: string;
  }[];
};

export async function getExpensesPage(userId: string): Promise<ExpensesPagePayload> {
  const expenses = await prisma.expense.findMany({
    where: { userId, archivedAt: null },
    orderBy: { effectiveAt: "desc" },
  });

  return {
    expenses: expenses.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      amount: toNum(e.amount),
      currency: e.currency,
      frequency: e.frequency,
      effectiveAt: e.effectiveAt.toISOString(),
      endsAt: e.endsAt?.toISOString() ?? null,
      vendor: e.vendor,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

// ─── Projects page ────────────────────────────────────────────────────────────

export type ProjectsPagePayload = {
  projects: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    owner: string | null;
    dueDate: string | null;
    priority: number;
    createdAt: string;
  }[];
};

export async function getProjectsPage(userId: string): Promise<ProjectsPagePayload> {
  const projects = await prisma.project.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return {
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      owner: p.owner,
      dueDate: p.dueDate?.toISOString() ?? null,
      priority: p.priority,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}
