/**
 * Amazon Selling Partner API Client
 *
 * Auth flow (LWA-only, no AWS credentials required):
 *   1. Exchange refresh token for LWA access token via api.amazon.com
 *   2. Attach LWA access token in x-amz-access-token header on every SP API request
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpApiConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  endpoint?: string;
};

type LwaToken = {
  access_token: string;
  expires_in: number;
  fetchedAt: number;
};

export type SpOrderItem = {
  ASIN: string;
  SellerSKU?: string;
  OrderItemId: string;
  Title?: string;
  QuantityOrdered: number;
  QuantityShipped?: number;
  ItemPrice?: { CurrencyCode: string; Amount: string };
  ItemTax?: { CurrencyCode: string; Amount: string };
};

export type SpOrder = {
  AmazonOrderId: string;
  PurchaseDate: string;
  LastUpdateDate: string;
  OrderStatus: string;
  MarketplaceId: string;
  OrderTotal?: { CurrencyCode: string; Amount: string };
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
};

export type SpOrdersResponse = {
  Orders: SpOrder[];
  NextToken?: string;
  LastUpdatedBefore?: string;
  CreatedBefore?: string;
};

export type SpOrderItemsResponse = {
  OrderItems: SpOrderItem[];
  NextToken?: string;
  AmazonOrderId: string;
};

export type SpShipmentItem = {
  ASIN?: string;
  SellerSKU?: string;
  QuantityShipped?: number;
  ItemChargeList?: Array<{
    ChargeType: string;
    ChargeAmount: { CurrencyCode: string; CurrencyAmount: number };
  }>;
  ItemFeeList?: Array<{
    FeeType: string;
    FeeAmount: { CurrencyCode: string; CurrencyAmount: number };
  }>;
  ItemTaxWithheldList?: Array<{
    TaxesWithheld: Array<{
      ChargeType: string;
      ChargeAmount: { CurrencyCode: string; CurrencyAmount: number };
    }>;
  }>;
};

export type SpShipmentEvent = {
  AmazonOrderId?: string;
  PostedDate?: string;
  MarketplaceId?: string;
  ShipmentItemList?: SpShipmentItem[];
};

export type SpServiceFeeEvent = {
  ASIN?: string;
  FeeReason?: string;
  FeeList?: Array<{
    FeeType: string;
    FeeAmount: { CurrencyCode: string; CurrencyAmount: number };
  }>;
  PostedDate?: string;
};

export type SpFinancialEvents = {
  ShipmentEventList?: SpShipmentEvent[];
  RefundEventList?: SpShipmentEvent[];
  ServiceFeeEventList?: SpServiceFeeEvent[];
  [key: string]: unknown;
};

export type SpFinancialEventsResponse = {
  FinancialEvents: SpFinancialEvents;
  NextToken?: string;
};

export type SpInventorySummary = {
  asin: string;
  fnSku?: string;
  sellerSku?: string;
  condition?: string;
  productName?: string;
  totalQuantity?: number;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: {
      totalReservedQuantity?: number;
      pendingCustomerOrderQuantity?: number;
      pendingTransshipmentQuantity?: number;
      fcProcessingQuantity?: number;
    };
    researchingQuantity?: { totalResearchingQuantity?: number };
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number };
  };
};

export type SpInventorySummariesResponse = {
  inventorySummaries: SpInventorySummary[];
  nextToken?: string;
};

// ─── Retry / backoff constants ────────────────────────────────────────────────

const RETRY_MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS  = 60_000;
const RETRY_MIN_FLOOR_MS  = 2_000;

// getOrderItems restore rate is 0.5 req/s per SP API docs.
// 1 call per 1500ms stays safely under quota during pagination within one order.
const ORDER_ITEMS_PACE_MS = 1_500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Full-jitter exponential backoff with a hard minimum floor.
 * delay = max(FLOOR, random(0, min(cap, base * 2^attempt)))
 */
function backoffMs(attempt: number): number {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attempt);
  const jittered = Math.floor(Math.random() * ceiling);
  return Math.max(RETRY_MIN_FLOOR_MS, jittered);
}

// ─── SpApiClient ──────────────────────────────────────────────────────────────

export class SpApiClient {
  private config: SpApiConfig;
  private endpoint: string;
  private lwaToken: LwaToken | null = null;

  constructor(config: SpApiConfig) {
    this.config = config;
    this.endpoint = config.endpoint ?? "https://sellingpartnerapi-na.amazon.com";
  }

  // ─── LWA Token ──────────────────────────────────────────────────────────

  private async getLwaToken(): Promise<string> {
    const now = Date.now();
    if (
      this.lwaToken &&
      now < this.lwaToken.fetchedAt + (this.lwaToken.expires_in - 60) * 1000
    ) {
      return this.lwaToken.access_token;
    }

    const res = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.config.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LWA token request failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.lwaToken = { ...data, fetchedAt: now };
    return data.access_token;
  }

