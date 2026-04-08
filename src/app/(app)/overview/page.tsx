"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DashboardTilesView } from "@/components/pages/dashboard/tiles-view";
import { ChartView } from "@/components/pages/dashboard/chart-view";
import { PLView } from "@/components/pages/dashboard/pl-view";
import { TrendsView } from "@/components/pages/dashboard/trends-view";
import { PageLoading } from "@/components/shared/loading";

function DashboardViewRouter() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "tiles";

  switch (view) {
    case "tiles":
      return <DashboardTilesView />;
    case "chart":
      return <ChartView />;
    case "pl":
      return <PLView />;
    case "trends":
      return <TrendsView />;
    default:
      return <DashboardTilesView />;
  }
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DashboardViewRouter />
    </Suspense>
  );
}
