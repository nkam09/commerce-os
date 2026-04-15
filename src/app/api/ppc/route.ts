import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  getPPCSummary,
  getCampaignRows,
  getPPCChartData,
  getByProductRows,
  getAllPeriodsRows,
  getCampaignProductBreakdown,
} from "@/lib/services/ppc-service";
import { apiSuccess, apiServerError, apiUnauthorized, parseBrand } from "@/lib/utils/api";

/**
 * GET /api/ppc?from=YYYY-MM-DD&to=YYYY-MM-DD&tab=campaigns|byproduct|allperiods
 *              &status=all&type=all&search=&granularity=daily
 *              &expand=campaignName (for product breakdown of a campaign)
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const sp = req.nextUrl.searchParams;

    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const tab = sp.get("tab") ?? "campaigns";
    const status = sp.get("status") ?? "all";
    const type = sp.get("type") ?? "all";
    const search = sp.get("search") ?? "";
    const granularity = (sp.get("granularity") ?? "daily") as "daily" | "weekly" | "monthly";
    const expand = sp.get("expand"); // campaign name to get product breakdown
    const brand = parseBrand(sp);

    // Parse dates — default to last 30 days
    const now = new Date();
    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999Z")
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00Z")
      : new Date(dateTo.getTime() - 30 * 86400000);

    console.log(`[ppc/api] GET /api/ppc | tab=${tab} from=${dateFrom.toISOString().slice(0, 10)} to=${dateTo.toISOString().slice(0, 10)} status=${status} type=${type} search="${search}" expand=${expand ?? "none"}`);

    // Handle expansion request (product breakdown for a campaign)
    if (expand) {
      const breakdown = await getCampaignProductBreakdown(userId, expand, dateFrom, dateTo, brand);
      console.log(`[ppc/api] Expansion for "${expand}": ${breakdown.length} products`);
      return apiSuccess({ breakdown });
    }

    // Always fetch summary + chart
    const [summary, chart] = await Promise.all([
      getPPCSummary(userId, dateFrom, dateTo, brand),
      getPPCChartData(userId, dateFrom, dateTo, granularity, brand),
    ]);

    // Tab-specific data
    let tabData: unknown;

    switch (tab) {
      case "byproduct": {
        const products = await getByProductRows(userId, dateFrom, dateTo, brand);
        tabData = { rows: products, totalCount: products.length };
        console.log(`[ppc/api] byproduct: ${products.length} products`);
        break;
      }
      case "allperiods": {
        const rows = await getAllPeriodsRows(userId, brand);
        tabData = { rows, totalCount: rows.length };
        console.log(`[ppc/api] allperiods: ${rows.length} campaigns`);
        break;
      }
      case "campaigns":
      default: {
        const campaigns = await getCampaignRows(userId, dateFrom, dateTo, { status, campaignType: type, search }, brand);
        tabData = { rows: campaigns, totalCount: campaigns.length };
        console.log(`[ppc/api] campaigns: ${campaigns.length} rows`);
        break;
      }
    }

    console.log(`[ppc/api] Result: spend=$${summary.adSpend.toFixed(2)}, ${chart.length} chart points, tab=${tab}`);

    return apiSuccess({ summary, chart, tab: tabData });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    console.error("[ppc/api] error:", err);
    return apiServerError(err);
  }
}
