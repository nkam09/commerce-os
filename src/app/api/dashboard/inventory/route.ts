import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const userId = process.env.COMMERCE_OS_USER_ID!;
    const marketplaceId = process.env.NEXT_PUBLIC_MARKETPLACE_ID!;

    // Get all active products with their settings
    const products = await prisma.product.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      include: { settings: true },
      orderBy: { title: "asc" },
    });

    // Date ranges for velocity calculation (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get latest inventory snapshots (FBA stock if available)
    const snapshots = await prisma.inventorySnapshot.findMany({
      where: {
        productId: { in: products.map((p) => p.id) },
        marketplaceId,
        snapshotAt: {
          gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { snapshotAt: "desc" },
    });

    // Map latest snapshot per product
    const snapshotMap = new Map<string, typeof snapshots[0]>();
    for (const s of snapshots) {
      if (!snapshotMap.has(s.productId)) snapshotMap.set(s.productId, s);
    }

    // Get sales data for velocity
    const salesData = await prisma.dailySales.findMany({
      where: {
        productId: { in: products.map((p) => p.id) },
        marketplaceId,
        date: { gte: thirtyDaysAgo },
      },
    });

    // Aggregate units sold per product over last 30 days
    const unitsMap = new Map<string, number>();
    for (const s of salesData) {
      unitsMap.set(s.productId, (unitsMap.get(s.productId) ?? 0) + s.unitsSold);
    }

    // Get purchase orders (inbound stock)
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        userId,
        status: { in: ["ORDERED", "SHIPPED", "IN_TRANSIT"] },
      },
      include: { items: true },
    });

    // Map inbound units per product SKU
    const inboundMap = new Map<string, number>();
    for (const po of purchaseOrders) {
      for (const item of po.items) {
        inboundMap.set(item.sku, (inboundMap.get(item.sku) ?? 0) + item.quantity);
      }
    }

    // Build inventory rows
    const rows = products.map((product) => {
      const snapshot = snapshotMap.get(product.id);
      const available = snapshot?.quantityAvailable ?? 0;
      const inbound = inboundMap.get(product.sku) ?? 0;
      const unitsSold30d = unitsMap.get(product.id) ?? 0;
      const velocityPerDay = unitsSold30d / 30;

      const settings = product.settings;
      const reorderPoint = settings?.reorderPoint ?? 50;
      const reorderQty = settings?.reorderQty ?? 200;
      const leadTimeDays = settings?.leadTimeDays ?? 30;
      const cogs = settings?.landedCogsPerUnit ?? 0;

      // Days of stock remaining (FBA units + inbound)
      const totalUnits = available + inbound;
      const daysLeft =
        velocityPerDay > 0
          ? Math.floor(totalUnits / velocityPerDay)
          : available > 0
          ? 999
          : 0;

      // Reorder date = today + (daysLeft - leadTimeDays)
      const reorderDaysFromNow = daysLeft - leadTimeDays;
      const reorderDate =
        reorderDaysFromNow > 0
          ? new Date(now.getTime() + reorderDaysFromNow * 24 * 60 * 60 * 1000)
          : null;

      // Suggested reorder qty
      const suggestedQty = reorderQty;
      const cashNeeded = suggestedQty * cogs;

      // Status
      let status: "HEALTHY" | "AT_RISK" | "CRITICAL" | "OUT_OF_STOCK";
      if (available === 0 && inbound === 0) {
        status = "OUT_OF_STOCK";
      } else if (available <= reorderPoint * 0.5 || daysLeft < leadTimeDays) {
        status = "CRITICAL";
      } else if (available <= reorderPoint || daysLeft < leadTimeDays * 1.5) {
        status = "AT_RISK";
      } else {
        status = "HEALTHY";
      }

      return {
        productId: product.id,
        sku: product.sku,
        asin: product.asin,
        title: product.title,
        available,
        inbound,
        velocityPerDay: parseFloat(velocityPerDay.toFixed(2)),
        daysLeft,
        reorderDate: reorderDate?.toISOString() ?? null,
        reorderPoint,
        suggestedQty,
        cashNeeded: parseFloat(cashNeeded.toFixed(2)),
        status,
        hasCogs: cogs > 0,
      };
    });

    // Summary stats
    const totalAvailable = rows.reduce((s, r) => s + r.available, 0);
    const totalInbound = rows.reduce((s, r) => s + r.inbound, 0);
    const atRiskCount = rows.filter((r) => r.status === "AT_RISK").length;
    const criticalCount = rows.filter(
      (r) => r.status === "CRITICAL" || r.status === "OUT_OF_STOCK"
    ).length;

    return NextResponse.json({
      rows,
      summary: {
        totalAvailable,
        totalInbound,
        atRiskCount,
        criticalCount,
        totalProducts: rows.length,
      },
    });
  } catch (e: any) {
    console.error("Inventory API error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
