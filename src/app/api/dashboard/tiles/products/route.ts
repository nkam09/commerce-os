import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { queryProductRows } from "@/lib/services/dashboard-tiles-service";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";

/**
 * GET /api/dashboard/tiles/products?period=last_30&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns product-level performance data filtered by the given date range.
 * The `from` and `to` params control what dates are queried.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const period = req.nextUrl.searchParams.get("period") ?? "last_30";
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");

    // Parse dates — fall back to last 30 days if missing/invalid
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (fromParam && toParam) {
      const f = new Date(fromParam + "T00:00:00Z");
      const t = new Date(toParam + "T00:00:00Z");
      if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
        dateFrom = f;
        dateTo = t;
      }
    }

    console.log("[tiles/products] userId:", userId, "period:", period,
      "from:", dateFrom?.toISOString().slice(0, 10) ?? "default",
      "to:", dateTo?.toISOString().slice(0, 10) ?? "default");

    // Query products with the specified date range
    const serviceRows = await queryProductRows(userId, dateFrom, dateTo);

    console.log("[tiles/products] service returned", serviceRows.length, "products",
      "sample:", serviceRows[0] ? { asin: serviceRows[0].asin, grossSales: serviceRows[0].grossSales, units: serviceRows[0].unitsSold } : "none");

    // Transform service shape → table component shape
    const products = serviceRows.map((p) => ({
      id: p.id,
      asin: p.asin,
      sku: p.sku,
      title: p.title,
      imageUrl: p.imageUrl ?? null,
      price: p.unitsSold > 0 ? Math.round((p.grossSales / p.unitsSold) * 100) / 100 : 0,
      cogs: p.totalCogs > 0 && p.unitsSold > 0 ? Math.round((p.totalCogs / p.unitsSold) * 100) / 100 : 0,
      grossSales: p.grossSales,
      netRevenue: p.netRevenue,
      units: p.unitsSold,
      fees: p.totalFees,
      adSpend: p.adSpend,
      acos: p.acos,
      tacos: p.tacos,
      netProfit: p.netProfit,
      margin: p.netMarginPct,
      stock: p.available ?? 0,
      daysLeft: p.daysLeft,
      refunds: p.refunds,
      refundCount: p.refundCount,
      refundPct: p.grossSales > 0 ? p.refunds / p.grossSales : null,
      amazonFees: p.totalFees,
      estPayout: Math.round((p.netRevenue - p.totalFees) * 100) / 100,
      roi: p.totalCogs > 0 ? p.netProfit / p.totalCogs : null,
    }));

    console.log("[tiles/products] returning", products.length, "products for", period);
    return apiSuccess(products);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    console.error("[tiles/products] error:", err);
    return apiServerError(err);
  }
}
