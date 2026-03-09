/**
 * Commerce OS — Amazon Sync Service (Sprint 5)
 * Pulls real data from SP-API (orders, inventory, fees) and Ads API (campaigns, spend)
 * and writes it into the Postgres database via the existing upsert functions.
 */

import prisma from "./db";
import {
  upsertProduct,
  upsertDailySales,
  upsertDailyAds,
  upsertDailyFees,
} from "./db";

// ─── TOKEN MANAGEMENT ─────────────────────────────────────────────────────────

async function getSpApiAccessToken(): Promise<string> {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
      client_id:     process.env.AMAZON_CLIENT_ID!,
      client_secret: process.env.AMAZON_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SP-API token error: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function getAdsAccessToken(): Promise<string> {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: process.env.ADS_REFRESH_TOKEN!,
      client_id:     process.env.ADS_CLIENT_ID!,
      client_secret: process.env.ADS_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ads API token error: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

// ─── SP-API HELPERS ───────────────────────────────────────────────────────────

const SP_API_BASE = "https://sellingpartnerapi-na.amazon.com";

async function spApi(
  token: string,
  path: string,
  params?: Record<string, string>,
  method: "GET" | "POST" = "GET",
  body?: any
): Promise<any> {
  const url = new URL(`${SP_API_BASE}${path}`);
  if (params && method === "GET") Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method,
    headers: {
      "x-amz-access-token": token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SP-API ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

// ─── ADS API HELPERS ──────────────────────────────────────────────────────────

const ADS_API_BASE = "https://advertising-api.amazon.com";

async function adsApi(
  token: string,
  path: string,
  method: "GET" | "POST" = "GET",
  body?: any
): Promise<any> {
  // v3 reporting endpoint requires a special content-type header
  const isV3Report = path === "/reporting/reports" && method === "POST";
  const contentType = isV3Report
    ? "application/vnd.createasyncreportrequest.v3+json"
    : "application/json";

  const res = await fetch(`${ADS_API_BASE}${path}`, {
    method,
    headers: {
      "Amazon-Advertising-API-ClientId": process.env.ADS_CLIENT_ID!,
      "Amazon-Advertising-API-Scope":    process.env.ADS_PROFILE_ID!,
      "Authorization":                   `Bearer ${token}`,
      "Content-Type":                    contentType,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ads API ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0]; // "2026-03-07"
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(s: string): Date {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── RATE LIMIT HELPER ────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── SYNC: CATALOG / PRODUCTS ─────────────────────────────────────────────────

export async function syncProducts(
  userId: string,
  token: string
): Promise<{ synced: number; skus: string[] }> {
  const marketplaceId = process.env.AMAZON_MARKETPLACE_ID!;
  const sellerId      = process.env.AMAZON_SELLER_ID!;

  // Get all active listings — no pageSize param (it's not supported on all plan types)
  const data = await spApi(token, `/listings/2021-08-01/items/${sellerId}`, {
    marketplaceIds: marketplaceId,
    includedData:   "summaries,attributes",
  });

  const items = data.items ?? [];
  const skus: string[] = [];

  for (const item of items) {
    const sku   = item.sku;
    const attrs = item.attributes ?? {};
    const asin  = item.summaries?.[0]?.asin ?? sku;
    const title = attrs.item_name?.[0]?.value ?? item.summaries?.[0]?.itemName ?? sku;
    const brand = attrs.brand?.[0]?.value ?? "";

    await upsertProduct(userId, { asin, sku, title, brand });
    skus.push(sku);
  }

  return { synced: items.length, skus };
}

// ─── SYNC: ORDERS → DAILY SALES ───────────────────────────────────────────────

export async function syncOrders(
  userId: string,
  token: string,
  daysBack: number = 30
): Promise<{ synced: number }> {
  // NOTE: Revenue and fees are now sourced from syncFinances (ItemChargeList + ItemFeeList)
  // which has per-ASIN data without hitting per-order item quota limits.
  // syncOrders only handles TODAY's orders (finances lags ~1 day).
  const marketplaceId = process.env.AMAZON_MARKETPLACE_ID!;
  const todayStr      = toDateStr(new Date());
  const createdAfter  = new Date(daysAgo(1)).toISOString(); // only last 24h

  const marketplace = await prisma.marketplace.findFirst({ where: { userId } });
  if (!marketplace) return { synced: 0 };

  const products      = await prisma.product.findMany({ where: { userId } });
  const asinToProduct = new Map(products.map(p => [p.asin?.toUpperCase() ?? "", p]));

  // Aggregate today's orders by ASIN (order total only — no item calls)
  const todayMap = new Map<string, { grossSales: number; unitsSold: number }>();

  let nextToken: string | undefined;
  do {
    const params: Record<string, string> = {
      MarketplaceIds:    marketplaceId,
      CreatedAfter:      createdAfter,
      OrderStatuses:     "Shipped,Unshipped,PartiallyShipped",
      MaxResultsPerPage: "100",
    };
    if (nextToken) params.NextToken = nextToken;

    const data   = await spApi(token, "/orders/v0/orders", params);
    const orders = data.payload?.Orders ?? [];
    nextToken    = data.payload?.NextToken;

    for (const order of orders) {
      if (order.OrderStatus === "Cancelled") continue;
      const orderDate = toDateStr(new Date(order.PurchaseDate));
      if (orderDate !== todayStr) continue; // only today

      const total = Number(order.OrderTotal?.Amount ?? 0);
      const units = Number(order.NumberOfItemsShipped ?? order.NumberOfItemsUnshipped ?? 1);

      // We don't know ASIN from order list — spread equally across products as placeholder
      // This only affects "Today" tile; yesterday+ comes from finances
      for (const p of products) {
        const key = p.id;
        const ex  = todayMap.get(key) ?? { grossSales: 0, unitsSold: 0 };
        ex.grossSales += total / products.length;
        ex.unitsSold  += Math.round(units / products.length);
        todayMap.set(key, ex);
      }
    }
    if (nextToken) await sleep(300);
  } while (nextToken);

  // Write today's placeholder data (will be overwritten by finances tomorrow)
  let synced = 0;
  for (const [productId, data] of todayMap.entries()) {
    if (data.grossSales === 0) continue;
    await upsertDailySales(productId, marketplace.id, parseDate(todayStr), {
      grossSales: data.grossSales,
      unitsSold:  data.unitsSold,
    });
    synced++;
  }

  console.log(`[orders] wrote today's placeholder for ${synced} products`);
  return { synced };
}

// ─── SYNC: FINANCES → DAILY FEES ──────────────────────────────────────────────

export async function syncFinances(
  userId: string,
  token: string,
  daysBack: number = 30
): Promise<{ synced: number }> {
  const postedAfter = new Date(daysAgo(daysBack)).toISOString();

  const feesMap: Map<string, {
    asin: string; date: string;
    referralFees: number; fbaFees: number; storageFees: number;
    returnProcessingFees: number; otherFees: number;
    grossSales: number; unitsSold: number;
  }> = new Map();

  let nextToken: string | undefined;

  do {
    const params: Record<string, string> = { PostedAfter: postedAfter };
    if (nextToken) params.NextToken = nextToken;

    const data   = await spApi(token, "/finances/v0/financialEvents", params);
    const events = data.payload?.FinancialEvents ?? {};
    nextToken    = data.payload?.NextToken;

    // Log what event types we got back
    const eventKeys = Object.keys(events).filter(k => (events[k]?.length ?? 0) > 0);
    if (eventKeys.length > 0) console.log("[finances] event types:", eventKeys.join(", "));

    // Shipment events = fees per order item
    const shipmentEvents = events.ShipmentEventList ?? [];
    for (const shipEvent of shipmentEvents) {
      const date = toDateStr(new Date(shipEvent.PostedDate ?? shipEvent.ShipmentDate));

      for (const item of shipEvent.ShipmentItemList ?? []) {
        // Log first item to see actual field names
        if (feesMap.size === 0) console.log("[finances] sample item keys:", Object.keys(item).join(", "));

        const asin   = item.ASIN ?? item.asin ?? "";
        const sku    = item.SellerSKU ?? item.sellerSku ?? "";
        if (!asin && !sku) continue;
        const mapKey = `${asin || sku}::${date}`;

        const entry = feesMap.get(mapKey) ?? {
          asin: asin || sku, date, referralFees: 0, fbaFees: 0, storageFees: 0,
          returnProcessingFees: 0, otherFees: 0, grossSales: 0, unitsSold: 0,
        };

        // Capture revenue from ItemChargeList (Principal = sale price)
        for (const charge of item.ItemChargeList ?? []) {
          const raw = charge.ChargeAmount ?? {};
          const amt = Number(raw.CurrencyAmount ?? raw.Amount ?? 0);
          if (charge.ChargeType === "Principal") entry.grossSales += amt;
        }
        entry.unitsSold += Number(item.QuantityShipped ?? 1);

        for (const fee of item.ItemFeeList ?? []) {
          const raw = fee.FeeAmount ?? {};
          const amt = Math.abs(Number(raw.CurrencyAmount ?? raw.Amount ?? 0));
          if (fee.FeeType === "ReferralFee")                entry.referralFees += amt;
          else if (fee.FeeType === "FBAPerUnitFulfillmentFee") entry.fbaFees   += amt;
          else if (fee.FeeType === "FBAStorageFee")          entry.storageFees += amt;
          else if (fee.FeeType === "ReturnShipping")         entry.returnProcessingFees += amt;
          else if (fee.FeeType === "Commission")             entry.referralFees += amt; // Commission = referral
          else                                               entry.otherFees    += amt;
        }
        feesMap.set(mapKey, entry);
      }
    }
  } while (nextToken);

  // Write to DB
  let synced = 0;
  const marketplace = await prisma.marketplace.findFirst({ where: { userId } });
  if (!marketplace) return { synced: 0 };

  // SKU aliases — map any Amazon-side SKU variants to our canonical SKUs if needed
  const SKU_ALIASES: Record<string, string> = {
    // These ARE the real SKUs now — no aliases needed
  };

  const products = await prisma.product.findMany({ where: { userId } });
  const asinMap  = new Map(products.map(p => [p.asin, p]));
  const skuMap   = new Map(products.map(p => [p.sku, p]));
  console.log(`[finances] feesMap has ${feesMap.size} entries, known ASINs: ${[...asinMap.keys()].join(", ")}`);

  for (const entry of feesMap.values()) {
    const resolvedSku = SKU_ALIASES[entry.asin] ?? entry.asin;
    const product = asinMap.get(entry.asin)
      ?? skuMap.get(entry.asin)
      ?? skuMap.get(resolvedSku);
    if (!product) {
      console.log(`[finances] no match for ${entry.asin}`);
      continue;
    }

    // Write fees
    await upsertDailyFees(product.id, marketplace.id, parseDate(entry.date), {
      referralFees:         entry.referralFees,
      fbaFees:              entry.fbaFees,
      storageFees:          entry.storageFees,
      returnProcessingFees: entry.returnProcessingFees,
      otherFees:            entry.otherFees,
    });

    // Also write sales from finances (more accurate than orders API)
    if (entry.grossSales > 0) {
      await upsertDailySales(product.id, marketplace.id, parseDate(entry.date), {
        grossSales: entry.grossSales,
        unitsSold:  entry.unitsSold,
      });
    }

    console.log(`[finances] ${entry.asin} ${entry.date}: sales=$${entry.grossSales.toFixed(2)} units=${entry.unitsSold} fba=$${entry.fbaFees.toFixed(2)} referral=$${entry.referralFees.toFixed(2)}`);
    synced++;
  }

  return { synced };
}

// ─── SYNC: FBA INVENTORY ──────────────────────────────────────────────────────

export async function syncInventory(
  userId: string,
  token: string
): Promise<{ synced: number }> {
  const marketplaceId = process.env.AMAZON_MARKETPLACE_ID!;

  // Fetch ALL inventory pages (API returns 50 per page)
  let allSummaries: any[] = [];
  let nextToken: string | undefined;

  do {
    const params: Record<string, string> = {
      details:         "true",
      granularityType: "Marketplace",
      granularityId:   marketplaceId,
      marketplaceIds:  marketplaceId,
    };
    if (nextToken) params.nextToken = nextToken;

    const data = await spApi(token, "/fba/inventory/v1/summaries", params);
    const page = data.payload?.inventorySummaries ?? [];
    allSummaries = allSummaries.concat(page);
    nextToken = data.payload?.pagination?.nextToken;
    console.log(`[inventory] fetched ${page.length} items (total so far: ${allSummaries.length})`);
  } while (nextToken);

  const summaries = allSummaries;
  console.log(`[inventory] got ${summaries.length} summaries from FBA`);
  if (summaries.length > 0) console.log(`[inventory] sample item keys: ${Object.keys(summaries[0]).join(", ")}, asin=${summaries[0].asin}, sellerSku=${summaries[0].sellerSku}`);

  // Only sync inventory for products already in our DB — no auto-registration
  const products = await prisma.product.findMany({ where: { userId } });
  const asinMap  = new Map(products.map(p => [p.asin?.trim().toUpperCase(), p]));
  const skuMap   = new Map(products.map(p => [p.sku?.trim(), p]));
  console.log(`[inventory] known ASINs: ${[...asinMap.keys()].join(", ")}`);

  let synced = 0;

  // Fetch marketplace once before the loop
  const marketplace = await prisma.marketplace.findFirst({ where: { userId } });
  if (!marketplace) return { synced: 0 };

  for (const item of summaries) {
    const asin    = (item.asin ?? "").trim().toUpperCase();
    const sku     = (item.sellerSku ?? "").trim();
    const product = asinMap.get(asin) ?? skuMap.get(sku);
    if (!product) {
      // Only log first few to avoid spam
      if (synced === 0) console.log(`[inventory] no product match for ASIN ${asin} / SKU ${sku}`);
      continue;
    }

    const details   = item.inventoryDetails ?? {};
    const available = Number(item.totalQuantity ?? 0);
    const reserved  = Number(details.reservedQuantity?.totalReservedQuantity ?? 0);
    const inbound   = Number(details.inboundReceivingQuantity?.totalQuantity ?? 0) +
                      Number(details.inboundShippedQuantity?.totalQuantity ?? 0) +
                      Number(details.inboundWorkingQuantity?.totalQuantity ?? 0);

    // Delete today's snapshot and recreate (upsert by productId+date not supported)
    await prisma.inventorySnapshot.deleteMany({
      where: {
        productId:     product.id,
        marketplaceId: marketplace.id,
        snapshotAt:    { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });
    await prisma.inventorySnapshot.create({
      data: {
        productId:     product.id,
        marketplaceId: marketplace.id,
        available,
        reserved,
        inbound,
        awd: 0,
        snapshotAt: new Date(),
      },
    });
    synced++;
  }

  return { synced };
}

// ─── SYNC: ADS CAMPAIGNS ──────────────────────────────────────────────────────

export async function syncAds(
  userId: string,
  adsToken: string,
  daysBack: number = 30
): Promise<{ synced: number; pendingReportId?: string }> {
  const marketplace = await prisma.marketplace.findFirst({ where: { userId } });
  if (!marketplace) return { synced: 0 };

  const startDate = toDateStr(daysAgo(daysBack));
  const endDate   = toDateStr(daysAgo(2)); // 2-day lag for SP data availability

  // Check if we have a pending report from a previous sync
  const conn = await prisma.syncConnection.findUnique({
    where: { userId_provider: { userId, provider: "amazon_ads" } },
  });
  const pendingReportId = conn?.metadataJson ? JSON.parse(conn.metadataJson).pendingReportId : null;

  let reportId = pendingReportId;

  if (!reportId) {
    // Request a new report
    const reportReq = await adsApi(adsToken, "/reporting/reports", "POST", {
      name:          `Commerce OS SP ${startDate} to ${endDate}`,
      startDate,
      endDate,
      configuration: {
        adProduct:    "SPONSORED_PRODUCTS",
        groupBy:      ["campaign"],
        columns:      ["campaignId", "campaignName", "impressions", "clicks", "cost", "sales7d", "purchases7d"],
        reportTypeId: "spCampaigns",
        timeUnit:     "SUMMARY",
        format:       "GZIP_JSON",
      },
    });

    reportId = reportReq.reportId;
    if (!reportId) throw new Error(`No reportId from Ads API: ${JSON.stringify(reportReq)}`);

    // Save reportId so next sync can poll it
    await prisma.syncConnection.upsert({
      where:  { userId_provider: { userId, provider: "amazon_ads" } },
      create: { userId, provider: "amazon_ads", metadataJson: JSON.stringify({ pendingReportId: reportId }) },
      update: { metadataJson: JSON.stringify({ pendingReportId: reportId }) },
    });

    console.log(`[ads] report requested: ${reportId} — will poll next sync`);
    return { synced: 0, pendingReportId: reportId };
  }

  // We have a pending report — check its status
  const status = await adsApi(adsToken, `/reporting/reports/${reportId}`);
  console.log(`[ads] pending report ${reportId} status: ${status.status}`);

  if (status.status === "PENDING" || status.status === "PROCESSING") {
    return { synced: 0, pendingReportId: reportId }; // still waiting
  }

  // Clear the pending report ID regardless of outcome
  await prisma.syncConnection.update({
    where: { userId_provider: { userId, provider: "amazon_ads" } },
    data:  { metadataJson: JSON.stringify({ pendingReportId: null }) },
  });

  if (status.status === "FAILED") throw new Error(`Ads report failed: ${JSON.stringify(status)}`);
  if (status.status !== "COMPLETED") throw new Error(`Ads report unexpected status: ${status.status}`);

  const reportUrl = status.url ?? status.location ?? status.downloadUrl;
  console.log(`[ads] completed report fields: ${Object.keys(status).join(", ")}`);
  if (!reportUrl) throw new Error(`No download URL in completed report: ${JSON.stringify(status)}`);

  // Download and decompress
  const reportRes = await fetch(reportUrl, {
    headers: {
      "Amazon-Advertising-API-ClientId": process.env.ADS_CLIENT_ID!,
      "Amazon-Advertising-API-Scope":    process.env.ADS_PROFILE_ID!,
      "Authorization":                   `Bearer ${adsToken}`,
    },
  });

  let rows: any[];
  try {
    const buffer = await reportRes.arrayBuffer();
    const { gunzipSync } = await import("zlib");
    const decompressed = gunzipSync(Buffer.from(buffer));
    rows = JSON.parse(decompressed.toString("utf-8"));
  } catch {
    rows = await reportRes.json().catch(() => []);
  }
  console.log(`[ads] report has ${rows.length} rows`);
  if (rows.length === 0) {
    console.log(`[ads] 0 rows — report date range: ${startDate} to ${endDate}. Check if SP campaigns are active.`);
    return { synced: 0 };
  }

  const products = await prisma.product.findMany({ where: { userId } });
  let synced = 0;
  const today = parseDate(toDateStr(new Date()));

  for (const row of rows) {
    const campaignId   = row.campaignId?.toString() ?? row.campaignName;
    const campaignName = row.campaignName ?? campaignId;
    const spend        = Number(row.cost ?? row.spend ?? 0);
    const sales        = Number(row.sales7d ?? 0);
    const clicks       = Number(row.clicks ?? 0);
    const impressions  = Number(row.impressions ?? 0);
    const orders       = Number(row.purchases7d ?? 0);
    const acos         = sales > 0 ? spend / sales : 0;
    const date         = row.date ? parseDate(row.date) : today;

    let productId: string | undefined;
    for (const p of products) {
      if (campaignName.toLowerCase().includes(p.sku.toLowerCase()) ||
          campaignName.toLowerCase().includes((p.title ?? "").toLowerCase())) {
        productId = p.id;
        break;
      }
    }

    await upsertDailyAds(campaignId, marketplace.id, date, {
      campaignId, campaignName, adType: "SP",
      spend, sales, clicks, impressions, orders, acos,
      ...(productId ? { product: { connect: { id: productId } } } : {}),
    } as any);
    synced++;
  }

  return { synced };
}

// ─── MASTER SYNC ──────────────────────────────────────────────────────────────

export interface SyncResult {
  success:   boolean;
  startedAt: string;
  duration:  number; // ms
  steps: {
    products:  { synced: number; error?: string };
    orders:    { synced: number; error?: string };
    finances:  { synced: number; error?: string };
    inventory: { synced: number; error?: string };
    ads:       { synced: number; error?: string };
  };
}

export async function runFullSync(userId: string, daysBack: number = 30): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const t0        = Date.now();

  const result: SyncResult = {
    success: true,
    startedAt,
    duration: 0,
    steps: {
      products:  { synced: 0 },
      orders:    { synced: 0 },
      finances:  { synced: 0 },
      inventory: { synced: 0 },
      ads:       { synced: 0 },
    },
  };

  let spToken:  string | null = null;
  let adsToken: string | null = null;

  // Get tokens
  try {
    spToken = await getSpApiAccessToken();
  } catch (e: any) {
    result.success = false;
    const msg = e.message;
    result.steps.products.error  = msg;
    result.steps.orders.error    = msg;
    result.steps.finances.error  = msg;
    result.steps.inventory.error = msg;
    result.duration = Date.now() - t0;
    return result;
  }

  try {
    adsToken = await getAdsAccessToken();
  } catch (e: any) {
    result.steps.ads.error = e.message;
  }

  // Run each step independently so one failure doesn't block others
  try {
    const r = await syncProducts(userId, spToken);
    result.steps.products.synced = r.synced;
  } catch (e: any) {
    result.steps.products.error = e.message;
    result.success = false;
  }

  try {
    await sleep(2000); // Let SP-API quota recover after products sync
    const r = await syncOrders(userId, spToken, daysBack);
    result.steps.orders.synced = r.synced;
  } catch (e: any) {
    result.steps.orders.error = e.message;
    result.success = false;
  }

  try {
    const r = await syncFinances(userId, spToken, daysBack);
    result.steps.finances.synced = r.synced;
  } catch (e: any) {
    result.steps.finances.error = e.message;
    result.success = false;
  }

  try {
    const r = await syncInventory(userId, spToken);
    result.steps.inventory.synced = r.synced;
  } catch (e: any) {
    result.steps.inventory.error = e.message;
    result.success = false;
  }

  if (adsToken) {
    try {
      const r = await syncAds(userId, adsToken, daysBack);
      result.steps.ads.synced = r.synced;
      if (r.pendingReportId) {
        result.steps.ads.error = `Report pending (${r.pendingReportId}) — sync again in 2-3 mins to download`;
      }
    } catch (e: any) {
      result.steps.ads.error = e.message;
      result.success = false;
    }
  }

  result.duration = Date.now() - t0;
  return result;
}
