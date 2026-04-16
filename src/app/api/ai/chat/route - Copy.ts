import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { toNum } from "@/lib/utils/math";
import { todayUtc, daysAgo } from "@/lib/utils/dates";

const SYSTEM_PROMPT = `You are an expert Amazon FBA business analyst embedded in Commerce OS, a dashboard for Amazon sellers. You have access to the seller's REAL business data shown below. Answer questions with specific numbers from the data. Be concise, direct, and actionable. When you don't have enough data to answer, say so. Format responses with markdown for readability.`;

// ─── Build real context from database ──────────────────────────────────────

async function buildRealContext(userId: string, page: string): Promise<string> {
  const start = daysAgo(29);
  const today = todayUtc();

  const products = await prisma.product.findMany({
    where: { userId, status: "ACTIVE" },
    select: {
      id: true, asin: true, title: true, brand: true,
      setting: { select: { landedCogs: true } },
      inventorySnapshots: {
        orderBy: { snapshotDate: "desc" },
        take: 1,
        select: { available: true, reserved: true, inbound: true },
      },
    },
  });

  if (products.length === 0) {
    return `--- SELLER DATA (Last 30 Days) ---\nNo active products found.\n--- END DATA ---`;
  }

  const productIds = products.map(p => p.id);

  const [salesAgg, feesAgg, adsAgg, topCampaigns] = await Promise.all([
    prisma.dailySale.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { grossSales: true, unitsSold: true, refundAmount: true, refundCount: true, orderCount: true },
    }),
    prisma.dailyFee.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { referralFee: true, fbaFee: true, storageFee: true, awdStorageFee: true, otherFees: true, reimbursement: true },
    }),
    prisma.dailyAd.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today } },
      _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    }),
    prisma.dailyAd.groupBy({
      by: ["campaignName"],
      where: { productId: { in: productIds }, date: { gte: start, lte: today }, campaignName: { not: null } },
      _sum: { spend: true, attributedSales: true, clicks: true, impressions: true },
      orderBy: { _sum: { spend: "desc" } },
      take: 10,
    }),
  ]);

  const salesMap = new Map(salesAgg.map(s => [s.productId, s._sum]));
  const feesMap = new Map(feesAgg.map(f => [f.productId, f._sum]));
  const adsMap = new Map(adsAgg.map(a => [a.productId, a._sum]));

  let totalRevenue = 0, totalProfit = 0, totalOrders = 0, totalUnits = 0;
  let totalAdSpend = 0, totalAdSales = 0, totalImpressions = 0, totalClicks = 0;
  let totalRefunds = 0, totalFees = 0, totalCogs = 0;

  const productLines: string[] = [];

  for (const p of products) {
    const sales = salesMap.get(p.id);
    const fees = feesMap.get(p.id);
    const ads = adsMap.get(p.id);
    const inv = p.inventorySnapshots[0];
    const cogs = toNum(p.setting?.landedCogs);

    const gross = toNum(sales?.grossSales);
    const units = sales?.unitsSold ?? 0;
    const orders = sales?.orderCount ?? 0;
    const refunds = toNum(sales?.refundAmount);
    const feesTotal = toNum(fees?.referralFee) + toNum(fees?.fbaFee) + toNum(fees?.storageFee) + toNum(fees?.awdStorageFee) + toNum(fees?.otherFees) - toNum(fees?.reimbursement);
    const adSpend = toNum(ads?.spend);
    const adSales = toNum(ads?.attributedSales);
    const cogsTotal = cogs * units;
    const profit = gross - refunds - feesTotal - cogsTotal - adSpend;
    const acos = adSales > 0 ? (adSpend / adSales * 100) : null;

    const available = (inv?.available ?? 0) + (inv?.inbound ?? 0);
    const avgDaily = units / 30;
    const daysLeft = avgDaily > 0 ? Math.round(available / avgDaily) : null;

    totalRevenue += gross;
    totalProfit += profit;
    totalOrders += orders;
    totalUnits += units;
    totalAdSpend += adSpend;
    totalAdSales += adSales;
    totalImpressions += toNum(ads?.impressions);
    totalClicks += toNum(ads?.clicks);
    totalRefunds += refunds;
    totalFees += feesTotal;
    totalCogs += cogsTotal;

    const shortTitle = p.title?.substring(0, 50) || p.asin;
    productLines.push(`- ${shortTitle} (${p.asin}, ${p.brand ?? "Unknown"}): Revenue $${gross.toFixed(0)}, Profit $${profit.toFixed(0)}, Units ${units}, ACOS ${acos?.toFixed(1) ?? "N/A"}%, FBA Stock ${inv?.available ?? 0} (${daysLeft !== null ? daysLeft + "d" : "N/A"})`);
  }

  const campaignLines = topCampaigns.map(c => {
    const spend = toNum(c._sum.spend);
    const sales = toNum(c._sum.attributedSales);
    const acos = sales > 0 ? (spend / sales * 100).toFixed(1) : "N/A";
    return `- ${c.campaignName}: Spend $${spend.toFixed(0)}, Sales $${sales.toFixed(0)}, ACOS ${acos}%`;
  });

  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : "0";
  const tacos = totalRevenue > 0 ? (totalAdSpend / totalRevenue * 100).toFixed(1) : "0";
  const overallAcos = totalAdSales > 0 ? (totalAdSpend / totalAdSales * 100).toFixed(1) : "0";
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : "0";

  return `--- SELLER DATA (Last 30 Days) ---
Revenue: $${totalRevenue.toFixed(0)} | Profit: $${totalProfit.toFixed(0)} (${margin}% margin) | Orders: ${totalOrders} | Units: ${totalUnits}
Ad Spend: $${totalAdSpend.toFixed(0)} | ACOS: ${overallAcos}% | TACOS: ${tacos}% | Ad Sales: $${totalAdSales.toFixed(0)}
Impressions: ${totalImpressions.toLocaleString()} | Clicks: ${totalClicks.toLocaleString()} | CTR: ${ctr}%
Refunds: $${totalRefunds.toFixed(0)} | Amazon Fees: $${totalFees.toFixed(0)} | COGS: $${totalCogs.toFixed(0)}

Products:
${productLines.join("\n")}

Top PPC Campaigns:
${campaignLines.join("\n")}

Current Page: User is viewing the "${page}" page.
--- END DATA ---`;
}

// ─── POST handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();

    const body = await req.json();
    const { message, context } = body as {
      message: string;
      context?: string;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const contextBlock = await buildRealContext(userId, context || "overview");

    if (!apiKey) {
      // No API key — return the raw context as a fallback so the panel isn't broken
      const fallback = `I don't have an AI API key configured, but here's your real data:\n\n${contextBlock}`;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(fallback));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    const client = new Anthropic({ apiKey });

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${contextBlock}\n\nUser question: ${message}`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[AI Chat] Error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
