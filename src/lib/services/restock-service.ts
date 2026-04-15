import { prisma } from "@/lib/db/prisma";
import { toNum, safeDiv, round } from "@/lib/utils/math";
import { daysAgo, todayUtc, toISODate, daysFromNow } from "@/lib/utils/dates";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ForecastProduct = {
  id: string;
  asin: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  fbaStock: number;
  recommendedOrderQty: number;
  recommendedOrderDate: string;
  projectedStockoutDate: string;
  salesVelocity: number;
  leadTime: {
    manufacturingDays: number;
    shippingDays: number;
    bufferDays: number;
    totalDays: number;
  };
  stockRunwayDays: number;
};

export type UnitSalesTrendRow = {
  id: string;
  asin: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  fbaStock: number;
  unitsSold: {
    today: number | null;
    yesterday: number | null;
    d7: number | null;
    d14: number | null;
    d30: number | null;
    d60: number | null;
    d90: number | null;
    d180: number | null;
    d365: number | null;
  };
  velocity: {
    d7: number | null;
    d14: number | null;
    d30: number | null;
    d60: number | null;
    d90: number | null;
    d180: number | null;
    d365: number | null;
  };
};

export type RestockProfileRow = {
  id: string;
  name: string;
  manufacturingDays: number;
  usePrepCenter: boolean;
  shippingToPrepDays: number;
  shippingToFbaDays: number;
  fbaBufferDays: number;
  targetStockRangeDays: number;
};

export type ProductSettings = {
  manufacturingDays: number;
  usePrepCenter: boolean;
  shippingToPrepDays: number;
  shippingToFbaDays: number;
  fbaBufferDays: number;
  targetStockRangeDays: number;
  overrideVelocity: number | null;
  seasonalMultipliers: number[];
  minOrderQty: number;
  orderQtyIncrement: number;
  preferredShippingMethod: string;
  carrierName: string;
  shippingCostPerUnit: number;
  customsDutyCost: number;
  supplierName: string;
  supplierEmail: string;
  supplierLeadTime: number | null;
  unitCost: number;
  minOrderValue: number;
  paymentTerms: string;
};

export type RestockData = {
  forecast: ForecastProduct[];
  unitSalesTrend: UnitSalesTrendRow[];
  profiles: RestockProfileRow[];
};

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_MANUFACTURING_DAYS = 30;
const DEFAULT_SHIPPING_DAYS = 35;
const DEFAULT_BUFFER_DAYS = 10;
const DEFAULT_COVERAGE_DAYS = 60;
const DEFAULT_MIN_QTY = 100;
const DEFAULT_CASE_PACK = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Query total unitsSold for a set of products within a date window.
 * Returns a Map<productId, totalUnits>.
 */
async function salesInWindow(
  productIds: string[],
  start: Date,
  end: Date
): Promise<Map<string, number>> {
  const agg = await prisma.dailySale.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      date: { gte: start, lte: end },
    },
    _sum: { unitsSold: true },
  });
  return new Map(agg.map((r) => [r.productId, r._sum.unitsSold ?? 0]));
}

/**
 * Safely look up a value from a Map, returning null if missing or if the
 * window extends beyond the product's existence (approximated by 0 sales).
 */
function salesOrNull(map: Map<string, number>, id: string): number | null {
  const v = map.get(id);
  return v !== undefined ? v : null;
}

function velocityOrNull(units: number | null, days: number): number | null {
  if (units === null || units === 0) return null;
  return round(units / days, 1);
}

// ─── Main Query ──────────────────────────────────────────────────────────────

