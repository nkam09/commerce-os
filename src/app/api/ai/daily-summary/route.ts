import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getOverviewDashboard, getCashForecast } from "@/lib/db";
import { generateDailySummary, buildCompanyContextPack } from "@/lib/ai-service";

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const { marketplaceId, startingCash } = await req.json();
    if (!marketplaceId) return NextResponse.json({ error: "marketplaceId is required" }, { status: 400 });
    const [overview, cashForecast] = await Promise.all([
      getOverviewDashboard(user.id, marketplaceId, "MTD"),
      getCashForecast(user.id, startingCash ?? 48000, 6),
    ]);
    const contextPack = buildCompanyContextPack({
      period: "MTD",
      totalSales: overview.totals.grossSales,
      totalNetProfit: overview.totals.netProfit,
      totalAdSpend: overview.totals.adSpend,
      marginPercent: overview.avgMargin,
      productSummaries: overview.products.map(({ product, summary }: any) => ({ sku: product.sku, netProfit: summary?.netProfit ?? 0, healthStatus: "HEALTHY" })),
      cashForecast: cashForecast.map(m => ({ month: m.month, endingCash: m.endingCash, cashFloorBreach: m.cashFloorBreach })),
      openCriticalAlerts: overview.alerts.filter((a: any) => a.severity === "HIGH").length,
      alertTitles: overview.alerts.map((a: any) => a.title),
    });
    const summary = await generateDailySummary(contextPack);
    return NextResponse.json(summary);
  } catch (e: any) {
    console.error("[ai/daily-summary]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
