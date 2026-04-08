"use client";

import { useState } from "react";
import { useApiData, useApiMutation } from "@/hooks/use-api-data";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageLoading } from "@/components/shared/loading";
import { PageError } from "@/components/shared/error";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/shared/button";
import { Dialog, ConfirmDialog } from "@/components/shared/dialog";
import { poStatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { CreatePurchaseOrderForm } from "@/components/forms/purchase-order-form";
import { EditPurchaseOrderForm } from "@/components/forms/edit-forms";
import type { PurchaseOrdersPagePayload } from "@/lib/services/page-payload-service";

type PO = PurchaseOrdersPagePayload["purchaseOrders"][number];

export function PurchaseOrdersPage() {
  const { data, isLoading, isError, error, refetch } =
    useApiData<PurchaseOrdersPagePayload>("/api/pages/purchase-orders");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PO | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PO | null>(null);

  const archiveMutation = useApiMutation<Record<string, never>, unknown>(
    archiveTarget ? `/api/purchase-orders/${archiveTarget.id}/archive` : "",
    "POST"
  );

  async function handleArchive() {
    if (!archiveTarget) return;
    const result = await archiveMutation.mutate({});
    if (result.ok) {
      setArchiveTarget(null);
      refetch();
    }
  }

  function handleCreateSuccess() {
    setCreateOpen(false);
    refetch();
  }

  function handleEditSuccess() {
    setEditTarget(null);
    refetch();
  }

  const columns = [
    {
      key: "po",
      header: "Supplier / PO#",
      render: (po: PO) => (
        <div>
          <p className="text-sm font-medium">{po.supplier}</p>
          {po.poNumber && <p className="text-xs text-muted-foreground">{po.poNumber}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (po: PO) => poStatusBadge(po.status),
    },
    {
      key: "total",
      header: "Total",
      render: (po: PO) => (
        <span className="tabular-nums text-sm">{formatCurrency(po.totalAmount)}</span>
      ),
    },
    {
      key: "deposit",
      header: "Deposit",
      render: (po: PO) => (
        <span className="tabular-nums text-sm text-muted-foreground">
          {formatCurrency(po.depositAmount)}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance Due",
      render: (po: PO) => (
        <span className={`tabular-nums text-sm font-medium ${po.balanceDue > 0 ? "text-red-500" : "text-muted-foreground"}`}>
          {formatCurrency(po.balanceDue)}
        </span>
      ),
    },
    {
      key: "eta",
      header: "ETA",
      render: (po: PO) => (
        <span className="text-sm text-muted-foreground">{formatDate(po.expectedEta)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (po: PO) => (
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setEditTarget(po); }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setArchiveTarget(po); }}
            className="text-destructive hover:text-destructive"
          >
            Archive
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <AppTopbar
        title="Purchase Orders"
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            + New PO
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        {isLoading && <PageLoading />}
        {isError && <PageError message={error ?? undefined} onRetry={refetch} />}
        {data && data.purchaseOrders.length === 0 && (
          <EmptyState
            title="No purchase orders"
            description="Create your first PO to start tracking supplier orders."
            action={<button onClick={() => setCreateOpen(true)} className="text-sm font-medium text-primary hover:underline">+ New PO</button>}
          />
        )}
        {data && data.purchaseOrders.length > 0 && (
          <DataTable
            columns={columns}
            rows={data.purchaseOrders}
            getKey={(po) => po.id}
          />
        )}
      </main>

      {/* Create */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Purchase Order">
        <CreatePurchaseOrderForm
          onSuccess={handleCreateSuccess}
          onCancel={() => setCreateOpen(false)}
        />
      </Dialog>

      {/* Edit */}
      <Dialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Purchase Order"
      >
        {editTarget && (
          <EditPurchaseOrderForm
            id={editTarget.id}
            initial={{
              supplier: editTarget.supplier,
              poNumber: editTarget.poNumber,
              totalAmount: editTarget.totalAmount,
              depositAmount: editTarget.depositAmount,
              currency: editTarget.currency,
              expectedEta: editTarget.expectedEta,
              notes: null,
              status: editTarget.status,
            }}
            onSuccess={handleEditSuccess}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </Dialog>

      {/* Archive confirm */}
      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
        title="Archive purchase order?"
        description={archiveTarget ? `"${archiveTarget.supplier}${archiveTarget.poNumber ? ` (${archiveTarget.poNumber})` : ""}" will be hidden from all views.` : ""}
        confirmLabel="Archive"
        destructive
        loading={archiveMutation.isLoading}
      />
    </>
  );
}