export async function getRestockData(userId: string, brand?: string): Promise<RestockData> {
  const today = todayUtc();

  // 1. Load active products with settings
  const products = await prisma.product.findMany({
    where: { userId, status: "ACTIVE", ...(brand ? { brand } : {}) },
    include: { setting: true },
  });

  if (products.length === 0) {
    return { forecast: [], unitSalesTrend: [], profiles: [] };
  }

  const productIds = products.map((p) => p.id);

  // 2. Latest inventory snapshot per product
  const latestSnaps = await prisma.$queryRaw<
    { productId: string; available: number }[]
  >`
    SELECT DISTINCT ON ("productId")
      "productId",
      "available"
    FROM inventory_snapshots
    WHERE "productId" = ANY(${productIds})
    ORDER BY "productId", "snapshotDate" DESC
  `;
  const snapMap = new Map(latestSnaps.map((s) => [s.productId, s.available]));

  // 3. Sales windows for trend data
  const [
    salesToday,
    salesYesterday,
    sales7,
    sales14,
    sales30,
    sales60,
    sales90,
    sales180,
    sales365,
  ] = await Promise.all([
    salesInWindow(productIds, today, today),
    salesInWindow(productIds, daysAgo(1), daysAgo(1)),
    salesInWindow(productIds, daysAgo(7), today),
    salesInWindow(productIds, daysAgo(14), today),
    salesInWindow(productIds, daysAgo(30), today),
    salesInWindow(productIds, daysAgo(60), today),
    salesInWindow(productIds, daysAgo(90), today),
    salesInWindow(productIds, daysAgo(180), today),
    salesInWindow(productIds, daysAgo(365), today),
  ]);

  // 4. Restock profiles for this user
  const profileRows = await prisma.restockProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  const profiles: RestockProfileRow[] = profileRows.map((rp) => ({
    id: rp.id,
    name: rp.name,
    manufacturingDays: rp.manufacturingDays,
    usePrepCenter: rp.usePrepCenter,
    shippingToPrepDays: rp.shippingToPrepDays,
    shippingToFbaDays: rp.shippingToFbaDays,
    fbaBufferDays: rp.fbaBufferDays,
    targetStockRangeDays: rp.targetStockRangeDays,
  }));

  // 5. Build forecast & unit-sales-trend rows
  const forecast: ForecastProduct[] = [];
  const unitSalesTrend: UnitSalesTrendRow[] = [];

  for (const p of products) {
    const fbaStock = snapMap.get(p.id) ?? 0;
    const setting = p.setting;

    // Lead-time settings
    const manufacturingDays = setting?.productionLeadDays ?? DEFAULT_MANUFACTURING_DAYS;
    const shippingDays = setting?.shippingLeadDays ?? DEFAULT_SHIPPING_DAYS;
    const bufferDays = setting?.receivingBufferDays ?? DEFAULT_BUFFER_DAYS;
    const totalLeadDays = manufacturingDays + shippingDays + bufferDays;
    const coverageDays = setting?.reorderCoverageDays ?? DEFAULT_COVERAGE_DAYS;
    const minQty = setting?.reorderMinQty ?? DEFAULT_MIN_QTY;
    const casePack = Math.max(setting?.reorderCasePack ?? DEFAULT_CASE_PACK, 1);

    // Use 30-day velocity as primary
    const units30 = sales30.get(p.id) ?? 0;
    const velocity = round(safeDiv(units30, 30), 1);

    // Runway
    const stockRunwayDays = velocity > 0 ? Math.floor(fbaStock / velocity) : 999;
    const projectedStockoutDate = toISODate(daysFromNow(stockRunwayDays));

    // Recommended order qty (round up to case pack)
    let recommendedOrderQty = 0;
    if (velocity > 0) {
      const rawQty = Math.max(minQty, coverageDays * velocity);
      const packs = Math.ceil(rawQty / casePack);
      recommendedOrderQty = packs * casePack;
    }

    // Recommended order date: need to order totalLeadDays before stockout
    const orderInDays = Math.max(0, stockRunwayDays - totalLeadDays);
    const recommendedOrderDate = toISODate(daysFromNow(orderInDays));

    forecast.push({
      id: p.id,
      asin: p.asin,
      sku: p.sku ?? "",
      title: p.title ?? p.asin,
      imageUrl: p.imageUrl ?? null,
      fbaStock,
      recommendedOrderQty,
      recommendedOrderDate,
      projectedStockoutDate,
      salesVelocity: velocity,
      leadTime: {
        manufacturingDays,
        shippingDays,
        bufferDays,
        totalDays: totalLeadDays,
      },
      stockRunwayDays,
    });

    // Unit sales trend row
    const todayUnits = salesOrNull(salesToday, p.id);
    const yesterdayUnits = salesOrNull(salesYesterday, p.id);
    const u7 = salesOrNull(sales7, p.id);
    const u14 = salesOrNull(sales14, p.id);
    const u30 = salesOrNull(sales30, p.id);
    const u60 = salesOrNull(sales60, p.id);
    const u90 = salesOrNull(sales90, p.id);
    const u180 = salesOrNull(sales180, p.id);
    const u365 = salesOrNull(sales365, p.id);

    unitSalesTrend.push({
      id: p.id,
      asin: p.asin,
      sku: p.sku ?? "",
      title: p.title ?? p.asin,
      imageUrl: p.imageUrl ?? null,
      fbaStock,
      unitsSold: {
        today: todayUnits,
        yesterday: yesterdayUnits,
        d7: u7,
        d14: u14,
        d30: u30,
        d60: u60,
        d90: u90,
        d180: u180,
        d365: u365,
      },
      velocity: {
        d7: velocityOrNull(u7, 7),
        d14: velocityOrNull(u14, 14),
        d30: velocityOrNull(u30, 30),
        d60: velocityOrNull(u60, 60),
        d90: velocityOrNull(u90, 90),
        d180: velocityOrNull(u180, 180),
        d365: velocityOrNull(u365, 365),
      },
    });
  }

  // Sort forecast by stockRunwayDays ascending (most urgent first)
  forecast.sort((a, b) => a.stockRunwayDays - b.stockRunwayDays);
  unitSalesTrend.sort((a, b) => {
    const aIdx = forecast.findIndex((f) => f.id === a.id);
    const bIdx = forecast.findIndex((f) => f.id === b.id);
    return aIdx - bIdx;
  });

  return { forecast, unitSalesTrend, profiles };
}

// ─── Product Settings ────────────────────────────────────────────────────────

export async function getProductSettings(
  userId: string,
  asin: string
): Promise<ProductSettings> {
  const product = await prisma.product.findFirst({
    where: { userId, asin },
    include: { setting: true },
  });

  const s = product?.setting;

  return {
    manufacturingDays: s?.productionLeadDays ?? DEFAULT_MANUFACTURING_DAYS,
    usePrepCenter: false,
    shippingToPrepDays: 0,
    shippingToFbaDays: s?.shippingLeadDays ?? DEFAULT_SHIPPING_DAYS,
    fbaBufferDays: s?.receivingBufferDays ?? DEFAULT_BUFFER_DAYS,
    targetStockRangeDays: s?.reorderCoverageDays ?? DEFAULT_COVERAGE_DAYS,
    overrideVelocity: null,
    seasonalMultipliers: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    minOrderQty: s?.reorderMinQty ?? DEFAULT_MIN_QTY,
    orderQtyIncrement: Math.max(s?.reorderCasePack ?? 1, 1),
    preferredShippingMethod: "Sea",
    carrierName: "",
    shippingCostPerUnit: toNum(s?.freightCost),
    customsDutyCost: 0,
    supplierName: "",
    supplierEmail: "",
    supplierLeadTime: null,
    unitCost: toNum(s?.landedCogs),
    minOrderValue: 0,
    paymentTerms: "",
  };
}
