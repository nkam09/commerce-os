import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);

    const insights = await prisma.aiInsight.findMany({
      where:   { userId: user.id, status: "OPEN" },
      include: { product: true },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    });

    const highCount   = insights.filter(i => i.severity === "HIGH").length;
    const mediumCount = insights.filter(i => i.severity === "MEDIUM").length;
    const lowCount    = insights.filter(i => i.severity === "LOW").length;

    return NextResponse.json({
      insights,
      summary: { highCount, mediumCount, lowCount, total: insights.length },
    });
  } catch (e: any) {
    console.error("[ai/insights GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    if (!["DISMISSED", "ACTED_ON"].includes(status)) {
      return NextResponse.json({ error: "status must be DISMISSED or ACTED_ON" }, { status: 400 });
    }

    const insight = await prisma.aiInsight.findFirst({
      where: { id, userId: user.id },
    });

    if (!insight) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }

    const updated = await prisma.aiInsight.update({
      where: { id },
      data:  { status },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error("[ai/insights PATCH]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}