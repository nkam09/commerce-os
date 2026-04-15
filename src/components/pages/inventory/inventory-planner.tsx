"use client";

import { useState } from "react";
import { useApiData } from "@/hooks/use-api-data";
import { cn } from "@/lib/utils/cn";
import { AIInsightBanner } from "@/components/pages/dashboard/ai-insight-banner";
import { InventorySummaryCards } from "./inventory-summary-cards";
import { InventoryTable } from "./inventory-table";
import type { InventoryPlannerData } from "@/lib/services/inventory-service";
import { useBrandParam } from "@/lib/stores/brand-store";

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card h-36" />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="rounded-lg border border-border bg-card h-96" />
    </div>
  );
}

export function InventoryPlanner() {
  const bp = useBrandParam();
  const { data, isLoading, isError, error, refetch } =
    useApiData<InventoryPlannerData>(`/api/inventory/planner?_=1${bp}`);

  const [stockType, setStockType] = useState("all");
  const [fulfillment, setFulfillment] = useState("all");
  const [marketplace, setMarketplace] = useState("us");
  const [showOOS, setShowOOS] = useState(false);
  const [settingsProductId, setSettingsProductId] = useState<string | null>(null);

  const selectClass =
    "rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary cursor-pointer";

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-sm text-red-400 font-medium">Failed to load inventory data</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <button
            onClick={refetch}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-elevated transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const lowStockCount = data.products.filter((p) => p.daysOfStockLeft < 30).length;

  return (
    <div className="space-y-4 p-6">
      {/* AI Insight */}
      <AIInsightBanner
        message={`${lowStockCount} product${lowStockCount !== 1 ? "s have" : " has"} less than 30 days of stock remaining. Garlic Press (25d) and Bamboo Cutting Board (19d) need immediate reorder attention. Total stock value across all channels: $12,471. Consider consolidating your next PO to reduce shipping costs.`}
      />

      {/* Top controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={stockType}
          onChange={(e) => setStockType(e.target.value)}
          className={selectClass}
        >
          <option value="all">All Stock Types</option>
          <option value="fba">FBA Only</option>
          <option value="fbm">FBM Only</option>
          <option value="prep">Prep Center</option>
        </select>

        <select
          value={fulfillment}
          onChange={(e) => setFulfillment(e.target.value)}
          className={selectClass}
        >
          <option value="all">All Fulfillment</option>
          <option value="fba">FBA</option>
          <option value="fbm">FBM</option>
        </select>

        <select
          value={marketplace}
          onChange={(e) => setMarketplace(e.target.value)}
          className={selectClass}
        >
          <option value="us">US Marketplace</option>
          <option value="ca">Canada</option>
          <option value="uk">UK</option>
          <option value="de">Germany</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showOOS}
            onChange={(e) => setShowOOS(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Show OOS
        </label>
      </div>

      {/* Summary cards */}
      <InventorySummaryCards cards={data.summaryCards} />

      {/* Inventory table */}
      {data.products.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm font-medium text-foreground">No inventory data</p>
          <p className="text-xs text-muted-foreground mt-1">
            Sync your Amazon account to see inventory here.
          </p>
        </div>
      ) : (
        <InventoryTable
          products={data.products}
          onOpenSettings={setSettingsProductId}
        />
      )}
    </div>
  );
}
