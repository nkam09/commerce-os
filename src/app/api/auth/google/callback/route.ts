/**
 * GET /api/auth/google/callback
 *
 * Google redirects the user here after granting consent. We exchange the
 * `code` for access + refresh tokens and persist them under the user's
 * GoogleCalendarConnection row.
 *
 * The `state` param must begin with the signed-in user's internal id
 * (set by /api/auth/google/connect) to prevent cross-account attachment.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiServerError, apiUnauthorized } from "@/lib/utils/api";
import { getOAuthClient, isGoogleConfigured } from "@/lib/google/google-oauth-client";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  try {
    let userId: string;
    try {
      const auth = await requireUser();
      userId = auth.userId;
    } catch {
      return apiUnauthorized();
    }

    if (!isGoogleConfigured()) {
      return apiError("Google Calendar is not configured on this server", 500);
    }

    const sp = req.nextUrl.searchParams;
    const code = sp.get("code");
    const state = sp.get("state");
    const error = sp.get("error");

    if (error) {
      return NextResponse.redirect(
        new URL(`/settings/integrations?error=${encodeURIComponent(error)}`, req.url)
      );
    }
    if (!code || !state) return apiError("Missing code/state from Google", 400);

    const [stateUserId] = state.split(":");
    if (stateUserId !== userId) {
      return apiError("State user mismatch — please restart the connect flow", 400);
    }

    const client = getOAuthClient();
    if (!client) return apiError("OAuth client unavailable", 500);

    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      // Without refresh_token we can't sync in the background. This usually
      // happens on re-auth — user must revoke first or we must request
      // prompt=consent (we do in getAuthUrl).
      return apiError(
        "Google did not return a refresh token. Revoke Commerce OS access at https://myaccount.google.com/permissions and try again.",
        400
      );
    }

    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600_000);

    await prisma.googleCalendarConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        syncEnabled: true,
      },
    });

    return NextResponse.redirect(new URL("/settings/integrations?connected=google", req.url));
  } catch (err) {
    return apiServerError(err);
  }
}
