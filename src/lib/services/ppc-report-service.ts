/**
 * PPC Report Service
 *
 * Orchestrates data collection for the PPC Maintenance Report (8-tab xlsx).
 * Pulls from:
 *   - Amazon Ads API (SP campaigns, SP targeting/keywords, SP search terms,
 *     placement breakdown)
 *   - Amazon SP-API (advertised products, orders) — read via our existing
 *     Prisma tables populated by the sync jobs
 *   - Data Dive API (keyword ranks + competitor data) — currently stubbed
 *
 * Design principles:
 *   - This service ONLY reads. It never writes to Prisma or to the Ads/SP
 *     mirrors used by dashboard. The report is an ad-hoc export.
 *   - Every external call is wrapped in try/catch so that a single failing
 *     API still yields a usable workbook for the remaining tabs.
 *   - Rate limits: Amazon Ads reporting is expensive. We insert ~2s delays
 *     between report requests and share a single LWA token via AdsApiClient.
 *   - COGS is hardcoded for the three tracked ASINs (product table has no
 *     cost field). Add ASINs here when catalog expands.
 *
 * Consumers: ppc-report-builder.ts (turns the shape below into an xlsx
 * workbook) and the /api/reports/ppc-report route handler.
 */

import { prisma } from "@/lib/db/prisma";
import { AdsApiClient, type AdsReportRow } from "@/lib/amazon/ads-api-client";
import { getAdsConfigForUser } from "@/lib/amazon/get-sp-client-for-user";
import { DataDiveClient, type KeywordRankResult, type CompetitorResult } from "@/lib/datadive/datadive-client";

// ─── Hardcoded COGS ──────────────────────────────────────────────────────────
// TODO: Move to a product.cost field once the schema supports it.
export const COGS_BY_ASIN: Record<string, number> = {
  B07XYBW774: 4.50,
  B0B27GRHFR: 2.73,
  B0D7NNL4BL: 1.44,
};

const TRACKED_ASINS = Object.keys(COGS_BY_ASIN);

// ─── Output shape ────────────────────────────────────────────────────────────

export type PPCReportPeriod = {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
};

export type DailyTrendRow = {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number;       // spend / sales
  roas: number;       // sales / spend
  ctr: number;        // clicks / impressions
  cpc: number;        // spend / clicks
  cvr: number;        // orders / clicks
  flagAcosHigh: boolean;  // acos > 0.35
  flagRoasLow: boolean;   // roas < 3
};

export type CampaignRow = {
  campaignId: string;
  campaignName: string;
  status?: string;
  budget?: number;
  budgetType?: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  unitsSold: number;
  acos: number;
  roas: number;
  ctr: number;
  cpc: number;
  cvr: number;
  flagHighAcos: boolean;
  flagNoSales: boolean;
};

export type PlacementRow = {
  campaignId: string;
  campaignName: string;
  placement: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  acos: number;
  roas: number;
};

export type SkuPnlRow = {
  asin: string;
  sku?: string;
  unitsSold: number;
  grossSales: number;
  adSpend: number;
  adSales: number;
  organicSales: number;   // grossSales - adSales (floored at 0)
  cogs: number;
  referralFees: number;
  fbaFees: number;
  otherFees: number;
  refundAmount: number;
  netProfit: number;
  marginPct: number;
  tacos: number;          // adSpend / grossSales
  flagNegativeMargin: boolean;
  flagHighTacos: boolean; // tacos > 0.20
};

export type SearchTermRow = {
  campaignId: string;
  campaignName: string;
  adGroupName?: string;
  searchTerm: string;
  targeting?: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
  roas: number;
  cvr: number;
  flagWastedSpend: boolean;   // clicks > 10 && orders === 0
  flagHighPerformer: boolean; // orders > 0 && acos < 0.20
};

export type KeywordRow = {
  campaignId: string;
  campaignName: string;
  adGroupName?: string;
  keywordId?: string;
  keyword: string;
  matchType?: string;
  bid?: number;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
  roas: number;
  // Enriched from Data Dive when available:
  organicRank?: number;
  sponsoredRank?: number;
  searchVolume?: number;
  flagUnderperforming: boolean; // clicks > 5 && orders === 0
  flagBidTooHigh: boolean;      // acos > 0.5
};

export type CompetitiveRow = {
  asin: string;
  competitorAsin: string;
  competitorTitle?: string;
  competitorBrand?: string;
  competitorPrice?: number;
  competitorRating?: number;
  competitorReviewCount?: number;
};

