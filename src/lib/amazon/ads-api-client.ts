/**
 * Amazon Advertising API Client
 *
 * Auth flow:
 *   LWA token via refresh_token grant (no SigV4 needed — Bearer token auth)
 *
 * Report flow (V3 Reporting API):
 *   1. POST /reporting/reports  → returns reportId
 *   2. GET  /reporting/reports/{reportId}  → poll until status = COMPLETED
 *   3. GET  report.configuration.downloadUrl  → download gzip'd JSON
 *   4. Decompress and parse JSON array
 *
 * TODO: Validate report type IDs, column names, response shapes, and
 *       polling intervals against live Ads API credentials.
 */

import zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);

// ─── Types ──────────────────────────────────────────────────────────────────

export type AdsApiConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  profileId: string;
  endpoint?: string; // default: https://advertising-api.amazon.com
};

type LwaToken = {
  access_token: string;
  expires_in: number;
  fetchedAt: number;
};

// TODO: Validate exact column names in live report responses.
export type AdsReportRow = {
  date?: string;
  campaignName?: string;
  campaignId?: string;
  adGroupName?: string;
  adGroupId?: string;
  advertisedAsin?: string;
  advertisedSku?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  // Purchases/sales field names differ by report type and attribution window.
  // TODO: Validate exact field names live.
  purchases1d?: number;
  purchases7d?: number;
  purchases14d?: number;
  purchases30d?: number;
  sales1d?: number;
  sales7d?: number;
  sales14d?: number;
  sales30d?: number;
  // Targeting/keyword report fields (spTargeting)
  keywordId?: string;
  keyword?: string;         // keyword text in targeting reports
  targeting?: string;       // targeting expression OR keyword text in search term reports
  keywordType?: string;     // KEYWORD or PRODUCT_TARGETING
  keywordBid?: number;
  matchType?: string;
  adKeywordStatus?: string;
  // Search term report fields (spSearchTerm)
  searchTerm?: string;
  // Allow extra fields returned by Amazon that we don't map yet.
  [key: string]: unknown;
};

export type AdsReportStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

export type AdsReportResponse = {
  reportId: string;
  status: AdsReportStatus;
  statusDetails?: string;
  configuration?: {
    adProduct: string;
    reportTypeId: string;
    timeUnit: string;
    format: string;
  };
  url?: string; // Present when status = COMPLETED
  fileSize?: number;
  name?: string;
};

// ─── AdsApiClient ────────────────────────────────────────────────────────────

export class AdsApiClient {
  private config: AdsApiConfig;
  private endpoint: string;
  private lwaToken: LwaToken | null = null;

  constructor(config: AdsApiConfig) {
    this.config = config;
    this.endpoint = config.endpoint ?? "https://advertising-api.amazon.com";
  }

  // ─── LWA Token ──────────────────────────────────────────────────────────────

  private async getLwaToken(): Promise<string> {
    const now = Date.now();
    if (this.lwaToken && now < this.lwaToken.fetchedAt + (this.lwaToken.expires_in - 60) * 1000) {
      return this.lwaToken.access_token;
    }

    // TODO: Validate Ads LWA token endpoint behavior live.
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
      throw new Error(`Ads LWA token request failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.lwaToken = { ...data, fetchedAt: now };
    return data.access_token;
  }

  // ─── Authenticated request ──────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { contentType?: string; accept?: string } = {}
  ): Promise<T> {
    const token = await this.getLwaToken();
    const url = `${this.endpoint}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": this.config.clientId,
      "Amazon-Advertising-API-Scope": this.config.profileId,
      "Content-Type": options.contentType ?? "application/json",
    };
    if (options.accept) {
      headers.Accept = options.accept;
    }

    const res = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ads API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Amazon Ads V3 reporting requires a specific vendor Content-Type header
   * when creating async reports. Using plain application/json will be
   * rejected with a 415/406 error and cryptic message.
   */
  private static readonly REPORT_CONTENT_TYPE =
    "application/vnd.createasyncreportrequest.v3+json";

  // ─── Reporting V3 ───────────────────────────────────────────────────────────

  /**
   * Request a Sponsored Products daily performance report.
   * Returns a reportId to poll.
   *
   * TODO: Validate reportTypeId, column names, and adProduct values live.
   * TODO: Confirm GZIP_JSON vs GZIP_TSV format behavior live.
   * TODO: Validate date format requirements (YYYY-MM-DD) live.
   */
  async requestSponsoredProductsReport(params: {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
  }): Promise<string> {
    // TODO: Confirm exact column list supported by spAdvertisedProduct report type live.
    const body = {
      name: `SP Product Report ${params.startDate} to ${params.endDate}`,
      startDate: params.startDate,
      endDate: params.endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["advertiser"],
        columns: [
          "date",
          "campaignName",
          "campaignId",
          "adGroupName",
          "adGroupId",
          "advertisedAsin",
          "advertisedSku",
          "impressions",
          "clicks",
          "cost",
          "purchases7d",
          "sales7d",
        ],
        // TODO: Validate reportTypeId string for product-level daily report live.
        reportTypeId: "spAdvertisedProduct",
        timeUnit: "DAILY",
        format: "GZIP_JSON",
      },
    };

    const res = await this.request<AdsReportResponse>(
      "POST",
      "/reporting/reports",
      body,
      { contentType: AdsApiClient.REPORT_CONTENT_TYPE }
    );
    return res.reportId;
  }