  // ─── Core request with retry / backoff ──────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    queryParams: Record<string, string> = {},
    body?: unknown
  ): Promise<T> {
    const queryString = Object.keys(queryParams).length
      ? "?" + new URLSearchParams(queryParams).toString()
      : "";
    const url = `${this.endpoint}${path}${queryString}`;
    const bodyStr = body ? JSON.stringify(body) : undefined;

    for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
      const lwaToken = await this.getLwaToken();

      const res = await fetch(url, {
        method,
        headers: {
          "x-amz-access-token": lwaToken,
          "content-type": "application/json",
        },
        ...(bodyStr ? { body: bodyStr } : {}),
      });

      if (res.ok) {
        return res.json() as Promise<T>;
      }

      if (res.status === 429 || res.status === 503) {
        if (attempt === RETRY_MAX_ATTEMPTS - 1) {
          const text = await res.text();
          throw new Error(
            `SP API ${method} ${path} failed after ${RETRY_MAX_ATTEMPTS} attempts (${res.status}): ${text}`
          );
        }

        const retryAfterHeader = res.headers.get("retry-after");
        const rawWait = retryAfterHeader
          ? Math.ceil(parseFloat(retryAfterHeader) * 1_000)
          : backoffMs(attempt);
        const waitMs = Math.max(RETRY_MIN_FLOOR_MS, rawWait);

        console.warn(
          `[sp-api] ${res.status} on ${method} ${path} — attempt ${attempt + 1}/${RETRY_MAX_ATTEMPTS}, waiting ${waitMs}ms`
        );
        await sleep(waitMs);
        continue;
      }

      const text = await res.text();
      throw new Error(`SP API ${method} ${path} failed (${res.status}): ${text}`);
    }

    throw new Error(`SP API ${method} ${path}: exceeded retry limit`);
  }

  // ─── Orders ─────────────────────────────────────────────────────────────

  async getOrders(params: {
    createdAfter: string;
    marketplaceIds: string[];
    nextToken?: string;
  }): Promise<SpOrdersResponse> {
    const query: Record<string, string> = {
      MarketplaceIds: params.marketplaceIds.join(","),
    };
    if (params.nextToken) {
      query.NextToken = params.nextToken;
    } else {
      query.CreatedAfter = params.createdAfter;
    }

    const data = await this.request<{ payload: SpOrdersResponse }>(
      "GET",
      "/orders/v0/orders",
      query
    );
    return data.payload;
  }

  async getOrderItems(orderId: string, nextToken?: string): Promise<SpOrderItemsResponse> {
    const query: Record<string, string> = {};
    if (nextToken) query.NextToken = nextToken;

    const data = await this.request<{ payload: SpOrderItemsResponse }>(
      "GET",
      `/orders/v0/orders/${orderId}/orderItems`,
      query
    );
    return data.payload;
  }

  /**
   * Fetches all items for a single order following pagination.
   * Paced at ORDER_ITEMS_PACE_MS between paginated calls for the same order.
   * Inter-order pacing is the caller's responsibility — see syncOrdersJob.
   */
  async getAllOrderItems(orderId: string): Promise<SpOrderItem[]> {
    const items: SpOrderItem[] = [];
    let nextToken: string | undefined;
    let first = true;

    do {
      if (!first) {
        await sleep(ORDER_ITEMS_PACE_MS);
      }
      first = false;

      const page = await this.getOrderItems(orderId, nextToken);
      items.push(...(page.OrderItems ?? []));
      nextToken = page.NextToken;
    } while (nextToken);

    return items;
  }

  // ─── Financial Events ────────────────────────────────────────────────────

  async getFinancialEvents(params: {
    postedAfter: string;
    postedBefore?: string;
    nextToken?: string;
  }): Promise<SpFinancialEventsResponse> {
    const query: Record<string, string> = {};
    if (params.nextToken) {
      query.NextToken = params.nextToken;
    } else {
      query.PostedAfter = params.postedAfter;
      if (params.postedBefore) query.PostedBefore = params.postedBefore;
    }

    const data = await this.request<{ payload: SpFinancialEventsResponse }>(
      "GET",
      "/finances/v0/financialEvents",
      query
    );
    return data.payload;
  }

  // ─── Inventory Summaries ─────────────────────────────────────────────────

  /**
   * Fetch FBA inventory summaries for a marketplace.
   *
   * startDateTime: ISO 8601 date string. When provided, the API returns all
   * items with inventory activity since that date, including active products
   * that may be excluded from the default response. Defaults to 2024-01-01
   * to ensure all currently active products are returned.
   */
  async getInventorySummaries(params: {
  marketplaceId: string;
  nextToken?: string;
  startDateTime?: string;
  sellerSkus?: string[];
}): Promise<SpInventorySummariesResponse> {
  const query: Record<string, string> = {
  details: "true",
  marketplaceIds: params.marketplaceId,
};

if (params.sellerSkus?.length) {
  // sellerSkus filter is incompatible with granularityType — omit it
  query.sellerSkus = params.sellerSkus.join(",");
} else {
  query.granularityType = "Marketplace";
  query.granularityId = params.marketplaceId;
  query.startDateTime = params.startDateTime ?? new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19) + "Z";
}

