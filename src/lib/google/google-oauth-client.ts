/**
 * Google OAuth client helper.
 *
 * Setup instructions (do once in Google Cloud Console):
 *   1. Create a project at https://console.cloud.google.com
 *   2. Enable "Google Calendar API"
 *   3. Create an OAuth 2.0 Client ID (type: Web application)
 *   4. Add redirect URI: `{APP_URL}/api/auth/google/callback`
 *      (for local dev: http://localhost:3000/api/auth/google/callback)
 *   5. Copy Client ID / Client Secret into .env:
 *        GOOGLE_CLIENT_ID=...
 *        GOOGLE_CLIENT_SECRET=...
 *        GOOGLE_REDIRECT_URI=https://your-domain/api/auth/google/callback
 *   6. Under OAuth consent screen, add scope:
 *        https://www.googleapis.com/auth/calendar.events
 *
 * If any env var is missing, `getOAuthClient()` returns null and callers
 * should gracefully no-op or return a "not configured" error.
 */
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
  "profile",
];

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

/** Returns a fresh OAuth2 client, or null if env isn't configured. */
export function getOAuthClient(): OAuth2Client | null {
  if (!isGoogleConfigured()) return null;
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(state: string): string | null {
  const client = getOAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CALENDAR_SCOPES,
    state,
  });
}
