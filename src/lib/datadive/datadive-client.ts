/**
 * Data Dive API Client (STUB)
 *
 * TODO: Replace stub implementations with real API calls.
 * Docs: https://developer.datadive.tools/docs
 *
 * This stub exists so the PPC Report Generator can compile and run end-to-end
 * without blocking on Data Dive credentials or endpoint discovery. All methods
 * return empty arrays. The report builder treats empty results as "no data
 * available" and still produces a valid workbook (the corresponding tabs will
 * render with headers only).
 *
 * When credentials/endpoint details are known:
 *   1. Update `baseUrl` if different.
 *   2. Implement `getKeywordRanks` — likely POST /v1/keywords/ranks with
 *      { keywords, asins, marketplace } body and Bearer auth.
 *   3. Implement `getCompetitorData` — likely POST /v1/competitors with
 *      { asins, marketplace } body.
 *   4. Add error handling and rate-limit backoff consistent with other
 *      Commerce OS API clients (see ads-api-client.ts).
 */

export type KeywordRankResult = {
  keyword: string;
  asin: string;
  rank?: number;
  organicRank?: number;
  sponsoredRank?: number;
  searchVolume?: number;
  marketplace?: string;
  // Allow extra fields the real API may return.
  [key: string]: unknown;
};

export type CompetitorResult = {
  asin: string;
  competitorAsin: string;
  competitorTitle?: string;
  competitorBrand?: string;
  competitorPrice?: number;
  competitorRating?: number;
  competitorReviewCount?: number;
  marketplace?: string;
  [key: string]: unknown;
};

export type DataDiveConfig = {
  apiKey: string;
  baseUrl?: string;
};

export class DataDiveClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(configOrApiKey: DataDiveConfig | string) {
    if (typeof configOrApiKey === "string") {
      this.apiKey = configOrApiKey;
      this.baseUrl = "https://api.datadive.tools";
    } else {
      this.apiKey = configOrApiKey.apiKey;
      this.baseUrl = configOrApiKey.baseUrl ?? "https://api.datadive.tools";
    }
  }

  /**
   * Fetch keyword rank data for a set of keywords × ASINs.
   *
   * TODO: Replace stub with real Data Dive call.
   * Expected endpoint (unverified): POST {baseUrl}/v1/keywords/ranks
   * Headers: Authorization: Bearer {apiKey}
   * Body: { keywords, asins, marketplace }
   */
  async getKeywordRanks(params: {
    keywords: string[];
    asins: string[];
    marketplace?: string;
  }): Promise<KeywordRankResult[]> {
    // TODO: Implement real API call. Returning [] so the report builder
    // can gracefully render a keywords tab with headers only.
    void this.apiKey;
    void this.baseUrl;
    void params;
    console.log(
      `[datadive] getKeywordRanks STUB called (keywords=${params.keywords.length}, asins=${params.asins.length}) — returning []`
    );
    return [];
  }

  /**
   * Fetch competitor data for a set of ASINs.
   *
   * TODO: Replace stub with real Data Dive call.
   * Expected endpoint (unverified): POST {baseUrl}/v1/competitors
   * Headers: Authorization: Bearer {apiKey}
   * Body: { asins, marketplace }
   */
  async getCompetitorData(params: {
    asins: string[];
    marketplace?: string;
  }): Promise<CompetitorResult[]> {
    // TODO: Implement real API call.
    void this.apiKey;
    void this.baseUrl;
    void params;
    console.log(
      `[datadive] getCompetitorData STUB called (asins=${params.asins.length}) — returning []`
    );
    return [];
  }
}
