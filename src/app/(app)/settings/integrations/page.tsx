"use client";

import { AppTopbar } from "@/components/app/app-topbar";
import { IntegrationsPage } from "@/components/pages/settings/integrations-page";

export default function Page() {
  return (
    <>
      <AppTopbar title="Integrations" />
      <main className="flex-1 overflow-y-auto">
        <IntegrationsPage />
      </main>
    </>
  );
}
