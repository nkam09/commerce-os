export interface AiDailySummaryResult {
  whatHappened: string;
  biggestRisks: string[];
  biggestWins: string[];
  recommendedActions: string[];
}

export interface AiSkuSummaryResult {
  performanceSummary: string;
  whyItMatters: string;
  nextAction: string;
}

export interface AiAlertExplanationResult {
  whatTriggered: string;
  metricValues: string;
  likelyCause: string;
  suggestedResponse: string;
}

function buildDailySummaryPrompt(ctx: Record<string, unknown>): string {
  return `You are a financial analyst for an Amazon FBA business. Based ONLY on the following computed data, write a concise executive summary. Do NOT invent or estimate numbers.

DATA:
${JSON.stringify(ctx, null, 2)}

Respond in valid JSON only, matching this schema:
{
  "whatHappened": "2-3 sentence overview of what happened this period",
  "biggestRisks": ["risk 1", "risk 2", "risk 3"],
  "biggestWins": ["win 1", "win 2"],
  "recommendedActions": ["action 1", "action 2", "action 3"]
}

Rules:
- Only reference numbers from the DATA above
- Be specific and direct — no vague statements
- Actions should be concrete and immediately actionable
- Prioritize by business impact`;
}

function buildSkuSummaryPrompt(ctx: Record<string, unknown>): string {
  return `You are analyzing a single Amazon FBA product. Based ONLY on the data below, write a concise product summary.

DATA:
${JSON.stringify(ctx, null, 2)}

Respond in valid JSON only:
{
  "performanceSummary": "2-3 sentence summary of this SKU's health",
  "whyItMatters": "1 sentence on why this is important right now",
  "nextAction": "The single most important action to take for this product"
}`;
}

function buildAlertExplanationPrompt(
  alertTitle: string,
  alertBody: string,
  ctx: Record<string, unknown>
): string {
  return `An automated alert was triggered for an Amazon FBA business. Explain it based on the data.

ALERT: ${alertTitle}
ALERT BODY: ${alertBody}

SUPPORTING DATA:
${JSON.stringify(ctx, null, 2)}

Respond in valid JSON only:
{
  "whatTriggered": "What specific threshold or condition caused this alert",
  "metricValues": "The exact numbers involved",
  "likelyCause": "Most probable business reason this happened",
  "suggestedResponse": "Specific steps to address this"
}`;
}

function buildQaPrompt(question: string, ctx: Record<string, unknown>): string {
  return `You are an AI assistant for an Amazon FBA business. Answer the question below using ONLY the provided data. Be direct and specific.

BUSINESS DATA:
${JSON.stringify(ctx, null, 2)}

QUESTION: ${question}

Answer concisely in 2-4 sentences. Reference actual numbers from the data. If the data doesn't contain enough information to answer, say so clearly.`;
}

async function callClaude(prompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
}

function parseJsonResponse<T>(raw: string): T {
  const clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(clean) as T;
}

export async function generateDailySummary(
  contextPack: Record<string, unknown>
): Promise<AiDailySummaryResult> {
  const raw = await callClaude(buildDailySummaryPrompt(contextPack));
  return parseJsonResponse<AiDailySummaryResult>(raw);
}

export async function generateSkuSummary(
  contextPack: Record<string, unknown>
): Promise<AiSkuSummaryResult> {
  const raw = await callClaude(buildSkuSummaryPrompt(contextPack));
  return parseJsonResponse<AiSkuSummaryResult>(raw);
}

export async function generateAlertExplanation(
  alertTitle: string,
  alertBody: string,
  contextPack: Record<string, unknown>
): Promise<AiAlertExplanationResult> {
  const raw = await callClaude(buildAlertExplanationPrompt(alertTitle, alertBody, contextPack));
  return parseJsonResponse<AiAlertExplanationResult>(raw);
}

export async function answerBusinessQuestion(
  question: string,
  contextPack: Record<string, unknown>
): Promise<string> {
  return callClaude(buildQaPrompt(question, contextPack));
}

export function buildCompanyContextPack(data: {
  period: string;
  totalSales: number;
  totalNetProfit: number;
  totalAdSpend: number;
  marginPercent: number | null;
  productSummaries: Array<{ sku: string; netProfit: number; healthStatus: string }>;
  cashForecast: Array<{ month: string; endingCash: number; cashFloorBreach: boolean }>;
  openCriticalAlerts: number;
  alertTitles: string[];
}) {
  const sorted = [...data.productSummaries].sort((a, b) => b.netProfit - a.netProfit);
  return {
    period: data.period,
    financials: {
      totalSales:     data.totalSales,
      totalNetProfit: data.totalNetProfit,
      totalAdSpend:   data.totalAdSpend,
      marginPercent:  data.marginPercent != null ? `${(data.marginPercent * 100).toFixed(1)}%` : "N/A",
      tacos:          data.totalSales > 0 ? `${(data.totalAdSpend / data.totalSales * 100).toFixed(1)}%` : "N/A",
    },
    topPositiveSkus: sorted.slice(0, 3).map(p => ({ sku: p.sku, netProfit: p.netProfit })),
    problemSkus: data.productSummaries
      .filter(p => p.healthStatus !== "HEALTHY" || p.netProfit < 0)
      .map(p => ({ sku: p.sku, status: p.healthStatus, netProfit: p.netProfit })),
    cashForecast: data.cashForecast.map(m => ({
      month: m.month, endingCash: m.endingCash, floorBreach: m.cashFloorBreach,
    })),
    alerts: { criticalCount: data.openCriticalAlerts, titles: data.alertTitles },
  };
}

export function buildProductContextPack(data: {
  productName: string;
  sku: string;
  asin: string;
  profit: {
    grossSales: number;
    netProfit: number;
    marginPercent: number | null;
    adSpend: number;
    acos: number | null;
    cogsTotal: number;
    refundRate: number | null;
  };
  inventory: {
    available: number;
    inbound: number;
    daysLeft: number | null;
    reorderTriggerDays: number;
    suggestedReorderDate: Date | null;
    suggestedReorderQty: number;
    healthStatus: string;
    velocity30: number;
  };
  alerts: string[];
}) {
  return {
    product: { name: data.productName, sku: data.sku, asin: data.asin },
    profitability: {
      grossSales:  data.profit.grossSales,
      netProfit:   data.profit.netProfit,
      margin:      data.profit.marginPercent != null ? `${(data.profit.marginPercent * 100).toFixed(1)}%` : "N/A",
      adSpend:     data.profit.adSpend,
      acos:        data.profit.acos != null ? `${(data.profit.acos * 100).toFixed(1)}%` : "N/A",
      cogs:        data.profit.cogsTotal,
      refundRate:  data.profit.refundRate != null ? `${(data.profit.refundRate * 100).toFixed(1)}%` : "N/A",
    },
    inventory: {
      available:           data.inventory.available,
      inbound:             data.inventory.inbound,
      daysLeft:            data.inventory.daysLeft?.toFixed(0) ?? "N/A",
      reorderTriggerDays:  data.inventory.reorderTriggerDays,
      suggestedReorderDate: data.inventory.suggestedReorderDate?.toDateString() ?? "N/A",
      suggestedReorderQty: data.inventory.suggestedReorderQty,
      healthStatus:        data.inventory.healthStatus,
      velocity30:          `${data.inventory.velocity30.toFixed(1)} units/day`,
    },
    openAlerts: data.alerts,
  };
}