"use client";

import { AppTopbar } from "@/components/app/app-topbar";
import { InventoryPlanner } from "@/components/pages/inventory/inventory-planner";

export default function InventoryPage() {
  return (
    <>
      <AppTopbar title="Inventory Planner" />
      <main className="flex-1 overflow-y-auto">
        <InventoryPlanner />
      </main>
    </>
  );
}
