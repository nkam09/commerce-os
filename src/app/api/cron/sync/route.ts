import { NextRequest, NextResponse } from "next/server";
import { runFullSync } from "@/lib/amazon-sync";
import { prisma } from "@/lib/prisma";

// This route is called by a cron job every 6 hours
// Protect it with a secret token so only the scheduler can call it
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = process.env.COMMERCE_OS_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: "COMMERCE_OS_USER_ID not set" }, { status: 500 });
  }

  try {
    console.log(`[cron] Starting scheduled sync for user ${userId}`);
    const connection = await prisma.syncConnection.findFirst({ where: { userId } });
    if (!connection?.accessToken) {
      return NextResponse.json({ error: "No sync connection found" }, { status: 400 });
    }

    const results = await runFullSync(userId, connection.accessToken, 3); // last 3 days
    console.log(`[cron] Sync complete:`, results);

    return NextResponse.json({ ok: true, results, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error("[cron] Sync failed:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
