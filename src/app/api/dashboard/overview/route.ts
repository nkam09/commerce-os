import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getOverviewDashboard } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user          = await getUserFromRequest(req);
    const marketplaceId = req.nextUrl.searchParams.get("marketplaceId") ?? "";
    const period        = (req.nextUrl.searchParams.get("period") ?? "MTD") as any;

    if (!marketplaceId) {
      return NextResponse.json({ error: "marketplaceId is required" }, { status: 400 });
    }

    const data = await getOverviewDashboard(user.id, marketplaceId, period);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("[overview]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}