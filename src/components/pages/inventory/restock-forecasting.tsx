"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useApiData } from "@/hooks/use-api-data";
import { AIInsightBanner } from "@/components/pages/dashboard/ai-insight-banner";
import { RestockForecastTab } from "./restock-forecast-tab";
import { UnitSalesTrendTab } from "./unit-sales-trend-tab";
import { CustomizeForecastTab } from "./customize-forecast-tab";
import { RestockProfilesTab } from "./restock-profiles-tab";
import { EmailReminderTab } from "./email-reminder-tab";
import type { RestockData } from "@/lib/services/restock-service";
import { useBrandParam } from "@/lib/stores/brand-store";

const TABS = [
  "Forecast",
  "Unit Sales Trend",
  "Customize Forecast",
  "Restock Profiles",
  "Email Reminder",
] as const;
type Tab = (typeof TABS)[number];

export function RestockForecasting() {
  const [tab, setTab] = useState<Tab>("Forecast");
  const bp = useBrandParam();
  const { data, isLoading, isError, error } = useApiData<RestockData>(
    `/api/restock/forecast?_=1${bp}`
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading restock data...
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-xs text-red-400">{error ?? "Failed to load restock data"}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">No restock data available yet.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Start tracking your inventory to see restock recommendations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* AI Insight */}
      <AIInsightBanner page="inventory" />

      {/* Page title */}
      <div>
        <h1 className="text-lg font-bold text-foreground">Restock Forecasting</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Forecast demand, plan reorders, and avoid stockouts across your catalog.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              tab === t
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Active tab */}
      {tab === "Forecast" && <RestockForecastTab data={data.forecast} />}
      {tab === "Unit Sales Trend" && (
        <UnitSalesTrendTab data={data.unitSalesTrend} forecast={data.forecast} />
      )}
      {tab === "Customize Forecast" && (
        <CustomizeForecastTab products={data.forecast} />
      )}
      {tab === "Restock Profiles" && (
        <RestockProfilesTab profiles={data.profiles} />
      )}
      {tab === "Email Reminder" && (
        <EmailReminderTab products={data.forecast} />
      )}
    </div>
  );
}
