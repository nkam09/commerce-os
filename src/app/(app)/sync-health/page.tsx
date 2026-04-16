"use client";

import { useApiData } from "@/hooks/use-api-data";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageLoading } from "@/components/shared/loading";
import { PageError } from "@/components/shared/error";
import { EmptyState } from "@/components/shared/empty-state";
import { syncStatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils/formatters";
import { formatNumber } from "@/lib/utils/formatters";

type JobRun = {
  id: string;
  jobName: string;
  status: string;
  fetchedCount: number;
  writtenCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type Cursor = {
  jobName: string;
  cursor: string | null;
  lastRunAt: string | null;
};

type Connection = {
  id: string;
  name: string;
  type: string;
  status: string;
  lastTestedAt: string | null;
  recentRuns: JobRun[];
  cursors: Cursor[];
};

type SyncHealthPayload = { connections: Connection[] };

export default function SyncHealthPage() {
  const { data, isLoading, isError, error, refetch } =
    useApiData<SyncHealthPayload>("/api/sync/health");

  return (
    <>
      <AppTopbar title="Sync Health" />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoading && <PageLoading />}
        {isError && <PageError message={error ?? undefined} onRetry={refetch} />}
        {data && data.connections.length === 0 && (
          <EmptyState
            title="No sync connections"
            description="Add Amazon credentials in Settings to enable sync."
          />
        )}
        {data && data.connections.map((conn) => (
          <div key={conn.id} className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Connection header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold">{conn.name}</h2>
                <span className="text-xs text-muted-foreground">{conn.type}</span>
              </div>
              <div className="flex items-center gap-3">
                {syncStatusBadge(conn.status)}
                {conn.lastTestedAt && (
                  <span className="text-xs text-muted-foreground">
                    Tested {formatDate(conn.lastTestedAt)}
                  </span>
                )}
              </div>
            </div>

            {/* Cursors */}
            {conn.cursors.length > 0 && (
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Sync Cursors</p>
                <div className="flex flex-wrap gap-3">
                  {conn.cursors.map((c) => (
                    <div key={c.jobName} className="text-xs bg-muted rounded px-2 py-1">
                      <span className="font-mono font-medium">{c.jobName}</span>
                      {c.cursor && <span className="text-muted-foreground ml-2">{c.cursor}</span>}
                      {c.lastRunAt && <span className="text-muted-foreground ml-2">· {formatDate(c.lastRunAt)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent runs */}
            <div>
              <p className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
                Recent Job Runs
              </p>
              {conn.recentRuns.length === 0 && (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">No runs yet.</p>
              )}
              {conn.recentRuns.map((run) => (
                <div key={run.id} className="px-4 py-3 border-b border-border last:border-0 flex items-start justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium font-mono">{run.jobName}</span>
                      {syncStatusBadge(run.status)}
                    </div>
                    {run.errorMessage && (
                      <p className="text-xs text-red-500 truncate">{run.errorMessage}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="flex gap-4 text-xs text-muted-foreground justify-end">
                      <span>Fetched: <strong className="text-foreground">{formatNumber(run.fetchedCount)}</strong></span>
                      <span>Written: <strong className="text-foreground">{formatNumber(run.writtenCount)}</strong></span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(run.startedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Instructions when connections are inactive */}
        {data && data.connections.every((c) => c.status === "INACTIVE") && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-4">
            <p className="text-sm font-medium mb-1">Ready to connect Amazon?</p>
            <p className="text-sm text-muted-foreground">
              Add your SP API and Ads API credentials to <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> then run{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">GET /api/sync/amazon/test-connection</code> to validate.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
