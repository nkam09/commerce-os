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
import { DataDiveClient, type RankRadarKeyword } from "@/lib/datadive/datadive-client";

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
  totalRevenue: number; // from SP-API DailySale grossSales for all products
  sales: number;        // ad-attributed sales from Ads API
  orders: number;
  acos: number;       // spend / sales
  tacos: number;      // spend / totalRevenue
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
  orders: number;
  acos: number;
  roas: number;
  cvr: number;
};

export type SkuPnlRow = {
  asin: string;
  sku?: string;
  unitsSold: number;
  grossSales: number;
  adSpend: number;
  adSales: number;
  ppcUnits: number;       // unitsSold7d from Ads report per ASIN
  organicSales: number;   // grossSales - adSales (floored at 0)
  organicUnits: number;   // unitsSold - ppcUnits (floored at 0)
  organicPct: number;     // organicUnits / unitsSold
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
  keyword: string;
  searchVolume: number;
  latestOrganicRank: number | null;
  latestSponsoredRank: number | null;
  rankChange: number | null;      // positive = improved, negative = dropped
  avgOrganicRank: number | null;
  acos: number | null;
  ppcSpend: number | null;
  ppcSales: number | null;
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

/** Poll interval used while waiting for an Ads report to finish. */
const POLL_INTERVAL_MS = 10_000;
/** Max poll attempts — 60 × 10s = 10 minutes per report. Amazon's 30-day
 *  SUMMARY reports can take 5-10 minutes. All polls run in parallel so
 *  total wall time is still ~10 minutes max. */
const POLL_MAX_ATTEMPTS = 60;

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
    // Ordered by importance: campaigns first, placement last (least
    // critical and most likely to fail with 400).
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
      {
        key: "placements",
        label: "SP campaigns (by placement)",
        request: () =>
          adsRef
            .requestSPCampaignsReport({
              profileId: "",
              startDate: params.from,
              endDate: params.to,
              includePlacement: true,
            })
            .then((r) => r.reportId),
      },
    ];

    // Phase 1: create reports with 1s stagger to avoid 429 rate-limit
    // responses from the Ads API. Each report that succeeds immediately
    // enters the parallel-poll pool (Phase 2).
    console.log(`[ppc-report] requesting ${specs.length} Ads reports (1s stagger)`);
    const createStart = Date.now();
    const pollTasks: Promise<void>[] = [];

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      try {
        const reportId = await spec.request();
        console.log(
          `[ppc-report]     ${spec.label}: created reportId=${reportId}`
        );
        // Kick off poll+download immediately — it runs concurrently with
        // subsequent createReport calls AND with already-running polls.
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
        // 1s stagger after successful creates to stay under rate limits.
        // Skip delay after the last spec or after failures (move on fast).
        if (i < specs.length - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`${spec.label} create failed: ${msg}`);
        console.error(`[ppc-report] !!! ${spec.label} create failed:`, msg);
        // NO delay after failure — move to the next spec immediately.
      }
    }
    console.log(
      `[ppc-report] create phase done in ${Date.now() - createStart}ms, ${pollTasks.length} polls running`
    );

    // Phase 3: wait for all poll tasks to settle. No global timeout —
    // Render's plan allows long-running requests (>60s observed to work).
    // Individual failures are caught per-task above and logged as warnings.
    const pollStart = Date.now();
    await Promise.all(pollTasks);
    console.log(
      `[ppc-report] poll phase done in ${Date.now() - pollStart}ms`
    );
  }

  const spCampaignRows: AdsReportRow[] = results.campaigns ?? [];
  const spPlacementRows: AdsReportRow[] = results.placements ?? [];
  const spAdvertisedRows: AdsReportRow[] = results.advertised ?? [];
  const spTargetingRows: AdsReportRow[] = results.targeting ?? [];
  const spSearchTermRows: AdsReportRow[] = results.searchTerm ?? [];

  // Use UTC-anchored Date objects. Prisma maps `@db.Date` columns via UTC
  // boundaries, so a T00:00:00Z / T23:59:59Z range matches rows stored as
  // pure dates correctly regardless of server timezone.
  const fromDate = new Date(params.from + "T00:00:00Z");
  const toDate = new Date(params.to + "T23:59:59Z");

  // ── Daily total revenue from Prisma (for TACoS) ────────────────────────────
  // We pull grossSales from DailySale across ALL user products for the
  // period, grouped by date, so the Daily Trend tab can show Total Revenue
  // and TACoS alongside ad-attributed metrics.
  const dailyRevenueMap = new Map<string, number>();
  try {
    const allUserProducts = await prisma.product.findMany({
      where: { userId: params.userId },
      select: { id: true },
    });
    const allProductIds = allUserProducts.map((p) => p.id);
    if (allProductIds.length > 0) {
      const revRows = await prisma.dailySale.findMany({
        where: {
          productId: { in: allProductIds },
          date: { gte: fromDate, lte: toDate },
        },
        select: { date: true, grossSales: true },
      });
      for (const row of revRows) {
        const dateKey = row.date.toISOString().slice(0, 10);
        dailyRevenueMap.set(
          dateKey,
          (dailyRevenueMap.get(dateKey) ?? 0) + Number(row.grossSales)
        );
      }
    }
    console.log(
      `[ppc-report] dailyRevenue: ${dailyRevenueMap.size} days from Prisma`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Daily revenue lookup failed: ${msg}`);
    console.error(`[ppc-report] daily revenue failed:`, msg);
  }

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
      const totalRevenue = dailyRevenueMap.get(date) ?? 0;
      return {
        date,
        impressions: v.impressions,
        clicks: v.clicks,
        spend: v.spend,
        totalRevenue,
        sales: v.sales,
        orders: v.orders,
        acos,
        tacos: safeDiv(v.spend, totalRevenue),
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
  if (spPlacementRows.length > 0) {
    console.log(
      `[ppc-report] placement sample row keys:`,
      Object.keys(spPlacementRows[0])
    );
    console.log(
      `[ppc-report] placement sample row:`,
      JSON.stringify(spPlacementRows[0])
    );
    console.log(`[ppc-report] placement total rows:`, spPlacementRows.length);
  } else {
    console.log(`[ppc-report] placement rows: EMPTY`);
  }
  let placementLoggedFirst = false;
  const placements: PlacementRow[] = spPlacementRows.map((r) => {
    if (!placementLoggedFirst) {
      placementLoggedFirst = true;
      console.log(
        `[ppc-report] placement field: campaignPlacement=${r.campaignPlacement} | placementClassification=${(r as Record<string, unknown>).placementClassification}`
      );
    }
    const spend = toNum(r.cost);
    const sales = toNum(r.sales7d);
    const clicks = toNum(r.clicks);
    const orders = toNum(r.purchases7d);
    // Try both possible field names from the API
    const placementVal =
      (r.campaignPlacement as string | undefined) ??
      ((r as Record<string, unknown>).placementClassification as string | undefined) ??
      "";
    return {
      campaignId: String(r.campaignId ?? ""),
      campaignName: String(r.campaignName ?? ""),
      placement: String(placementVal),
      impressions: toNum(r.impressions),
      clicks,
      spend,
      sales,
      orders,
      acos: safeDiv(spend, sales),
      roas: safeDiv(sales, spend),
      cvr: safeDiv(orders, clicks),
    };
  });

  // ── Tab 4: Per-SKU P&L ─────────────────────────────────────────────────────
  // Aggregate ad spend/sales/units per ASIN from spAdvertised; then pull
  // DailySale + DailyFee from Prisma for the period.
  console.log(`[ppc-report] advertisedRows count: ${spAdvertisedRows.length}`);
  if (spAdvertisedRows.length > 0) {
    console.log(
      `[ppc-report] advertised sample row keys:`,
      Object.keys(spAdvertisedRows[0])
    );
    console.log(
      `[ppc-report] advertised sample row:`,
      JSON.stringify(spAdvertisedRows[0])
    );
  }

  const adByAsin = new Map<string, { spend: number; sales: number; units: number }>();
  for (const r of spAdvertisedRows) {
    const asin = String(r.advertisedAsin ?? "");
    if (!asin) continue;
    const cur = adByAsin.get(asin) ?? { spend: 0, sales: 0, units: 0 };
    cur.spend += toNum(r.cost);
    cur.sales += toNum(r.sales7d);
    cur.units += toNum(r.unitsSold7d);
    adByAsin.set(asin, cur);
  }
  console.log(
    `[ppc-report] adByAsin (from advertised):`,
    Object.fromEntries(
      [...adByAsin.entries()].map(([k, v]) => [
        k,
        { spend: v.spend, sales: v.sales, units: v.units },
      ])
    )
  );

  // Build PPC units + ad spend per ASIN from search term rows as a
  // fallback — the advertised product report's unitsSold7d can be
  // unreliable, and search term data is available even when the
  // advertised report returns empty.
  const stPpcByAsin = new Map<
    string,
    { spend: number; sales: number; units: number }
  >();
  for (const r of spSearchTermRows) {
    const campaignName = String(r.campaignName ?? "");
    const matchedAsin = TRACKED_ASINS.find((a) => campaignName.includes(a));
    if (!matchedAsin) continue;
    const cur = stPpcByAsin.get(matchedAsin) ?? { spend: 0, sales: 0, units: 0 };
    cur.spend += toNum(r.cost);
    cur.sales += toNum(r.sales7d);
    cur.units += toNum(r.purchases7d);
    stPpcByAsin.set(matchedAsin, cur);
  }
  console.log(
    `[ppc-report] stPpcByAsin (from search terms):`,
    Object.fromEntries(stPpcByAsin)
  );

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

    // Fetch ALL daily_sales rows and aggregate in JS. This bypasses Prisma
    // groupBy quirks that were returning 0 for grossSales (Decimal fields
    // plus groupBy _sum have known edge-case issues in some Prisma versions).
    const allSales = productIds.length
      ? await prisma.dailySale.findMany({
          where: {
            productId: { in: productIds },
            date: { gte: fromDate, lte: toDate },
          },
          select: {
            productId: true,
            grossSales: true,
            unitsSold: true,
            refundCount: true,
            refundAmount: true,
          },
        })
      : [];
    console.log(
      `[ppc-report] skuPnl: fetched ${allSales.length} daily_sales rows`
    );

    const salesByProduct = new Map<
      string,
      { gross: number; units: number; refunds: number; refundAmt: number }
    >();
    for (const row of allSales) {
      const cur = salesByProduct.get(row.productId) ?? {
        gross: 0,
        units: 0,
        refunds: 0,
        refundAmt: 0,
      };
      cur.gross += Number(row.grossSales);
      cur.units += row.unitsSold;
      cur.refunds += row.refundCount;
      cur.refundAmt += Number(row.refundAmount);
      salesByProduct.set(row.productId, cur);
    }
    console.log(
      `[ppc-report] skuPnl: JS-aggregated sales:`,
      Object.fromEntries(salesByProduct)
    );

    // Same approach for fees — findMany + JS aggregation.
    const allFees = productIds.length
      ? await prisma.dailyFee.findMany({
          where: {
            productId: { in: productIds },
            date: { gte: fromDate, lte: toDate },
          },
          select: {
            productId: true,
            referralFee: true,
            fbaFee: true,
            storageFee: true,
            otherFees: true,
          },
        })
      : [];

    const feesByProduct = new Map<
      string,
      { referral: number; fba: number; storage: number; other: number }
    >();
    for (const row of allFees) {
      const cur = feesByProduct.get(row.productId) ?? {
        referral: 0,
        fba: 0,
        storage: 0,
        other: 0,
      };
      cur.referral += Number(row.referralFee);
      cur.fba += Number(row.fbaFee);
      cur.storage += Number(row.storageFee);
      cur.other += Number(row.otherFees);
      feesByProduct.set(row.productId, cur);
    }

    for (const p of products) {
      const s = salesByProduct.get(p.id);
      const f = feesByProduct.get(p.id);

      const unitsSold = s?.units ?? 0;
      const grossSales = s?.gross ?? 0;
      const refundAmount = s?.refundAmt ?? 0;
      const referralFees = f?.referral ?? 0;
      const fbaFees = f?.fba ?? 0;
      const otherFees = (f?.other ?? 0) + (f?.storage ?? 0);

      const cogsPer = COGS_BY_ASIN[p.asin ?? ""] ?? 0;
      const cogs = cogsPer * unitsSold;

      const ads = adByAsin.get(p.asin ?? "") ?? { spend: 0, sales: 0, units: 0 };
      const stAds = stPpcByAsin.get(p.asin ?? "") ?? { spend: 0, sales: 0, units: 0 };
      // Prefer advertised-product data; fall back to search-term aggregation.
      const adSpend = ads.spend || stAds.spend;
      const adSales = ads.sales || stAds.sales;
      // Prefer search-term units (more reliable) over advertised-product units.
      const ppcUnits = stAds.units || ads.units;

      const organicSales = Math.max(0, grossSales - adSales);
      const organicUnits = Math.max(0, unitsSold - ppcUnits);
      const organicPct = safeDiv(organicUnits, unitsSold);

      const netProfit =
        grossSales -
        refundAmount -
        cogs -
        referralFees -
        fbaFees -
        otherFees -
        adSpend;

      const marginPct = safeDiv(netProfit, grossSales);
      const tacos = safeDiv(adSpend, grossSales);

      skuPnl.push({
        asin: p.asin ?? "",
        sku: p.sku ?? undefined,
        unitsSold,
        grossSales,
        adSpend,
        adSales,
        ppcUnits,
        organicSales,
        organicUnits,
        organicPct,
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
  if (spTargetingRows.length > 0) {
    console.log(
      `[ppc-report] sample targeting row:`,
      JSON.stringify(spTargetingRows[0])
    );
  }
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

  // ── Data Dive: keyword ranks + competitive ─────────────────────────────────
  let rankRadarKeywords: RankRadarKeyword[] = [];
  const dataDiveKey =
    process.env.DATADIVE_API_KEY ?? process.env.DATA_DIVE_API_KEY;
  if (dataDiveKey) {
    try {
      const dd = new DataDiveClient(dataDiveKey);
      const radars = await dd.listRankRadars();
      console.log(
        `[ppc-report] Data Dive radars:`,
        radars.map((r) => `${r.asin?.asin} (${r.keywordCount} kw)`)
      );

      // Find Kitchen Strong radar (B07XYBW774)
      const ksRadar = radars.find((r) => r.asin?.asin === "B07XYBW774");
      if (ksRadar) {
        rankRadarKeywords = await dd.getRankRadarKeywords(
          ksRadar.id,
          params.from,
          params.to
        );
        console.log(
          `[ppc-report] Data Dive: ${rankRadarKeywords.length} keywords from rank radar`
        );
      } else {
        warnings.push("Data Dive: no rank radar found for B07XYBW774");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Data Dive failed: ${msg}`);
      console.error(`[ppc-report] data dive failed:`, msg);
    }
  } else {
    warnings.push(
      "Data Dive API key not provided — competitive + rank data will be empty"
    );
  }

  // Build a lookup map for keyword enrichment
  const rankMap = new Map<string, RankRadarKeyword>();
  for (const kw of rankRadarKeywords) {
    rankMap.set(kw.keyword.toLowerCase(), kw);
  }

  const keywords: KeywordRow[] = keywordRowsBase.map((k) => {
    const ddMatch = rankMap.get(k.keyword.toLowerCase());
    const latestRank = ddMatch?.ranks
      .filter((rk) => rk.organicRank != null && rk.organicRank <= 100)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestSponsored = ddMatch?.ranks
      .filter((rk) => rk.impressionRank != null)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return {
      ...k,
      organicRank: latestRank?.organicRank ?? undefined,
      sponsoredRank: latestSponsored?.impressionRank ?? undefined,
      searchVolume: ddMatch?.searchVolume ?? undefined,
    };
  });

  // ── Tab 7: Competitive (from Data Dive rank radar) ────────────────────────
  const competitive: CompetitiveRow[] = rankRadarKeywords
    .map((kw) => {
      const validRanks = kw.ranks.filter(
        (r) => r.organicRank != null && r.organicRank <= 100
      );
      const sortedRanks = [...kw.ranks].sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      const latestOrganic = sortedRanks
        .filter((r) => r.organicRank != null && r.organicRank <= 100)
        .pop();
      const earliestOrganic = sortedRanks.find(
        (r) => r.organicRank != null && r.organicRank <= 100
      );
      const latestSponsored = sortedRanks
        .filter((r) => r.impressionRank != null)
        .pop();

      const avgOrganic =
        validRanks.length > 0
          ? validRanks.reduce((s, r) => s + (r.organicRank ?? 0), 0) /
            validRanks.length
          : null;

      // positive = improved (rank went down numerically = better),
      // negative = dropped
      const rankChange =
        earliestOrganic && latestOrganic
          ? (earliestOrganic.organicRank ?? 0) -
            (latestOrganic.organicRank ?? 0)
          : null;

      return {
        keyword: kw.keyword,
        searchVolume: kw.searchVolume,
        latestOrganicRank: latestOrganic?.organicRank ?? null,
        latestSponsoredRank: latestSponsored?.impressionRank ?? null,
        rankChange,
        avgOrganicRank: avgOrganic != null ? Math.round(avgOrganic) : null,
        acos: kw.adData?.acos ?? null,
        ppcSpend: kw.adData?.ppcSpend ?? null,
        ppcSales: kw.adData?.ppcSales ?? null,
      };
    })
    .sort((a, b) => b.searchVolume - a.searchVolume);

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
