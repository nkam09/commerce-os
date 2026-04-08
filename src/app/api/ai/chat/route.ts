import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are an Amazon FBA expert analyst embedded in Commerce OS. You have access to the seller's real business data. Answer questions with specific numbers, identify problems, suggest actions. Be direct and data-driven. When referencing metrics, always include the time period. Format dollar amounts and percentages precisely.`;

function buildContextBlock(page: string) {
  return `
--- SELLER DASHBOARD CONTEXT (Last 30 Days) ---

**Revenue & Profitability**
- Total Revenue: $11,642.38
- Total Profit: $3,218.74 (27.6% margin)
- Total Orders: 487
- Units Sold: 1,124
- Refund Rate: 3.2%

**Advertising (PPC)**
- Total Ad Spend: $948.22
- ACOS: 22.4%
- TACOS: 8.1%
- Total Ad Sales: $4,232.10
- Impressions: 284,320
- Clicks: 3,847 (1.35% CTR)

**Top Products Performance (Last 30 Days)**
1. Eco-Friendly Water Bottle 50-pack — Revenue: $4,280, Profit: $1,412, Units: 214, ACOS: 18.2%
2. Eco-Friendly Water Bottle 100-pack — Revenue: $3,640, Profit: $982, Units: 91, ACOS: 24.8%
3. Bamboo Utensil Set — Revenue: $2,122, Profit: $548, Units: 318, ACOS: 28.1%
4. Organic Cotton Tote Bag — Revenue: $1,600, Profit: $276, Units: 501, ACOS: 19.4%

**PPC Campaigns**
- "Water Bottle - Exact" — Spend: $312, Sales: $1,890, ACOS: 16.5% (performing well)
- "Water Bottle - Broad" — Spend: $245, Sales: $1,024, ACOS: 23.9% (moderate)
- "Bamboo Utensils - Auto" — Spend: $198, Sales: $520, ACOS: 38.1% (needs review)
- "Tote Bag - Phrase" — Spend: $112, Sales: $482, ACOS: 23.2% (moderate)
- "Brand Defense" — Spend: $81, Sales: $316, ACOS: 25.6% (acceptable)

**Inventory Levels**
- Eco-Friendly Water Bottle 50-pack: 342 units (est. 48 days of stock)
- Eco-Friendly Water Bottle 100-pack: 87 units (est. 29 days — LOW)
- Bamboo Utensil Set: 510 units (est. 48 days of stock)
- Organic Cotton Tote Bag: 1,204 units (est. 72 days of stock — overstocked)

**Current Page Context**: User is viewing the "${page}" page.
--- END CONTEXT ---`;
}

const MOCK_RESPONSE = `Based on your last 30 days of data, here's a quick summary:

**Revenue & Profit**
- You generated **$11,642** in revenue with **$3,219 profit** (27.6% margin) — solid performance.

**Top Concern: Inventory**
- Your **100-pack Water Bottle** only has **29 days of stock** remaining. I'd recommend placing a restock order within the next week to avoid stockouts.
- Meanwhile, the **Organic Cotton Tote Bag** is overstocked at 72 days — consider running a promotion.

**PPC Action Items**
- The **"Bamboo Utensils - Auto"** campaign has a **38.1% ACOS** — well above your target. Consider pausing underperforming keywords or reducing bids.
- Your **"Water Bottle - Exact"** campaign is your best performer at **16.5% ACOS** — consider increasing budget here.

Want me to dive deeper into any of these areas?`;

export async function POST(req: NextRequest) {
  try {
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

    // If no API key, return a mock response so the panel works in development
    if (!apiKey) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          // Simulate streaming by sending chunks
          const words = MOCK_RESPONSE.split(" ");
          for (let i = 0; i < words.length; i++) {
            const chunk = (i === 0 ? "" : " ") + words[i];
            controller.enqueue(encoder.encode(chunk));
            await new Promise((r) => setTimeout(r, 20));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    const client = new Anthropic({ apiKey });
    const contextBlock = buildContextBlock(context || "overview");

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
    console.error("[AI Chat] Error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
