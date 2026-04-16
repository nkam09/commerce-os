/**
 * GET /api/sync/amazon/test-connection
 *
 * Attempts an LWA token exchange using the SP API credentials in env vars.
 * On success, updates lastTestedAt on the first SP_API SyncConnection record.
 * Returns token metadata without the token value itself.
 *
 * TODO: Validate that the token returned by LWA is immediately usable
 *       for a real SP API call by also attempting getOrders with a narrow
 *       date range live.
 */

import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import {
  apiSuccess,
  apiError,
  apiUnauthorized,
  apiServerError,
} from "@/lib/utils/api";

type LwaTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export async function GET() {
  try {
    const { userId } = await requireUser();

    const clientId = process.env.AMAZON_SP_API_CLIENT_ID;
    const clientSecret = process.env.AMAZON_SP_API_CLIENT_SECRET;
    const refreshToken = process.env.AMAZON_SP_API_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      return apiError(
        "Missing SP API credentials. Set AMAZON_SP_API_CLIENT_ID, AMAZON_SP_API_CLIENT_SECRET, and AMAZON_SP_API_REFRESH_TOKEN in .env.local.",
        400
      );
    }

    // Attempt LWA token exchange
    const startedAt = Date.now();
    const res = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    const latencyMs = Date.now() - startedAt;

    if (!res.ok) {
      const text = await res.text();
      return apiError(
        `LWA token exchange failed (HTTP ${res.status}): ${text}`,
        502
      );
    }

    const token = (await res.json()) as LwaTokenResponse;

    // Update lastTestedAt on the first matching SP_API connection
    const connection = await prisma.syncConnection.findFirst({
      where: { userId, type: "SP_API" },
      select: { id: true },
    });

    if (connection) {
      await prisma.syncConnection.update({
        where: { id: connection.id },
        data: { lastTestedAt: new Date(), status: "ACTIVE" },
      });
    }

    return apiSuccess({
      ok: true,
      tokenType: token.token_type,
      expiresIn: token.expires_in,
      latencyMs,
      connectionUpdated: !!connection,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }
    return apiServerError(err);
  }
}
