import { AppTopbar } from "@/components/app/app-topbar";

export default function SettingsPage() {
  return (
    <>
      <AppTopbar title="Settings" />
      <main className="flex-1 overflow-y-auto p-6 max-w-2xl space-y-6">
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Amazon Credentials</h2>
          <p className="text-sm text-muted-foreground">
            SP API and Ads API credentials are configured via environment variables. Update{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> and restart the app.
          </p>
          <div className="text-xs text-muted-foreground space-y-1 font-mono bg-muted rounded p-3">
            <p>AMAZON_SP_API_CLIENT_ID</p>
            <p>AMAZON_SP_API_CLIENT_SECRET</p>
            <p>AMAZON_SP_API_REFRESH_TOKEN</p>
            <p>AMAZON_SP_AWS_ACCESS_KEY</p>
            <p>AMAZON_SP_AWS_SECRET_KEY</p>
            <p>AMAZON_SP_ROLE_ARN</p>
            <p className="pt-1">AMAZON_ADS_CLIENT_ID</p>
            <p>AMAZON_ADS_CLIENT_SECRET</p>
            <p>AMAZON_ADS_REFRESH_TOKEN</p>
            <p>AMAZON_ADS_PROFILE_ID</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Validation Routes</h2>
          <p className="text-sm text-muted-foreground">Use these routes to test Amazon connectivity before running full syncs.</p>
          <div className="text-xs font-mono space-y-1 bg-muted rounded p-3">
            <p>GET  /api/sync/amazon/test-connection</p>
            <p>POST /api/sync/amazon/test-orders-transform</p>
            <p>POST /api/sync/amazon/test-financial-transform</p>
            <p>POST /api/sync/amazon/test-inventory-transform</p>
          </div>
        </div>
      </main>
    </>
  );
}