  // ─── Targeting (Keyword) Report ─────────────────────────────────────────────

  /**
   * Request a Sponsored Products targeting (keyword) report.
   * Report type: spTargeting
   */
  async requestSPTargetingReport(params: {
    startDate: string;
    endDate: string;
    timeUnit?: "DAILY" | "SUMMARY";
  }): Promise<string> {
    const timeUnit = params.timeUnit ?? "SUMMARY";
    // "date" column is only valid (and required) for DAILY reports.
    const columns = [
      ...(timeUnit === "DAILY" ? ["date"] : []),
      "campaignName",
      "campaignId",
      "adGroupName",
      "adGroupId",
      "keywordId",
      "keyword",
      "targeting",
      "keywordType",
      "keywordBid",
      "matchType",
      "impressions",
      "clicks",
      "cost",
      "purchases7d",
      "sales7d",
    ];
    const body = {
      name: `SP Targeting Report ${params.startDate} to ${params.endDate}`,
      startDate: params.startDate,
      endDate: params.endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["targeting"],
        columns,
        reportTypeId: "spTargeting",
        timeUnit,
        format: "GZIP_JSON",
      },
    };

    const res = await this.request<AdsReportResponse>(
      "POST",
      "/reporting/reports",
      body,
      { contentType: AdsApiClient.REPORT_CONTENT_TYPE }
    );
    console.log(`[ads-api] requestSPTargetingReport: ${params.startDate} to ${params.endDate} timeUnit=${timeUnit} → reportId=${res.reportId}`);
    return res.reportId;
  }

  // ─── Campaign (spCampaigns) Report ──────────────────────────────────────────

  /**
   * Request a Sponsored Products campaign-level report (spCampaigns).
   * Used by the PPC Report Generator for campaign performance and
   * placement breakdown.
   *
   * groupBy defaults to ["campaign"]. Pass ["campaign", "campaignPlacement"]
   * for the placement breakdown tab.
   *
   * Returns { reportId } — use pollReport + downloadReport + parseGzipJsonReport
   * to fetch the rows.
   */
  async requestSPCampaignsReport(params: {
    profileId: string;
    startDate: string;
    endDate: string;
    includePlacement?: boolean;
  }): Promise<{ reportId: string }> {
    // groupBy is always ["campaign"]. The placement breakdown comes from
    // requesting the "placementClassification" column — NOT from a
    // separate groupBy value ("campaignPlacement" is rejected by the API).
    const groupBy = ["campaign"];

    // Minimal, guaranteed-supported column set.
    const columns = [
      "campaignName",
      "campaignId",
      "impressions",
      "clicks",
      "cost",
      "purchases7d",
      "sales7d",
    ];
    if (params.includePlacement) {
      columns.push("placementClassification");
    }

    const body = {
      name: `SP Campaign Report ${params.startDate} to ${params.endDate}`,
      startDate: params.startDate,
      endDate: params.endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy,
        columns,
        reportTypeId: "spCampaigns",
        timeUnit: "SUMMARY",
        format: "GZIP_JSON",
      },
    };

    console.log(
      `[ads-api] requestSPCampaignsReport body: ${JSON.stringify(body)}`
    );

    const res = await this.request<AdsReportResponse>(
      "POST",
      "/reporting/reports",
      body,
      { contentType: AdsApiClient.REPORT_CONTENT_TYPE }
    );
    console.log(
      `[ads-api] requestSPCampaignsReport: ${params.startDate} to ${params.endDate} groupBy=${groupBy.join(",")} → reportId=${res.reportId}`
    );
    return { reportId: res.reportId };
  }

  // ─── Search Term Report ─────────────────────────────────────────────────────

  /**
   * Request a Sponsored Products search term report.
   * Report type: spSearchTerm
   */
  async requestSPSearchTermReport(params: {
    startDate: string;
    endDate: string;
    timeUnit?: "DAILY" | "SUMMARY";
  }): Promise<string> {
    const timeUnit = params.timeUnit ?? "SUMMARY";
    const columns = [
      ...(timeUnit === "DAILY" ? ["date"] : []),
      "campaignName",
      "campaignId",
      "adGroupName",
      "adGroupId",
      "searchTerm",
      "targeting",
      "impressions",
      "clicks",
      "cost",
      "purchases7d",
      "sales7d",
    ];
    const body = {
      name: `SP Search Term Report ${params.startDate} to ${params.endDate}`,
      startDate: params.startDate,
      endDate: params.endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["searchTerm"],
        columns,
        reportTypeId: "spSearchTerm",
        timeUnit,
        format: "GZIP_JSON",
      },
    };

    const res = await this.request<AdsReportResponse>(
      "POST",
      "/reporting/reports",
      body,
      { contentType: AdsApiClient.REPORT_CONTENT_TYPE }
    );
    console.log(`[ads-api] requestSPSearchTermReport: ${params.startDate} to ${params.endDate} timeUnit=${timeUnit} → reportId=${res.reportId}`);
    return res.reportId;
  }

  // ─── Poll Report ─────────────────────────────────────────────────────────────

  /**
   * Poll report status until COMPLETED, FAILED, or CANCELLED.
   * TODO: Validate polling interval and timeout behavior live.
   * TODO: Confirm maximum wait times for large reports live.
   */
  async pollReport(
    reportId: string,
    options: { maxAttempts?: number; intervalMs?: number } = {}
  ): Promise<AdsReportResponse> {
    const { maxAttempts = 60, intervalMs = 10_000 } = options;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const report = await this.request<AdsReportResponse>(
        "GET",
        `/reporting/reports/${reportId}`
      );

      if (report.status === "COMPLETED") return report;
      if (report.status === "FAILED" || report.status === "CANCELLED") {
        throw new Error(
          `Ads report ${reportId} ended with status ${report.status}: ${report.statusDetails ?? ""}`
        );
      }

      // Still IN_PROGRESS — wait before retrying
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(
      `Ads report ${reportId} did not complete after ${maxAttempts} attempts`
    );
  }

  // ─── Download and Parse ──────────────────────────────────────────────────────

  /**
   * Download and decompress a completed report.
   * Returns the raw gzip buffer.
   * TODO: Validate download URL auth requirements (signed URL vs token) live.
   */
  async downloadReport(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Report download failed (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Decompress a gzip report buffer and parse as JSON array.
   * TODO: Validate that GZIP_JSON format always yields a JSON array live.
   */
  async parseGzipJsonReport(buffer: Buffer): Promise<AdsReportRow[]> {
    const decompressed = await gunzip(buffer);
    const text = decompressed.toString("utf8");
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error(`Expected JSON array from Ads report, got ${typeof parsed}`);
    }
    return parsed as AdsReportRow[];
  }

  /**
   * Full pipeline: request → poll → download → parse.
   * Returns raw report rows.
   */
  async fetchReportRows(params: {
    startDate: string;
    endDate: string;
  }): Promise<AdsReportRow[]> {
    const reportId = await this.requestSponsoredProductsReport(params);
    const report = await this.pollReport(reportId);

    if (!report.url) {
      throw new Error(`Report ${reportId} completed but has no download URL`);
    }

    const buffer = await this.downloadReport(report.url);
    return this.parseGzipJsonReport(buffer);
  }
}
