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
import { shipmentStageBadge } from "@/components/shared/status-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/formatters";
import { CreateShipmentForm } from "@/components/forms/shipment-form";
import { EditShipmentForm } from "@/components/forms/edit-forms";
import type { ShipmentsPagePayload } from "@/lib/services/page-payload-service";

type Shipment = ShipmentsPagePayload["shipments"][number];

const MODE_LABEL: Record<string, string> = {
  SEA: "Sea", AIR: "Air", GROUND: "Ground", EXPRESS: "Express",
};

export function ShipmentsPage() {
  const { data, isLoading, isError, error, refetch } =
    useApiData<ShipmentsPagePayload>("/api/pages/shipments");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Shipment | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Shipment | null>(null);

  const archiveMutation = useApiMutation<Record<string, never>, unknown>(
    archiveTarget ? `/api/shipments/${archiveTarget.id}/archive` : "",
    "POST"
  );

  async function handleArchive() {
    if (!archiveTarget) return;
    const result = await archiveMutation.mutate({});
    if (result.ok) { setArchiveTarget(null); refetch(); }
  }

  const columns = [
    {
      key: "ref",
      header: "Reference",
      render: (s: Shipment) => (
        <div>
          <p className="text-sm font-medium">{s.reference ?? "—"}</p>
          {s.supplier && <p className="text-xs text-muted-foreground">{s.supplier}</p>}
        </div>
      ),
    },
    {
      key: "route",
      header: "Route",
      render: (s: Shipment) => (
        <span className="text-sm text-muted-foreground">
          {s.origin && s.destination ? `${s.origin} → ${s.destination}` : s.origin ?? s.destination ?? "—"}
        </span>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      render: (s: Shipment) => (
        <StatusBadge label={MODE_LABEL[s.mode] ?? s.mode} variant="muted" />
      ),
    },
    {
      key: "stage",
      header: "Stage",
      render: (s: Shipment) => shipmentStageBadge(s.stage),
    },
    {
      key: "units",
      header: "Units",
      render: (s: Shipment) => (
        <span className="tabular-nums text-sm text-muted-foreground">
          {s.units != null ? formatNumber(s.units) : "—"}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Shipping Cost",
      render: (s: Shipment) => (
        <span className="tabular-nums text-sm">
          {s.shippingCost != null ? formatCurrency(s.shippingCost) : "—"}
        </span>
      ),
    },
    {
      key: "eta",
      header: "ETA Arrival",
      render: (s: Shipment) => (
        <span className="text-sm text-muted-foreground">{formatDate(s.etaArrival)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (s: Shipment) => (
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditTarget(s); }}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setArchiveTarget(s); }} className="text-destructive hover:text-destructive">Archive</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <AppTopbar
        title="Shipments"
        actions={<Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>+ New Shipment</Button>}
      />
      <main className="flex-1 overflow-y-auto p-6">
        {isLoading && <PageLoading />}
        {isError && <PageError message={error ?? undefined} onRetry={refetch} />}
        {data && data.shipments.length === 0 && (
          <EmptyState title="No shipments" description="Track inbound shipments from your suppliers." action={<button onClick={() => setCreateOpen(true)} className="text-sm font-medium text-primary hover:underline">+ New Shipment</button>} />
        )}
        {data && data.shipments.length > 0 && (
          <DataTable columns={columns} rows={data.shipments} getKey={(s) => s.id} />
        )}
      </main>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Shipment">
        <CreateShipmentForm onSuccess={() => { setCreateOpen(false); refetch(); }} onCancel={() => setCreateOpen(false)} />
      </Dialog>

      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Shipment">
        {editTarget && (
          <EditShipmentForm
            id={editTarget.id}
            initial={{
              reference: editTarget.reference,
              supplier: editTarget.supplier,
              origin: editTarget.origin,
              destination: editTarget.destination,
              mode: editTarget.mode,
              stage: editTarget.stage,
              carrier: editTarget.carrier,
              trackingNumber: editTarget.trackingNumber,
              units: editTarget.units,
              shippingCost: editTarget.shippingCost,
              etaArrival: editTarget.etaArrival,
            }}
            onSuccess={() => { setEditTarget(null); refetch(); }}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
        title="Archive shipment?"
        description={archiveTarget ? `Shipment "${archiveTarget.reference ?? archiveTarget.id}" will be hidden from all views.` : ""}
        confirmLabel="Archive"
        destructive
        loading={archiveMutation.isLoading}
      />
    </>
  );
}