export type MonthlySummaryRow = {
  month: string; // YYYY-MM
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
  roas: number;
  ctr: number;
  cpc: number;
  cvr: number;
};

export type PPCReportData = {
  period: PPCReportPeriod;
  generatedAt: string;
  warnings: string[];
  dailyTrend: DailyTrendRow[];
  campaigns: CampaignRow[];
  placements: PlacementRow[];
  skuPnl: SkuPnlRow[];
  searchTerms: SearchTermRow[];
  keywords: KeywordRow[];
  competitive: CompetitiveRow[];
  monthlySummary: MonthlySummaryRow[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const safeDiv = (num: number, den: number): number =>
  den > 0 ? num / den : 0;

/**
 * Hard cap on total Ads API time so the whole request stays under Render's
 * 60-second limit. Covers request creation + polling + download for all
 * reports running in parallel.
 */
const ADS_TOTAL_TIMEOUT_MS = 55_000;
/** Poll interval used while waiting for an Ads report to finish. */
const POLL_INTERVAL_MS = 5_000;
/** Max poll attempts (55s / 5s ≈ 11 but we cap higher so the outer timeout wins). */
const POLL_MAX_ATTEMPTS = 15;

const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const formatDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Poll a single Ads report to COMPLETED, download, and parse.
 * Returns the parsed rows, or throws on failure/no-url.
 */
async function pollAndDownload(
  ads: AdsApiClient,
  label: string,
  reportId: string
): Promise<AdsReportRow[]> {
  console.log(`[ppc-report]     ${label}: polling reportId=${reportId}`);
  const report = await ads.pollReport(reportId, {
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: POLL_MAX_ATTEMPTS,
  });
  console.log(
    `[ppc-report]     ${label}: status=${report.status}, url=${report.url ? "present" : "MISSING"}, size=${report.fileSize ?? "?"}`
  );
  if (!report.url) {
    throw new Error(`${label}: report completed without download URL`);
  }
  const buffer = await ads.downloadReport(report.url);
  const rows = await ads.parseGzipJsonReport(buffer);
  console.log(`[ppc-report] <<< ${label}: ${rows.length} rows`);
  return rows;
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export async function generatePPCReportData(params: {
  userId: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  dataDiveApiKey?: string;
}): Promise<PPCReportData> {
  const warnings: string[] = [];
  const period: PPCReportPeriod = { from: params.from, to: params.to };

  console.log(
    `[ppc-report] generating userId=${params.userId} ${params.from} → ${params.to}`
  );

  // ── Setup Ads client ──────────────────────────────────────────────────────
  let ads: AdsApiClient | null = null;
  try {
    const cfg = getAdsConfigForUser();
    ads = new AdsApiClient(cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Ads client unavailable: ${msg}`);
    console.error(`[ppc-report] ads client init failed:`, msg);
  }

  // ── Fetch all Ads reports IN PARALLEL ────────────────────────────────────
  // Sequential polling (old code) meant: createA → pollA → createB → pollB …
  // Total time ≈ sum(each). Render's 60s limit hit hard.
  //
  // New flow:
  //   1. Kick off all 5 createReport calls at once (Promise.allSettled).
  //   2. For every reportId that came back, start a poll+download task
  //      that writes its rows into a shared `results` map.
  //   3. Race Promise.all(pollTasks) against ADS_TOTAL_TIMEOUT_MS.
  //   4. Whatever landed in `results` before the deadline is used; any
  //      report still in flight is marked as "timed out" and its tab is
  //      built with whatever partial data we have (usually empty).
  //
  // Total time ≈ max(each) instead of sum(each).

  type ReportKey =
    | "campaigns"
    | "placements"
    | "advertised"
    | "targeting"
    | "searchTerm";

  type ReportSpec = {
    key: ReportKey;
    label: string;
    request: () => Promise<string>;
  };

  const results: Partial<Record<ReportKey, AdsReportRow[]>> = {};

  if (ads) {
    const adsRef = ads;
    const specs: ReportSpec[] = [
      {
        key: "campaigns",
        label: "SP campaigns (by campaign)",
        request: () =>
          adsRef
            .requestSPCampaignsReport({
              profileId: "",
              startDate: params.from,
              endDate: params.to,
              groupBy: ["campaign"],
            })
            .then((r) => r.reportId),
      },
      {
        key: "placements",
        label: "SP campaigns (by placement)",
        request: () =>
          adsRef
            .requestSPCampaignsReport({
              profileId: "",
              startDate: params.from,
              endDate: params.to,
              groupBy: ["campaign", "campaignPlacement"],
            })
            .then((r) => r.reportId),
      },
      {
        key: "advertised",
        label: "SP advertised product",
        request: () =>
          adsRef.requestSponsoredProductsReport({
            startDate: params.from,
            endDate: params.to,
          }),
      },
      {
        key: "targeting",
        label: "SP targeting",
        request: () =>
          adsRef.requestSPTargetingReport({
            startDate: params.from,
            endDate: params.to,
          }),
      },
      {
        key: "searchTerm",
        label: "SP search term",
        request: () =>
          adsRef.requestSPSearchTermReport({
            startDate: params.from,
            endDate: params.to,
          }),
      },
    ];

    // Phase 1: fire all createReport calls in parallel.
    console.log(`[ppc-report] requesting ${specs.length} Ads reports in parallel`);
    const createStart = Date.now();
    const created = await Promise.allSettled(
      specs.map((s) => s.request())
    );
    console.log(
      `[ppc-report] create phase done in ${Date.now() - createStart}ms`
    );

    // Phase 2: start poll+download tasks for every successfully-created
    // report. Each task writes into `results[key]` on success; failures
    // push to warnings but never reject the outer Promise.
    const pollTasks: Promise<void>[] = [];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const createResult = created[i];
      if (createResult.status === "rejected") {
        const msg =
          createResult.reason instanceof Error
            ? createResult.reason.message
            : String(createResult.reason);
        warnings.push(`${spec.label} create failed: ${msg}`);
        console.error(`[ppc-report] !!! ${spec.label} create failed:`, msg);
        continue;
      }
      const reportId = createResult.value;
      pollTasks.push(
        (async () => {
          try {
            const rows = await pollAndDownload(adsRef, spec.label, reportId);
            results[spec.key] = rows;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            warnings.push(`${spec.label} failed: ${msg}`);
            console.error(`[ppc-report] !!! ${spec.label} failed:`, msg);
          }
        })()
      );
    }

    // Phase 3: race all poll tasks against the global deadline. Whichever
    // reports finish first populate `results`; the rest are abandoned.
    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), ADS_TOTAL_TIMEOUT_MS)
    );
    const pollStart = Date.now();
    const raceOutcome = await Promise.race([
      Promise.all(pollTasks).then(() => "done" as const),
      timeoutPromise,
    ]);
    console.log(
      `[ppc-report] poll phase ${raceOutcome} in ${Date.now() - pollStart}ms`
    );
    if (raceOutcome === "timeout") {
      warnings.push(
        `Ads API polling exceeded ${ADS_TOTAL_TIMEOUT_MS / 1000}s — some tabs may be incomplete`
      );
    }

    // Emit per-report timeout warnings for any reports that are still
    // missing from `results`.
    for (const spec of specs) {
      if (!(spec.key in results)) {
        if (!warnings.some((w) => w.startsWith(`${spec.label} `))) {
          warnings.push(`${spec.label}: data unavailable — report timed out`);
        }
      }
    }
  }

  const spCampaignRows: AdsReportRow[] = results.campaigns ?? [];
  const spPlacementRows: AdsReportRow[] = results.placements ?? [];
  const spAdvertisedRows: AdsReportRow[] = results.advertised ?? [];
  const spTargetingRows: AdsReportRow[] = results.targeting ?? [];
  const spSearchTermRows: AdsReportRow[] = results.searchTerm ?? [];

  // ── Tab 1: Daily trend (from spAdvertised date grouping) ──────────────────
  const dailyMap = new Map<
    string,
    { impressions: number; clicks: number; spend: number; sales: number; orders: number }
  >();
  for (const r of spAdvertisedRows) {
    const date = String(r.date ?? "");
    if (!date) continue;
    const cur = dailyMap.get(date) ?? {
      impressions: 0,
      clicks: 0,
      spend: 0,
      sales: 0,
      orders: 0,
    };
    cur.impressions += toNum(r.impressions);
    cur.clicks += toNum(r.clicks);
    cur.spend += toNum(r.cost);
    cur.sales += toNum(r.sales7d);
    cur.orders += toNum(r.purchases7d);
    dailyMap.set(date, cur);
  }
  const dailyTrend: DailyTrendRow[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => {
      const acos = safeDiv(v.spend, v.sales);
      const roas = safeDiv(v.sales, v.spend);
      return {
        date,
        impressions: v.impressions,
        clicks: v.clicks,
        spend: v.spend,
        sales: v.sales,
        orders: v.orders,
        acos,
        roas,
        ctr: safeDiv(v.clicks, v.impressions),
        cpc: safeDiv(v.spend, v.clicks),
        cvr: safeDiv(v.orders, v.clicks),
        flagAcosHigh: acos > 0.35,
        flagRoasLow: v.spend > 0 && roas < 3,
      };
    });

  // ── Tab 2: Campaign performance ───────────────────────────────────────────
  const campaigns: CampaignRow[] = spCampaignRows.map((r) => {
    const spend = toNum(r.cost);
    const sales = toNum(r.sales7d);
    const clicks = toNum(r.clicks);
    const impressions = toNum(r.impressions);
    const orders = toNum(r.purchases7d);
    const acos = safeDiv(spend, sales);
    const roas = safeDiv(sales, spend);
    return {
      campaignId: String(r.campaignId ?? ""),
      campaignName: String(r.campaignName ?? ""),
      status: r.campaignStatus as string | undefined,
      budget: r.campaignBudgetAmount !== undefined ? toNum(r.campaignBudgetAmount) : undefined,
      budgetType: r.campaignBudgetType as string | undefined,
      impressions,
      clicks,
      spend,
      sales,
      orders,
      unitsSold: toNum(r.unitsSold7d),
      acos,
      roas,
      ctr: safeDiv(clicks, impressions),
      cpc: safeDiv(spend, clicks),
      cvr: safeDiv(orders, clicks),
      flagHighAcos: acos > 0.35,
      flagNoSales: spend > 0 && sales === 0,
    };
  });

  // ── Tab 3: Placement breakdown ────────────────────────────────────────────
  const placements: PlacementRow[] = spPlacementRows.map((r) => {
    const spend = toNum(r.cost);
    const sales = toNum(r.sales7d);
    return {
      campaignId: String(r.campaignId ?? ""),
      campaignName: String(r.campaignName ?? ""),
      placement: String((r.campaignPlacement as string | undefined) ?? ""),
      impressions: toNum(r.impressions),
      clicks: toNum(r.clicks),
      spend,
      sales,
      acos: safeDiv(spend, sales),
      roas: safeDiv(sales, spend),
    };
  });

  // ── Tab 4: Per-SKU P&L ─────────────────────────────────────────────────────
  // Aggregate ad spend/sales per ASIN from spAdvertised; then pull
  // DailySale + DailyFee from Prisma for the period.
  const adByAsin = new Map<string, { spend: number; sales: number }>();
  for (const r of spAdvertisedRows) {
    const asin = String(r.advertisedAsin ?? "");
    if (!asin) continue;
    const cur = adByAsin.get(asin) ?? { spend: 0, sales: 0 };
    cur.spend += toNum(r.cost);
    cur.sales += toNum(r.sales7d);
    adByAsin.set(asin, cur);
  }

  // Use UTC-anchored Date objects. Prisma maps `@db.Date` columns via UTC
  // boundaries, so a T00:00:00Z / T23:59:59Z range matches rows stored as
  // pure dates correctly regardless of server timezone.
  const fromDate = new Date(params.from + "T00:00:00Z");
  const toDate = new Date(params.to + "T23:59:59Z");

  const skuPnl: SkuPnlRow[] = [];
  try {
    const products = await prisma.product.findMany({
      where: { userId: params.userId, asin: { in: TRACKED_ASINS } },
      select: { id: true, asin: true, sku: true },
    });
    console.log(
      `[ppc-report] skuPnl: found ${products.length} tracked products for userId=${params.userId}`
    );

    const productIds = products.map((p) => p.id);

    // Raw SQL sanity check — confirms the daily_sales table actually has
    // data for these products in this date window before trusting Prisma.
    if (productIds.length > 0) {
      try {
        const rawCheck = await prisma.$queryRawUnsafe(
          `SELECT "productId", SUM("grossSales")::text AS gs, SUM("unitsSold")::text AS us
             FROM daily_sales
            WHERE date >= $1 AND date <= $2
              AND "productId" = ANY($3::text[])
            GROUP BY "productId"`,
          fromDate,
          toDate,
          productIds
        );
        console.log(`[ppc-report] skuPnl: raw sales check:`, rawCheck);
      } catch (e) {
        console.error(`[ppc-report] skuPnl: raw sales check failed:`, e);
      }
    }

    // Filter products by userId above; this query filters only by the
    // already-scoped productIds — no relation filter on dailySale.
    const salesAgg = productIds.length
      ? await prisma.dailySale.groupBy({
          by: ["productId"],
          where: {
            productId: { in: productIds },
            date: { gte: fromDate, lte: toDate },
          },
          _sum: {
            grossSales: true,
            unitsSold: true,
            refundCount: true,
            refundAmount: true,
          },
        })
      : [];
    console.log(
      `[ppc-report] skuPnl: salesAgg rows=${salesAgg.length}`,
      salesAgg.map((s) => ({
        productId: s.productId,
        units: toNum(s._sum.unitsSold),
        gross: toNum(s._sum.grossSales),
      }))
    );

    const feesAgg = productIds.length
      ? await prisma.dailyFee.groupBy({
          by: ["productId"],
          where: {
            productId: { in: productIds },
            date: { gte: fromDate, lte: toDate },
          },
          _sum: {
            referralFee: true,
            fbaFee: true,
            storageFee: true,
            otherFees: true,
          },
        })
      : [];

    const salesByProduct = new Map(salesAgg.map((s) => [s.productId, s]));
    const feesByProduct = new Map(feesAgg.map((f) => [f.productId, f]));

    for (const p of products) {
      const s = salesByProduct.get(p.id);
      const f = feesByProduct.get(p.id);

      const unitsSold = toNum(s?._sum.unitsSold);
      const grossSales = toNum(s?._sum.grossSales);
      const refundAmount = toNum(s?._sum.refundAmount);
      const referralFees = toNum(f?._sum.referralFee);
      const fbaFees = toNum(f?._sum.fbaFee);
      const otherFees = toNum(f?._sum.otherFees) + toNum(f?._sum.storageFee);

      const cogsPer = COGS_BY_ASIN[p.asin ?? ""] ?? 0;
      const cogs = cogsPer * unitsSold;

      const ads = adByAsin.get(p.asin ?? "") ?? { spend: 0, sales: 0 };
      const organicSales = Math.max(0, grossSales - ads.sales);

      const netProfit =
        grossSales -
        refundAmount -
        cogs -
        referralFees -
        fbaFees -
        otherFees -
        ads.spend;

      const marginPct = safeDiv(netProfit, grossSales);
      const tacos = safeDiv(ads.spend, grossSales);

      skuPnl.push({
        asin: p.asin ?? "",
        sku: p.sku ?? undefined,
        unitsSold,
        grossSales,
        adSpend: ads.spend,
        adSales: ads.sales,
        organicSales,
        cogs,
        referralFees,
        fbaFees,
        otherFees,
        refundAmount,
        netProfit,
        marginPct,
        tacos,
        flagNegativeMargin: netProfit < 0,
        flagHighTacos: tacos > 0.20,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`SKU P&L build failed: ${msg}`);
    console.error(`[ppc-report] sku p&l failed:`, msg);
  }

  // ── Tab 5: Search terms ───────────────────────────────────────────────────
  const searchTerms: SearchTermRow[] = spSearchTermRows.map((r) => {
    const spend = toNum(r.cost);
    const sales = toNum(r.sales7d);
    const clicks = toNum(r.clicks);
    const orders = toNum(r.purchases7d);
    const acos = safeDiv(spend, sales);
    return {
      campaignId: String(r.campaignId ?? ""),
      campaignName: String(r.campaignName ?? ""),
      adGroupName: r.adGroupName as string | undefined,
      searchTerm: String(r.searchTerm ?? ""),
      targeting: r.targeting as string | undefined,
      impressions: toNum(r.impressions),
      clicks,
      spend,
      sales,
      orders,
      acos,
      roas: safeDiv(sales, spend),
      cvr: safeDiv(orders, clicks),
      flagWastedSpend: clicks > 10 && orders === 0,
      flagHighPerformer: orders > 0 && acos < 0.20 && acos > 0,
    };
  });

  // ── Tab 6: Keywords ───────────────────────────────────────────────────────
  const keywordRowsBase: KeywordRow[] = spTargetingRows.map((r) => {
    const spend = toNum(r.cost);
    const sales = toNum(r.sales7d);
    const clicks = toNum(r.clicks);
    const orders = toNum(r.purchases7d);
    const acos = safeDiv(spend, sales);
    return {
      campaignId: String(r.campaignId ?? ""),
      campaignName: String(r.campaignName ?? ""),
      adGroupName: r.adGroupName as string | undefined,
      keywordId: r.keywordId as string | undefined,
      keyword: String(r.keyword ?? r.targeting ?? ""),
      matchType: r.matchType as string | undefined,
      bid: r.keywordBid !== undefined ? toNum(r.keywordBid) : undefined,
      impressions: toNum(r.impressions),
      clicks,
      spend,
      sales,
      orders,
      acos,
      roas: safeDiv(sales, spend),
      flagUnderperforming: clicks > 5 && orders === 0,
      flagBidTooHigh: acos > 0.5,
    };
  });

  // ── Data Dive enrichment (keywords + competitive) ─────────────────────────
  let keywordRanks: KeywordRankResult[] = [];
  let competitorData: CompetitorResult[] = [];
  if (params.dataDiveApiKey) {
    try {
      const dd = new DataDiveClient(params.dataDiveApiKey);
      const uniqueKeywords = [
        ...new Set(keywordRowsBase.map((k) => k.keyword).filter((k) => k.length > 0)),
      ];
      keywordRanks = await dd.getKeywordRanks({
        keywords: uniqueKeywords,
        asins: TRACKED_ASINS,
      });
      competitorData = await dd.getCompetitorData({ asins: TRACKED_ASINS });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Data Dive lookup failed: ${msg}`);
      console.error(`[ppc-report] data dive failed:`, msg);
    }
  } else {
    warnings.push("Data Dive API key not provided — keyword ranks + competitive tabs will be empty");
  }

  const rankByKeyword = new Map<string, KeywordRankResult>();
  for (const rr of keywordRanks) {
    rankByKeyword.set(rr.keyword.toLowerCase(), rr);
  }
  const keywords: KeywordRow[] = keywordRowsBase.map((k) => {
    const rr = rankByKeyword.get(k.keyword.toLowerCase());
    return {
      ...k,
      organicRank: rr?.organicRank,
      sponsoredRank: rr?.sponsoredRank,
      searchVolume: rr?.searchVolume,
    };
  });

  // ── Tab 7: Competitive ────────────────────────────────────────────────────
  const competitive: CompetitiveRow[] = competitorData.map((c) => ({
    asin: c.asin,
    competitorAsin: c.competitorAsin,
    competitorTitle: c.competitorTitle,
    competitorBrand: c.competitorBrand,
    competitorPrice: c.competitorPrice,
    competitorRating: c.competitorRating,
    competitorReviewCount: c.competitorReviewCount,
  }));

  // ── Tab 8: Monthly summary (aggregated from dailyTrend) ───────────────────
  const monthMap = new Map<
    string,
    { impressions: number; clicks: number; spend: number; sales: number; orders: number }
  >();
  for (const d of dailyTrend) {
    const month = d.date.slice(0, 7);
    const cur = monthMap.get(month) ?? {
      impressions: 0,
      clicks: 0,
      spend: 0,
      sales: 0,
      orders: 0,
    };
    cur.impressions += d.impressions;
    cur.clicks += d.clicks;
    cur.spend += d.spend;
    cur.sales += d.sales;
    cur.orders += d.orders;
    monthMap.set(month, cur);
  }
  const monthlySummary: MonthlySummaryRow[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      impressions: v.impressions,
      clicks: v.clicks,
      spend: v.spend,
      sales: v.sales,
      orders: v.orders,
      acos: safeDiv(v.spend, v.sales),
      roas: safeDiv(v.sales, v.spend),
      ctr: safeDiv(v.clicks, v.impressions),
      cpc: safeDiv(v.spend, v.clicks),
      cvr: safeDiv(v.orders, v.clicks),
    }));

  console.log(
    `[ppc-report] done. dailyTrend=${dailyTrend.length} campaigns=${campaigns.length} placements=${placements.length} skuPnl=${skuPnl.length} searchTerms=${searchTerms.length} keywords=${keywords.length} competitive=${competitive.length} months=${monthlySummary.length} warnings=${warnings.length}`
  );

  return {
    period,
    generatedAt: formatDate(new Date()),
    warnings,
    dailyTrend,
    campaigns,
    placements,
    skuPnl,
    searchTerms,
    keywords,
    competitive,
    monthlySummary,
  };
}
