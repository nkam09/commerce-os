import { NextRequest } from "next/server";
import { apiSuccess, apiServerError } from "@/lib/utils/api";
import { requireUser } from "@/lib/auth/require-user";

/* ─── Mock generated tasks ───────────────────────────── */

const MOCK_TASKS = [
  {
    title: "Investigate refund spike on 100-pack — 10.71% vs 1.94% average",
    description:
      "The 100-pack SKU (B07XYZ123) refund rate spiked to 10.71% over the last 7 days, compared to a 30-day average of 1.94%. This represents a 5.5x increase. Review recent negative reviews, check for packaging damage reports, and contact FBA support if units were commingled. Immediate action recommended to prevent listing health degradation.",
    priority: "High" as const,
    aiGenerated: true,
    aiSource: "anomaly:refund_spike:B07XYZ123",
    tags: ["ai-generated", "quality", "urgent-review"],
    suggestedListId: "ai-recommendations",
  },
  {
    title: "Pause 'bowl cover' keyword — $415 spend, 47% ACOS, 0 conversions",
    description:
      "The 'Exact - Bowl Covers' campaign has spent $415 over the last 14 days with a 47% ACOS and zero conversions. CTR is 0.8% (below 1.5% benchmark), suggesting poor ad-to-listing relevance. Recommend pausing this campaign immediately and reallocating budget to 'Broad - Container Covers' which is performing at 9.7% ACOS.",
    priority: "Urgent" as const,
    aiGenerated: true,
    aiSource: "anomaly:high_acos:camp_bowl_cover",
    tags: ["ai-generated", "ppc", "cost-savings"],
    suggestedListId: "ai-recommendations",
  },
  {
    title: "Reorder 50-pack — only 19 days of stock at current velocity",
    description:
      "The 50-pack SKU (B07ABC456) has 156 units remaining with a 7-day average sell-through of 8.2 units/day, giving approximately 19 days of stock. Lead time for this supplier is 21 days. If you don't place a reorder within 48 hours, you risk a stockout that could cost an estimated $1,200 in lost revenue and damage organic ranking.",
    priority: "Urgent" as const,
    aiGenerated: true,
    aiSource: "anomaly:low_stock:B07ABC456",
    tags: ["ai-generated", "inventory", "reorder"],
    suggestedListId: "ai-recommendations",
  },
  {
    title: "Investigate rank drop: 'silicone food covers' fell 8 positions to #24",
    description:
      "The keyword 'silicone food covers' (monthly search volume: 14,800) dropped from position #16 to #24 over the last 7 days. This keyword drives an estimated 12% of organic traffic. Possible causes: competitor launched a new product, your conversion rate dipped, or a review velocity change. Check competitor activity and consider increasing PPC bid on this term temporarily.",
    priority: "Medium" as const,
    aiGenerated: true,
    aiSource: "anomaly:rank_drop:kw_silicone_food",
    tags: ["ai-generated", "keywords", "ranking"],
    suggestedListId: "ai-recommendations",
  },
];

/* ─── POST handler ───────────────────────────────────── */

export async function POST(_req: NextRequest) {
  try {
    try {
      await requireUser();
    } catch {
      // Allow preview without auth
    }

    // In a real implementation, this would:
    // 1. Analyze recent data for anomalies
    // 2. Use Claude to generate task descriptions
    // 3. Check for duplicate tasks before creating
    // 4. Create tasks in the PM system

    const tasks = MOCK_TASKS;
    const created = tasks.length;
    const skipped = 0; // Would track duplicates in real implementation

    return apiSuccess({
      tasks,
      created,
      skipped,
    });
  } catch (err) {
    return apiServerError(err);
  }
}