if (params.nextToken) query.nextToken = params.nextToken;

    const data = await this.request<{ payload: SpInventorySummariesResponse }>(
      "GET",
      "/fba/inventory/v1/summaries",
      query
    );
    return data.payload;
  }

  async getAllInventorySummaries(marketplaceId: string): Promise<SpInventorySummary[]> {
    const all: SpInventorySummary[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.getInventorySummaries({ marketplaceId, nextToken });
      all.push(...(page.inventorySummaries ?? []));
      nextToken = page.nextToken;
    } while (nextToken);
    return all;
  }

  // ─── Reports ─────────────────────────────────────────────────────────────

  /**
   * Creates a report request.
   * Returns the reportId to poll for completion.
   */
  async createReport(params: {
    reportType: string;
    marketplaceIds: string[];
    dataStartTime?: string;
    dataEndTime?: string;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      reportType: params.reportType,
      marketplaceIds: params.marketplaceIds,
    };
    if (params.dataStartTime) body.dataStartTime = params.dataStartTime;
    if (params.dataEndTime) body.dataEndTime = params.dataEndTime;

    const data = await this.request<{ reportId: string }>(
      "POST",
      "/reports/2021-06-30/reports",
      {},
      body
    );
    return data.reportId;
  }

  /**
   * Gets the status and document ID for a report.
   */
  async getReport(reportId: string): Promise<{
    reportId: string;
    processingStatus: string;
    reportDocumentId?: string;
  }> {
    return this.request<{
      reportId: string;
      processingStatus: string;
      reportDocumentId?: string;
    }>("GET", `/reports/2021-06-30/reports/${reportId}`);
  }

  /**
   * Polls a report until it reaches a terminal status (DONE, CANCELLED, FATAL).
   * Returns the reportDocumentId on success.
   * Throws on CANCELLED or FATAL.
   */
  async pollReportUntilDone(
    reportId: string,
    pollIntervalMs = 15_000,
    maxWaitMs = 600_000
  ): Promise<string> {
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const report = await this.getReport(reportId);
      const status = report.processingStatus;

      console.log(`[sp-api] report ${reportId} status: ${status}`);

      if (status === "DONE") {
        if (!report.reportDocumentId) {
          throw new Error(`Report ${reportId} DONE but no reportDocumentId`);
        }
        return report.reportDocumentId;
      }

      if (status === "CANCELLED" || status === "FATAL") {
        throw new Error(`Report ${reportId} failed with status: ${status}`);
      }

      // IN_QUEUE or IN_PROGRESS — wait and retry
      await sleep(pollIntervalMs);
    }

    throw new Error(
      `Report ${reportId} did not complete within ${maxWaitMs / 1000}s`
    );
  }

  /**
   * Gets the download URL (and optional compression) for a report document.
   */
  async getReportDocument(documentId: string): Promise<{
    reportDocumentId: string;
    url: string;
    compressionAlgorithm?: string;
  }> {
    return this.request<{
      reportDocumentId: string;
      url: string;
      compressionAlgorithm?: string;
    }>("GET", `/reports/2021-06-30/documents/${documentId}`);
  }

  /**
   * Downloads and decompresses a report document, returning the raw text.
   * Handles GZIP compression if indicated.
   */
  async downloadReportDocument(
    url: string,
    compressionAlgorithm?: string
  ): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download report document (${res.status})`);
    }

    if (compressionAlgorithm === "GZIP") {
      const arrayBuf = await res.arrayBuffer();
      const { gunzipSync } = await import("zlib");
      const decompressed = gunzipSync(Buffer.from(arrayBuf));
      return decompressed.toString("utf-8");
    }

    return res.text();
  }

  // ─── Catalog Items ───────────────────────────────────────────────────────

  async getCatalogItem(asin: string, marketplaceId: string): Promise<Record<string, unknown>> {
    const query: Record<string, string> = {
      MarketplaceIds: marketplaceId,
      includedData: "summaries,images,productTypes",
    };
    const data = await this.request<Record<string, unknown>>(
      "GET",
      `/catalog/2022-04-01/items/${asin}`,
      query
    );
    return data;
  }
}