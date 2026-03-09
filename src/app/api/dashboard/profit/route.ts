import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma, { getAllProductsProfitSummary } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user          = await getUserFromRequest(req);
    const marketplaceId = req.nextUrl.searchParams.get("marketplaceId") ?? "";
    const period        = (req.nextUrl.searchParams.get("period") ?? "MTD") as any;

    if (!marketplaceId) {
      return NextResponse.json({ error: "marketplaceId is required" }, { status: 400 });
    }

    const productProfits = await getAllProductsProfitSummary(user.id, marketplaceId, period);

    const totals = productProfits.reduce(
      (acc, { summary }) => {
        if (!summary) return acc;
        return {
          grossSales: acc.grossSales + summary.grossSales,
          netProfit:  acc.netProfit  + summary.netProfit,
          adSpend:    acc.adSpend    + summary.adSpend,
          amazonFees: acc.amazonFees + summary.amazonFees,
          cogsTotal:  acc.cogsTotal  + summary.cogsTotal,
          unitsSold:  acc.unitsSold  + summary.unitsSold,
        };
      },
      { grossSales: 0, netProfit: 0, adSpend: 0, amazonFees: 0, cogsTotal: 0, unitsSold: 0 }
    );

    const marginPercent = totals.grossSales > 0 ? totals.netProfit / totals.grossSales : null;
    const tacos         = totals.grossSales > 0 ? totals.adSpend   / totals.grossSales : null;

    // Weekly trend for chart — last 8 weeks
    const weeks = [];
    const today = new Date();
    for (let w = 7; w >= 0; w--) {
      const weekEnd   = new Date(today); weekEnd.setDate(today.getDate() - w * 7);
      const weekStart = new Date(weekEnd); weekStart.setDate(weekEnd.getDate() - 6);

      const [sales, ads, fees] = await Promise.all([
        prisma.dailySales.findMany({ where: { product: { userId: user.id }, marketplaceId, date: { gte: weekStart, lte: weekEnd } } }),
        prisma.dailyAds.findMany({   where: { product: { userId: user.id }, marketplaceId, date: { gte: weekStart, lte: weekEnd } } }),
        prisma.dailyFees.findMany({  where: { product: { userId: user.id }, marketplaceId, date: { gte: weekStart, lte: weekEnd } } }),
      ]);

      const wSales = sales.reduce((s, r) => s + r.grossSales, 0);
      const wAds   = ads.reduce((s, r) => s + r.spend, 0);
      const wFees  = fees.reduce((s, r) =>
        s + r.referralFees + r.fbaFees + r.storageFees + r.returnProcessingFees + r.otherFees, 0
      );
      const wRefunds = sales.reduce((s, r) => s + r.refundAmount, 0);
      const wUnits   = sales.reduce((s, r) => s + r.unitsSold, 0);

      // Approximate net profit without per-product COGS
      const wNetProfit = wSales - wRefunds - wAds - wFees;

      weeks.push({
        week:       `W${8 - w}`,
        weekStart:  weekStart.toISOString().split("T")[0],
        grossSales: wSales,
        netProfit:  wNetProfit,
        adSpend:    wAds,
        unitsSold:  wUnits,
      });
    }

    return NextResponse.json({
      period,
      totals,
      marginPercent,
      tacos,
      products: productProfits.map(({ product, summary }) => ({
        id:       product.id,
        sku:      product.sku,
        title:    product.title,
        summary,
      })),
      weeklyTrend: weeks,
    });
  } catch (e: any) {
    console.error("[profit]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}