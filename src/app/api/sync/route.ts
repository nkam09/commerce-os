// app/api/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { runFullSync } from "@/lib/amazon-sync";

export async function POST(req: NextRequest) {
  try {
    const user     = await getUserFromRequest(req);
    const body     = await req.json().catch(() => ({}));
    const daysBack = Number(body.daysBack ?? 30);

    console.log(`[sync] Starting full sync for user ${user.id}, daysBack=${daysBack}`);

    const result = await runFullSync(user.id, daysBack);

    console.log(`[sync] Completed in ${result.duration}ms`, result.steps);

    // Update sync connection timestamps
    const { default: prisma } = await import("@/lib/db");
    await prisma.syncConnection.upsert({
      where:  { userId_provider: { userId: user.id, provider: "amazon_sp_api" } },
      create: { userId: user.id, provider: "amazon_sp_api", lastSyncAt: new Date(), status: result.success ? "ACTIVE" : "ERROR" },
      update: { lastSyncAt: new Date(), status: result.success ? "ACTIVE" : "ERROR" },
    });

    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (err: any) {
    console.error("[sync] Fatal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET returns last sync time
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const { default: prisma } = await import("@/lib/db");

    const conn = await prisma.syncConnection.findUnique({
      where: { userId_provider: { userId: user.id, provider: "amazon_sp_api" } },
    });

    return NextResponse.json({
      lastSyncAt:  conn?.lastSyncAt ?? null,
      status:      conn?.status ?? "NEVER_SYNCED",
      marketplace: "Amazon",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
