"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  syncEnabled: boolean;
  calendarId: string | null;
  lastSyncedAt: string | null;
};

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function IntegrationsPage() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const showConnectedBanner = sp.get("connected") === "google";
  const oauthError = sp.get("error");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/google/status");
      const json = await res.json();
      if (json.ok) setStatus(json.data);
    } catch (err) {
      console.error("Failed to load integration status:", err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleConnect = useCallback(() => {
    window.location.href = "/api/auth/google/connect";
  }, []);

  const handleDisconnect = useCallback(async () => {
    if (!confirm("Disconnect Google Calendar? Existing synced events will remain in your calendar but will no longer be updated.")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/google/disconnect", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  const toggleSync = useCallback(async () => {
    if (!status) return;
    setBusy(true);
    try {
      await fetch("/api/auth/google/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncEnabled: !status.syncEnabled }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }, [status, load]);

  const handleSyncNow = useCallback(async () => {
    setSyncMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/google/sync-now", { method: "POST" });
      const json = await res.json();
      if (json.ok) setSyncMessage("Sync started. Refresh in a few seconds.");
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-6 md:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground md:text-2xl">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Commerce OS to external services.
        </p>
      </header>

      {showConnectedBanner && (
        <div className="mb-4 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
          Google Calendar connected successfully.
        </div>
      )}
      {oauthError && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          Google OAuth error: {oauthError}
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Google Calendar</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Syncs tasks, orders (production + delivery dates), and experiments to your primary Google Calendar.
            </p>
          </div>
        </div>

        {!status ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !status.configured ? (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
            Google Calendar is not configured on this server. Ask your admin to set{" "}
            <code className="rounded bg-elevated px-1">GOOGLE_CLIENT_ID</code>,{" "}
            <code className="rounded bg-elevated px-1">GOOGLE_CLIENT_SECRET</code>, and{" "}
            <code className="rounded bg-elevated px-1">GOOGLE_REDIRECT_URI</code>.
          </div>
        ) : !status.connected ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-60"
          >
            Connect Google Calendar
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-foreground">
                Connected — <span className="text-muted-foreground">calendar: {status.calendarId}</span>
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Last synced: <span className="text-foreground">{formatRelative(status.lastSyncedAt)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={status.syncEnabled}
                  onChange={toggleSync}
                  disabled={busy}
                  className="rounded"
                />
                Sync enabled
              </label>
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={busy || !status.syncEnabled}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition disabled:opacity-60"
              >
                Sync now
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={busy}
                className="ml-auto rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition disabled:opacity-60"
              >
                Disconnect
              </button>
            </div>

            {syncMessage && (
              <p className="text-2xs text-green-400">{syncMessage}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
