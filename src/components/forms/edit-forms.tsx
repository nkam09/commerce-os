"use client";

// Re-exports all edit form components and provides the archive mutation hook,
// so page components have a single import for their CRUD needs.

export { EditPurchaseOrderForm } from "@/components/forms/purchase-order-form";
export { EditShipmentForm } from "@/components/forms/shipment-form";
export { EditExpenseForm } from "@/components/forms/expense-form";
export { EditProjectForm } from "@/components/forms/project-form";

import { useApiMutation } from "@/hooks/use-api-data";

// Thin wrapper so page components don't inline fetch calls for archive actions.
export function useArchiveMutation(
  entity: "purchase-orders" | "shipments" | "expenses" | "projects",
  id: string
) {
  return useApiMutation<Record<string, never>, unknown>(
    `/api/${entity}/${id}/archive`,
    "POST"
  );
}
