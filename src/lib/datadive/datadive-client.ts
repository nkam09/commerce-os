/**
 * Data Dive API client — fetches keyword rankings and competitor data.
 * Docs: https://developer.datadive.tools/docs#/v1
 * Auth: x-api-key header
 */

export type RankRadar = {
  id: string;
  asin?: { asin: string };
  title: string;
  keywordCount: number;
};

export type RankEntry = {
  date: string;
  organicRank: number | null;
  impressionRank: number | null;
};

export type RankRadarKeyword = {
  keyword: string;
  searchVolume: number;
  ranks: RankEntry[];
  adData?: {
    impressionRank: number | null;
    acos: number | null;
    ppcSpend: number | null;
    ppcSales: number | null;
  };
};

export class DataDiveClient {
  private apiKey: string;
  private baseUrl = "https://api.datadive.tools";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "x-api-key": this.apiKey, accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Data Dive ${path} failed (${res.status}): ${body.slice(0, 200)}`
      );
    }
    return res.json();
  }

  async listRankRadars(): Promise<RankRadar[]> {
    const data = await this.request<{ data: { data: RankRadar[] } }>(
      "/v1/niches/rank-radars"
    );
    return data.data.data;
  }

  async getRankRadarKeywords(
    rankRadarId: string,
    startDate: string,
    endDate: string
  ): Promise<RankRadarKeyword[]> {
    const data = await this.request<{ data: RankRadarKeyword[] }>(
      `/v1/niches/rank-radars/${rankRadarId}?startDate=${startDate}&endDate=${endDate}`
    );
    return data.data;
  }
}
