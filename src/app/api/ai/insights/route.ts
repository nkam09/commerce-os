import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/utils/api";
import { requireUser } from "@/lib/auth/require-user";

/* ─── Mock insights by page ─────────────────────────── */

const MOCK_INSIGHTS: Record<string, string[]> = {
  dashboard: [
    "Revenue is up 12% week-over-week to $11.6K, driven by the 100-pack SKU which saw a 23% increase in units.",
    "ACOS improved from 25.1% to 22.4% — your negative keyword additions last week are paying off.",
    "Watch the 50-pack: refund rate jumped to 4.2% (vs 1.9% average). Investigate quality issues.",
  ],
  ppc: [
    "Campaign 'Exact - Bowl Covers' is burning $415/week at 47% ACOS with zero conversions. Pause immediately.",
    "Your best performer is 'Broad - Container Covers' at 9.7% ACOS — consider increasing budget by 20%.",
    "Search term 'silicone stretch lids' is converting at 18% but only getting 12 impressions/day. Add as exact match.",
  ],
  keywords: [
    "'silicone food covers' dropped 8 positions to #24 — investigate competitor activity.",
    "New ranking achieved: 'bowl covers for kitchen' now at #7 (was unranked 2 weeks ago).",
    "High-volume keyword 'food storage covers' has 2.1% conversion — below category average of 4.3%.",
  ],
  inventory: [
    "50-pack has only 19 days of stock left at current velocity (8.2 units/day). Reorder now to avoid stockout.",
    "100-pack is overstocked: 147 days of supply. Consider running a Lightning Deal to accelerate.",
    "Seasonal trend alert: category sales typically increase 35% in April. Plan inventory accordingly.",
  ],
  cashflow: [
    "Next settlement (Mar 28) projected at $4,200 — $800 less than last period due to higher refunds.",
    "Ad spend is 31% of revenue this month vs 24% target. You'll need an additional $2,100 in working capital.",
    "At current trajectory, you'll hit a cash crunch around April 15. Consider reducing ad spend by 15%.",
  ],
  projects: [
    "3 tasks are overdue, including 'Reorder 50-pack' which is marked Urgent.",
    "AI detected a refund spike anomaly — a new investigation task has been auto-generated.",
    "You completed 4 tasks this week, but created 6. Backlog is growing — consider prioritizing.",
  ],
};

/* ─── In-memory cache (page+userId → { data, expiresAt }) ── */

type CacheEntry = { data: string[]; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached(key: string): string[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: string[]) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/* ─── GET handler ────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    let userId = "anonymous";
    try {
      const user = await requireUser();
      userId = user.userId;
    } catch {
      // Allow preview without auth
    }

    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") || "dashboard";

    const validPages = Object.keys(MOCK_INSIGHTS);
    if (!validPages.includes(page)) {
      return apiError(`Invalid page. Must be one of: ${validPages.join(", ")}`, 400);
    }

    const cacheKey = `${page}:${userId}`;

    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) {
      return apiSuccess({ insights: cached, page, cached: true });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // If no API key, return mock insights
    if (!apiKey) {
      const insights = MOCK_INSIGHTS[page] ?? MOCK_INSIGHTS.dashboard;
      setCache(cacheKey, insights);
      return apiSuccess({ insights, page, cached: false });
    }

    // With API key, call Claude for real insights
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system:
          "You are an Amazon FBA analytics engine. Return exactly 3 concise, data-driven insight strings as a JSON array. Each insight should be 1-2 sentences with specific numbers. No markdown, no explanation — just the JSON array of strings.",
        messages: [
          {
            role: "user",
            content: `Generate 3 actionable insights for the "${page}" page of an Amazon FBA seller dashboard. The seller sells eco-friendly products with ~$11K monthly revenue.`,
          },
        ],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";
      const insights: string[] = JSON.parse(text);
      setCache(cacheKey, insights);
      return apiSuccess({ insights, page, cached: false });
    } catch {
      // If AI call fails, fall back to mock data
      const insights = MOCK_INSIGHTS[page] ?? MOCK_INSIGHTS.dashboard;
      setCache(cacheKey, insights);
      return apiSuccess({ insights, page, cached: false });
    }
  } catch (err) {
    return apiServerError(err);
  }
}
