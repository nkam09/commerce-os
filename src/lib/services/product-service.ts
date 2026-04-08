import { prisma } from "@/lib/db/prisma";
import { toNum } from "@/lib/utils/math";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductListItem = {
  id: string;
  asin: string;
  sku: string | null;
  title: string | null;
  brand: string | null;
  status: string;
  hasSettings: boolean;
  latestInventory: {
    available: number;
    reserved: number;
    inbound: number;
  } | null;
};

export type ProductDetail = ProductListItem & {
  fnsku: string | null;
  category: string | null;
  imageUrl: string | null;
  setting: {
    landedCogs: number | null;
    freightCost: number | null;
    prepCost: number | null;
    overheadCost: number | null;
    safetyStockDays: number | null;
    productionLeadDays: number | null;
    shippingLeadDays: number | null;
    receivingBufferDays: number | null;
    reorderCoverageDays: number | null;
    reorderMinQty: number | null;
    reorderCasePack: number | null;
    targetMarginPct: number | null;
    targetAcosPct: number | null;
    targetTacosPct: number | null;
    notes: string | null;
  } | null;
  openInsights: { id: string; title: string; severity: string }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapSetting(s: Record<string, unknown> | null) {
  if (!s) return null;
  return {
    landedCogs: toNum(s.landedCogs as never),
    freightCost: toNum(s.freightCost as never),
    prepCost: toNum(s.prepCost as never),
    overheadCost: toNum(s.overheadCost as never),
    safetyStockDays: s.safetyStockDays as number | null,
    productionLeadDays: s.productionLeadDays as number | null,
    shippingLeadDays: s.shippingLeadDays as number | null,
    receivingBufferDays: s.receivingBufferDays as number | null,
    reorderCoverageDays: s.reorderCoverageDays as number | null,
    reorderMinQty: s.reorderMinQty as number | null,
    reorderCasePack: s.reorderCasePack as number | null,
    targetMarginPct: toNum(s.targetMarginPct as never) || null,
    targetAcosPct: toNum(s.targetAcosPct as never) || null,
    targetTacosPct: toNum(s.targetTacosPct as never) || null,
    notes: s.notes as string | null,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getProductList(userId: string): Promise<ProductListItem[]> {
  const products = await prisma.product.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      asin: true,
      sku: true,
      title: true,
      brand: true,
      status: true,
      setting: { select: { id: true } },
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
        select: { available: true, reserved: true, inbound: true },
      },
    },
  });

  return products.map((p) => ({
    id: p.id,
    asin: p.asin,
    sku: p.sku,
    title: p.title,
    brand: p.brand,
    status: p.status,
    hasSettings: !!p.setting,
    latestInventory: p.inventorySnapshots[0] ?? null,
  }));
}

export async function getProductById(userId: string, productId: string): Promise<ProductDetail | null> {
  const p = await prisma.product.findFirst({
    where: { id: productId, userId },
    include: {
      setting: true,
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
      },
      aiInsights: {
        where: { status: "OPEN" },
        select: { id: true, title: true, severity: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!p) return null;

  return {
    id: p.id,
    asin: p.asin,
    sku: p.sku,
    fnsku: p.fnsku,
    title: p.title,
    brand: p.brand,
    category: p.category,
    imageUrl: p.imageUrl,
    status: p.status,
    hasSettings: !!p.setting,
    latestInventory: p.inventorySnapshots[0]
      ? {
          available: p.inventorySnapshots[0].available,
          reserved: p.inventorySnapshots[0].reserved,
          inbound: p.inventorySnapshots[0].inbound,
        }
      : null,
    setting: mapSetting(p.setting as Record<string, unknown> | null),
    openInsights: p.aiInsights,
  };
}
