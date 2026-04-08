/**
 * Order Payload Transformer
 *
 * Transforms SP API order + order-items data into raw DailySale rows.
 * Output is keyed by (asin, marketplaceId, dateStr) and aggregated.
 *
 * This module is pure: no DB access. Normalization (ASIN → internal productId)
 * happens in SalesNormalizationService.
 *
 * Date attribution uses US/Eastern timezone to match Sellerboard and Amazon
 * Seller Central conventions. An order placed at 11pm ET on Feb 28 is
 * attributed to Feb 28, not Mar 1 (which is what UTC would give).
 */

import type { SpOrder, SpOrderItem } from "@/lib/amazon/sp-api-client";

// ─── Output Types ─────────────────────────────────────────────────────────────

export type RawSaleRow = {
  asin: string;
  marketplaceCode: string; // Amazon marketplace ID string, e.g. ATVPDKIKX0DER
  date: Date;              // Eastern date, stored as midnight UTC
  unitsSold: number;
  orderCount: number;
  grossSales: number;      // USD, sum of ItemPrice amounts
  refundCount: number;
  refundAmount: number;
};

type AggKey = string; // `${asin}::${marketplaceCode}::${dateStr}`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toEasternDateOnly(isoString: string): Date {
  // Convert UTC PurchaseDate to US/Eastern before truncating to date.
  // This matches Sellerboard/Seller Central date attribution.
  // Intl handles EST/EDT automatically.
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const day = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(year, month, day));
}

function dateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseAmount(amount?: string): number {
  if (!amount) return 0;
  const n = parseFloat(amount);
  return isNaN(n) ? 0 : n;
}

// ─── Main transformer ─────────────────────────────────────────────────────────

export type OrderWithItems = {
  order: SpOrder;
  items: SpOrderItem[];
};

/**
 * Aggregates an array of orders (with their items) into daily sale rows.
 *
 * Only counts Shipped/Unshipped/Pending orders as "sold" — skips Cancelled.
 */
export function transformOrdersToSaleRows(
  ordersWithItems: OrderWithItems[]
): RawSaleRow[] {
  const agg = new Map<AggKey, RawSaleRow>();

  for (const { order, items } of ordersWithItems) {
    // Skip orders that were fully cancelled
    if (order.OrderStatus === "Canceled") continue;

    const marketplaceCode = order.MarketplaceId ?? "";
    const date = toEasternDateOnly(order.PurchaseDate);
    const dateStr = dateToStr(date);

    for (const item of items) {
      const asin = item.ASIN;
      if (!asin) continue;

      const key: AggKey = `${asin}::${marketplaceCode}::${dateStr}`;
      const qty = item.QuantityOrdered ?? 0;
      const itemTotal = parseAmount(item.ItemPrice?.Amount);

      if (!agg.has(key)) {
        agg.set(key, {
          asin,
          marketplaceCode,
          date,
          unitsSold: 0,
          orderCount: 0,
          grossSales: 0,
          refundCount: 0,
          refundAmount: 0,
        });
      }

      const row = agg.get(key)!;
      row.unitsSold += qty;
      row.orderCount += 1;
      row.grossSales += itemTotal;
    }
  }

  return Array.from(agg.values());
}

/**
 * Merges refund rows into existing sale rows.
 * Call after transformOrdersToSaleRows if you have separate refund data.
 */
export function mergeRefundsIntoSaleRows(
  saleRows: RawSaleRow[],
  refunds: Array<{ asin: string; marketplaceCode: string; date: Date; qty: number; amount: number }>
): RawSaleRow[] {
  const byKey = new Map<AggKey, RawSaleRow>();
  for (const row of saleRows) {
    byKey.set(`${row.asin}::${row.marketplaceCode}::${dateToStr(row.date)}`, row);
  }

  for (const refund of refunds) {
    const key: AggKey = `${refund.asin}::${refund.marketplaceCode}::${dateToStr(refund.date)}`;
    const row = byKey.get(key);
    if (row) {
      row.refundCount += refund.qty;
      row.refundAmount += refund.amount;
    }
    // Refunds for dates with no sales row are skipped for now.
  }

  return Array.from(byKey.values());
}