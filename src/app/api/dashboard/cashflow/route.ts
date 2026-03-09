import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getCashForecast } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user         = await getUserFromRequest(req);
    const startingCash = parseFloat(req.nextUrl.searchParams.get("startingCash") ?? "48000");
    const months       = parseInt(req.nextUrl.searchParams.get("months") ?? "6");

    const forecast = await getCashForecast(user.id, startingCash, months);

    const totalInflows  = forecast.reduce((s, m) => s + m.totalInflows,  0);
    const totalOutflows = forecast.reduce((s, m) => s + m.totalOutflows, 0);
    const breachMonths  = forecast.filter(m => m.cashFloorBreach).map(m => m.month);
    const lowestCash    = Math.min(...forecast.map(m => m.endingCash));

    return NextResponse.json({
      startingCash,
      forecast,
      summary: {
        totalInflows,
        totalOutflows,
        netCashFlow: totalInflows - totalOutflows,
        lowestProjectedCash: lowestCash,
        breachMonths,
        hasBreach: breachMonths.length > 0,
      },
    });
  } catch (e: any) {
    console.error("[cashflow]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}