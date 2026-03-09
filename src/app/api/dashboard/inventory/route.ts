import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma, { getProductInventorySummary } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user          = await getUserFromRequest(req);
    const marketplaceId = req.nextUrl.searchParams.get("marketplaceId") ?? "";

    if (!marketplaceId) {
      return NextResponse.json({ error: "marketplaceId is required" }, { status: 400 });
    }

    const products = await prisma.product.findMany({
      where:   { userId: user.id, status: { not: "ARCHIVED" } },
      include: { settings: true },
      orderBy: { title: "asc" },
    });

    const inventories = await Promise.all(
      products.map(async (product) => {
        const summary = await getProductInventorySummary(product.id, marketplaceId);
        return {
          id:       product.id,
          sku:      product.sku,
          title:    product.title,
          asin:     product.asin,
          settings: product.settings,
          summary,
        };
      })
    );

    const reorderNowCount    = inventories.filter(i => i.summary?.reorderNow).length;
    const stockoutRiskCount  = inventories.filter(i => i.summary?.healthStatus === "STOCKOUT_RISK").length;
    const atRiskCount        = inventories.filter(i => i.summary?.healthStatus === "AT_RISK").length;
    const healthyCount       = inventories.filter(i => i.summary?.healthStatus === "HEALTHY").length;
    const totalInbound       = inventories.reduce((s, i) => s + (i.summary?.inbound ?? 0), 0);
    const totalAvailable     = inventories.reduce((s, i) => s + (i.summary?.available ?? 0), 0);

    return NextResponse.json({
      summary: {
        reorderNowCount,
        stockoutRiskCount,
        atRiskCount,
        healthyCount,
        totalInbound,
        totalAvailable,
      },
      products: inventories,
    });
  } catch (e: any) {
    console.error("[inventory]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}