import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getDashboardTilesData, queryCustomPeriod, type TilesCombo } from "@/lib/services/dashboard-tiles-service";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";

const VALID_COMBOS = new Set(["default", "days", "weeks", "months", "quarters"]);

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const raw = req.nextUrl.searchParams.get("combo") ?? "default";
    const combo: TilesCombo = VALID_COMBOS.has(raw) ? (raw as TilesCombo) : "default";
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");

    // If from/to are provided, return a single custom period
    if (fromParam && toParam) {
      const from = new Date(fromParam + "T00:00:00Z");
      const to = new Date(toParam + "T00:00:00Z");

      console.log("[tiles] custom range query:", { userId, from: fromParam, to: toParam });

      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return apiSuccess({ periods: [], products: [] });
      }

      // Format a human-readable label
      const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const label = `${SHORT[from.getUTCMonth()]} ${from.getUTCDate()} – ${SHORT[to.getUTCMonth()]} ${to.getUTCDate()}, ${to.getUTCFullYear()}`;

      const period = await queryCustomPeriod(userId, from, to, label);

      console.log("[tiles] custom period result:", {
        label: period.label,
        grossSales: period.grossSales,
        unitsSold: period.unitsSold,
        netProfit: period.netProfit,
      });

      return apiSuccess({ periods: [period], products: [] });
    }

    // Standard combo query
    console.log("[tiles] userId:", userId, "combo:", combo);
    const data = await getDashboardTilesData(userId, combo);
    console.log("[tiles] returned", data.periods.length, "periods,", data.products.length, "products");
    return apiSuccess(data);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
