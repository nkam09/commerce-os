/**
 * Factory: builds a configured SpApiClient from environment variables.
 *
 * Single-user design: all credentials come from process.env.
 * Future multi-user: load encrypted credentials from SyncConnection record.
 */
import { SpApiClient } from "@/lib/amazon/sp-api-client";

/**
 * Returns a ready-to-use SpApiClient using LWA-only auth.
 * Throws if any required environment variable is missing.
 *
 * Required env vars:
 *   AMAZON_SP_API_CLIENT_ID
 *   AMAZON_SP_API_CLIENT_SECRET
 *   AMAZON_SP_API_REFRESH_TOKEN
 */
export function getSpClientForUser(): SpApiClient {
  const clientId = process.env.AMAZON_SP_API_CLIENT_ID;
  const clientSecret = process.env.AMAZON_SP_API_CLIENT_SECRET;
  const refreshToken = process.env.AMAZON_SP_API_REFRESH_TOKEN;

  const missing = (
    [
      ["AMAZON_SP_API_CLIENT_ID", clientId],
      ["AMAZON_SP_API_CLIENT_SECRET", clientSecret],
      ["AMAZON_SP_API_REFRESH_TOKEN", refreshToken],
    ] as [string, string | undefined][]
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `SpApiClient: missing required env vars: ${missing.join(", ")}`
    );
  }

  return new SpApiClient({
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
    endpoint: "https://sellingpartnerapi-na.amazon.com",
  });
}

/**
 * Returns AdsApiConfig from environment variables.
 * Throws if any required variable is missing.
 */
export function getAdsConfigForUser(): {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  profileId: string;
} {
  const clientId = process.env.AMAZON_ADS_CLIENT_ID;
  const clientSecret = process.env.AMAZON_ADS_CLIENT_SECRET;
  const refreshToken = process.env.AMAZON_ADS_REFRESH_TOKEN;
  const profileId = process.env.AMAZON_ADS_PROFILE_ID;

  const missing = (
    [
      ["AMAZON_ADS_CLIENT_ID", clientId],
      ["AMAZON_ADS_CLIENT_SECRET", clientSecret],
      ["AMAZON_ADS_REFRESH_TOKEN", refreshToken],
      ["AMAZON_ADS_PROFILE_ID", profileId],
    ] as [string, string | undefined][]
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `AdsApiClient: missing required env vars: ${missing.join(", ")}`
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
    profileId: profileId!,
  };
}
