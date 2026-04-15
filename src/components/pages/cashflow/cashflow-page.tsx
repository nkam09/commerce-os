"use client";

import { useApiData } from "@/hooks/use-api-data";
import { AIInsightBanner } from "@/components/pages/dashboard/ai-insight-banner";
import { CashflowSummaryCards } from "./cashflow-summary-cards";
import { CashflowTimelineChart } from "./cashflow-timeline-chart";
import { SettlementTable } from "./settlement-table";
import { ScenarioPlanner } from "./scenario-planner";
import { MonthlyBreakdownTable } from "./monthly-breakdown-table";
import { formatCurrency } from "@/lib/utils/formatters";
import type { CashflowPageData, CashPositionCard } from "@/lib/services/cashflow-service";
import { useBrandParam } from "@/lib/stores/brand-store";

type Props = {
  initialData?: CashflowPageData;
};

function buildAIBannerMessage(cards: CashPositionCard[]): string {
  const cardMap = new Map(cards.map((c) => [c.label.toLowerCase(), c]));

  const netCash = cardMap.get("net cash flow");
  const cashIn = cardMap.get("cash in");
  const cashOut = cardMap.get("cash out");
  const runway = cardMap.get("runway");

  const parts: string[] = [];

  if (netCash) {
    const sign = netCash.value >= 0 ? "+" : "";
    parts.push(
      `Your 30-day net cash flow is ${sign}${formatCurrency(netCash.value)}.`
    );
  }

  if (runway) {
    const days =
      typeof runway.value === "number" ? `${runway.value} days` : String(runway.value);
    parts.push(`Estimated runway: ${days}.`);
  }

  if (cashIn && cashOut) {
    parts.push(
      `Cash in: ${formatCurrency(cashIn.value)}, cash out: ${formatCurrency(cashOut.value)}.`
    );
  }

  if (parts.length === 0) {
    parts.push("Cash flow data is being calculated.");
  }

  return parts.join(" ");
}

export function CashflowPage({ initialData }: Props) {
  const bp = useBrandParam();
  const { data: fetched } = useApiData<CashflowPageData>(
    initialData ? null : `/api/cashflow/projections?_=1${bp}`
  );

  const data = initialData ?? fetched;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading cashflow data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. AI Insight Banner */}
      <AIInsightBanner message={buildAIBannerMessage(data.positionCards)} />

      {/* 2. Summary Cards */}
      <CashflowSummaryCards cards={data.positionCards} />

      {/* 3. Timeline Chart */}
      <CashflowTimelineChart timeline={data.timeline} />

      {/* 4. Settlement Table + Scenario Planner */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SettlementTable settlements={data.settlements} />
        <ScenarioPlanner
          defaultInputs={data.defaultInputs}
          savedScenarios={data.savedScenarios}
        />
      </div>

      {/* 5. Monthly Breakdown Table */}
      <MonthlyBreakdownTable data={data.monthlyCashflow} />
    </div>
  );
}
