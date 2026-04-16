import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round, calcReorder } from "@/lib/utils/math";
import { daysAgo, todayUtc } from "@/lib/utils/dates";

// ─── Inventory Planner Types ─────────────────────────────────────────────────

export type InventorySummaryCard = {
  label: string;
  highlighted?: boolean;
  units: number;
  costOfGoods: number;
  potentialSales: number;
  potentialProfit: number;
};

export type InventoryProductRow = {
  id: string;
  asin: string;
  fnsku: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  cogs: number;
  fulfillment: string;
  fbaStock: number;
  fbmStock: number;
  reserved: number;
  salesVelocity: number;
  daysOfStockLeft: number;
  sentToFba: number;
  sentToFbaStatus: string;
  prepCenterStock: number;
  ordered: number;
  daysUntilNextOrder: number | null;
  recommendedReorderQty: number;
  stockValue: number;
  roi: number;
  comment: string;
  stockHistory: number[];
};

export type InventoryPlannerData = {
  summaryCards: InventorySummaryCard[];
  products: InventoryProductRow[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STOCK_HISTORY_DAYS = 14;
const VELOCITY_WINDOW_DAYS = 30;
const AVG_MARKUP = 2.8;

/** Default product setting values when no ProductSetting row exists. */
const DEFAULTS = {
  landedCogs: 0,
  safetyStockDays: 14,
  productionLeadDays: 30,
  shippingLeadDays: 35,
  receivingBufferDays: 7,
  reorderCoverageDays: 60,
  reorderMinQty: 100,
  reorderCasePack: 1,
};

// ─── Summary Card Computation ────────────────────────────────────────────────

function computeSummaryCards(products: InventoryProductRow[]): InventorySummaryCard[] {
  const fbaFbm = {
    units: products.reduce((s, p) => s + p.fbaStock + p.fbmStock, 0),
    costOfGoods: products.reduce((s, p) => s + (p.fbaStock + p.fbmStock) * p.cogs, 0),
  };
  const prepAwd = {
    units: products.reduce((s, p) => s + p.prepCenterStock + p.sentToFba, 0),
    costOfGoods: products.reduce((s, p) => s + (p.prepCenterStock + p.sentToFba) * p.cogs, 0),
  };
  const ordered = {
    units: products.reduce((s, p) => s + p.ordered, 0),
    costOfGoods: products.reduce((s, p) => s + p.ordered * p.cogs, 0),
  };

  return [
    {
      label: "FBA + FBM",
      units: fbaFbm.units,
      costOfGoods: round(fbaFbm.costOfGoods),
      potentialSales: round(fbaFbm.costOfGoods * AVG_MARKUP),
      potentialProfit: round(fbaFbm.costOfGoods * (AVG_MARKUP - 1) * 0.55),
    },
    {
      label: "Prep + AWD",
      units: prepAwd.units,
      costOfGoods: round(prepAwd.costOfGoods),
      potentialSales: round(prepAwd.costOfGoods * AVG_MARKUP),
      potentialProfit: round(prepAwd.costOfGoods * (AVG_MARKUP - 1) * 0.55),
    },
    {
      label: "Ordered",
      units: ordered.units,
      costOfGoods: round(ordered.costOfGoods),
      potentialSales: round(ordered.costOfGoods * AVG_MARKUP),
      potentialProfit: round(ordered.costOfGoods * (AVG_MARKUP - 1) * 0.55),
    },
    {
      label: "Total",
      highlighted: true,
      units: fbaFbm.units + prepAwd.units + ordered.units,
      costOfGoods: round(fbaFbm.costOfGoods + prepAwd.costOfGoods + ordered.costOfGoods),
      potentialSales: round(
        (fbaFbm.costOfGoods + prepAwd.costOfGoods + ordered.costOfGoods) * AVG_MARKUP
      ),
      potentialProfit: round(
        (fbaFbm.costOfGoods + prepAwd.costOfGoods + ordered.costOfGoods) *
          (AVG_MARKUP - 1) *
          0.55
      ),
    },
  ];
}

// ─── Main Query ──────────────────────────────────────────────────────────────

export async function getInventoryPlannerData(
  userId: string,
  brand?: string
): Promise<InventoryPlannerData> {
  const today = todayUtc();
  const velocityStart = daysAgo(VELOCITY_WINDOW_DAYS);
  const historyStart = daysAgo(STOCK_HISTORY_DAYS);

  // 1. Fetch all active products for this user with settings
  const products = await prisma.product.findMany({
    where: { userId, status: "ACTIVE", ...(brand ? { brand } : {}) },
    include: { setting: true },
  });

  if (products.length === 0) {
    return { summaryCards: computeSummaryCards([]), products: [] };
  }

  const productIds = products.map((p) => p.id);

  // 2. Latest inventory snapshot per product (most recent snapshotDate)
  const latestSnapshots = await prisma.$queryRaw<
    {
      productId: string;
      available: number;
      reserved: number;
      inbound: number;
      awd: number;
      warehouse: number;
    }[]
  >`
    SELECT DISTINCT ON ("productId")
      "productId",
      "available",
      "reserved",
      "inbound",
      "awd",
      "warehouse"
    FROM inventory_snapshots
    WHERE "productId" = ANY(${productIds})
    ORDER BY "productId", "snapshotDate" DESC
  `;

  type SnapRow = (typeof latestSnapshots)[number];
  const snapByProduct = new Map<string, SnapRow>(
    latestSnapshots.map((s) => [s.productId, s])
  );

  // 3. Sales velocity: sum of unitsSold over last N days per product
  const salesAgg = await prisma.dailySale.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      date: { gte: velocityStart, lte: today },
    },
    _sum: { unitsSold: true },
  });

  const salesByProduct = new Map(
    salesAgg.map((s) => [s.productId, s._sum.unitsSold ?? 0])
  );

  // 4. Stock history: last 14 daily snapshots (available) per product
  const historyRows = await prisma.inventorySnapshot.findMany({
    where: {
      productId: { in: productIds },
      snapshotDate: { gte: historyStart, lte: today },
    },
    select: { productId: true, snapshotDate: true, available: true },
    orderBy: { snapshotDate: "asc" },
  });

  const historyByProduct = new Map<string, number[]>();
  for (const row of historyRows) {
    const arr = historyByProduct.get(row.productId) ?? [];
    arr.push(row.available);
    historyByProduct.set(row.productId, arr);
  }

  // 5. Ordered quantities from active supplier orders (not yet Delivered or Cancelled)
  const activeOrderItems = await prisma.$queryRawUnsafe<
    { asin: string; orderedQty: bigint | number }[]
  >(
    `SELECT soi.asin, SUM(soi.quantity) as "orderedQty"
     FROM supplier_order_items soi
     JOIN supplier_orders so ON soi."orderId" = so.id
     JOIN pm_spaces ps ON so."spaceId" = ps.id
     WHERE ps."userId" = $1
       AND so.status NOT IN ('Delivered', 'Cancelled')
     GROUP BY soi.asin`,
    userId
  );

  const orderedByAsin = new Map<string, number>();
  for (const row of activeOrderItems) {
    orderedByAsin.set(row.asin, Number(row.orderedQty));
  }

  // 6. Build product rows
  const rows: InventoryProductRow[] = products.map((p) => {
    const snap = snapByProduct.get(p.id);
    const available = snap?.available ?? 0;
    const reserved = snap?.reserved ?? 0;
    const inbound = snap?.inbound ?? 0;
    const awd = snap?.awd ?? 0;
    const warehouse = snap?.warehouse ?? 0;

    const totalUnitsSold = salesByProduct.get(p.id) ?? 0;
    const velocity = round(safeDiv(totalUnitsSold, VELOCITY_WINDOW_DAYS), 1);

    const setting = p.setting;
    const landedCogs = toNum(setting?.landedCogs) || DEFAULTS.landedCogs;
    const safetyStockDays = setting?.safetyStockDays ?? DEFAULTS.safetyStockDays;
    const productionLeadDays = setting?.productionLeadDays ?? DEFAULTS.productionLeadDays;
    const shippingLeadDays = setting?.shippingLeadDays ?? DEFAULTS.shippingLeadDays;
    const receivingBufferDays = setting?.receivingBufferDays ?? DEFAULTS.receivingBufferDays;
    const reorderCoverageDays = setting?.reorderCoverageDays ?? DEFAULTS.reorderCoverageDays;
    const reorderMinQty = setting?.reorderMinQty ?? DEFAULTS.reorderMinQty;
    const reorderCasePack = setting?.reorderCasePack ?? DEFAULTS.reorderCasePack;

    const reorder = calcReorder({
      available,
      inbound,
      avgDailySales: velocity,
      productionLeadDays,
      shippingLeadDays,
      receivingBufferDays,
      safetyStockDays,
      reorderCoverageDays,
      reorderMinQty,
      reorderCasePack: Math.max(reorderCasePack, 1),
      landedCogs,
    });

    // FBA stock = available (from FBA snapshot)
    // FBM stock = warehouse
    // Prep center / AWD stock = awd
    // Sent to FBA = inbound
    const fbaStock = available;
    const fbmStock = warehouse;
    const prepCenterStock = awd;
    const sentToFba = inbound;

    const totalStock = fbaStock + fbmStock;
    const stockValue = round(totalStock * landedCogs);

    // daysUntilNextOrder: if not under reorder point, estimate days until we hit it
    const daysUntilNextOrder = reorder.isUnderReorderPoint
      ? 0
      : velocity > 0
        ? Math.max(0, Math.floor(reorder.daysLeft - (productionLeadDays + shippingLeadDays + receivingBufferDays + safetyStockDays)))
        : null;

    // Simple ROI estimate: (sales - cogs) / cogs over velocity period
    const roi = landedCogs > 0 ? round(safeDiv(AVG_MARKUP - 1, 1), 1) : 0;

    const stockHistory = historyByProduct.get(p.id) ?? [];

    return {
      id: p.id,
      asin: p.asin,
      fnsku: p.fnsku ?? "",
      sku: p.sku ?? "",
      title: p.title ?? p.asin,
      imageUrl: p.imageUrl ?? null,
      cogs: landedCogs,
      fulfillment: fbmStock > 0 && fbaStock === 0 ? "FBM" : "FBA",
      fbaStock,
      fbmStock,
      reserved,
      salesVelocity: velocity,
      daysOfStockLeft: reorder.daysLeft,
      sentToFba,
      sentToFbaStatus: inbound > 0 ? "In Transit" : "None",
      prepCenterStock,
      ordered: orderedByAsin.get(p.asin) ?? 0,
      daysUntilNextOrder,
      recommendedReorderQty: reorder.suggestedQty,
      stockValue,
      roi,
      comment: reorder.isStockoutRisk
        ? "Low stock — reorder urgently"
        : reorder.isUnderReorderPoint
          ? "Below reorder point"
          : "",
      stockHistory,
    };
  });

  return {
    summaryCards: computeSummaryCards(rows),
    products: rows,
  };
}

/** Synchronous fallback — returns empty data (used by preview pages). */
export function getInventoryPlannerDataSync(): InventoryPlannerData {
  return {
    summaryCards: computeSummaryCards([]),
    products: [],
  };
}
