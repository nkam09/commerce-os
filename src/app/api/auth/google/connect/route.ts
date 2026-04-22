/**
 * GET /api/auth/google/connect
 *
 * Starts the Google OAuth flow. Redirects the browser to Google's consent
 * screen. After the user grants access, Google redirects back to
 * /api/auth/google/callback with `code` and `state`.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiUnauthorized } from "@/lib/utils/api";
import { getAuthUrl, isGoogleConfigured } from "@/lib/google/google-oauth-client";
import { randomBytes } from "node:crypto";

export async function GET() {
  let userId: string;
  try {
    const auth = await requireUser();
    userId = auth.userId;
  } catch {
    return apiUnauthorized();
  }

  if (!isGoogleConfigured()) {
    return apiError(
      "Google Calendar is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI in env.",
      500
    );
  }

  // State = userId:nonce — we verify userId matches on callback so a leaked
  // state token from another session can't attach Google to the wrong user.
  const nonce = randomBytes(16).toString("hex");
  const state = `${userId}:${nonce}`;

  const url = getAuthUrl(state);
  if (!url) return apiError("Failed to build OAuth URL", 500);
  return NextResponse.redirect(url);
}
