"use client";

import { useState } from "react";
import { useApiMutation } from "@/hooks/use-api-data";
import { Button } from "@/components/shared/button";
import { FormField, FormRow, Input, Textarea, Select } from "@/components/shared/form-fields";

const MODE_OPTIONS = [
  { value: "SEA", label: "Sea" },
  { value: "AIR", label: "Air" },
  { value: "GROUND", label: "Ground" },
  { value: "EXPRESS", label: "Express" },
];

const STAGE_OPTIONS = [
  { value: "PREPARING", label: "Preparing" },
  { value: "PICKED_UP", label: "Picked Up" },
  { value: "IN_TRANSIT", label: "In Transit" },
  { value: "CUSTOMS", label: "Customs" },
  { value: "ARRIVED", label: "Arrived" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

type ShipmentBody = {
  reference?: string | null;
  supplier?: string | null;
  origin?: string | null;
  destination?: string | null;
  mode?: string;
  stage?: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  cartons?: number | null;
  units?: number | null;
  shippingCost?: number | null;
  currency?: string;
  etaDeparture?: string | null;
  etaArrival?: string | null;
  notes?: string | null;
};

type FormState = {
  reference: string;
  supplier: string;
  origin: string;
  destination: string;
  mode: string;
  stage: string;
  carrier: string;
  trackingNumber: string;
  cartons: string;
  units: string;
  shippingCost: string;
  currency: string;
  etaDeparture: string;
  etaArrival: string;
  notes: string;
};

function blankForm(): FormState {
  return {
    reference: "", supplier: "", origin: "", destination: "",
    mode: "SEA", stage: "PREPARING", carrier: "", trackingNumber: "",
    cartons: "", units: "", shippingCost: "", currency: "USD",
    etaDeparture: "", etaArrival: "", notes: "",
  };
}

function toFormState(initial: ShipmentBody): FormState {
  function dateStr(v: string | null | undefined) {
    return v ? new Date(v).toISOString().slice(0, 10) : "";
  }
  return {
    reference: initial.reference ?? "",
    supplier: initial.supplier ?? "",
    origin: initial.origin ?? "",
    destination: initial.destination ?? "",
    mode: initial.mode ?? "SEA",
    stage: initial.stage ?? "PREPARING",
    carrier: initial.carrier ?? "",
    trackingNumber: initial.trackingNumber ?? "",
    cartons: initial.cartons != null ? String(initial.cartons) : "",
    units: initial.units != null ? String(initial.units) : "",
    shippingCost: initial.shippingCost != null ? String(initial.shippingCost) : "",
    currency: initial.currency ?? "USD",
    etaDeparture: dateStr(initial.etaDeparture),
    etaArrival: dateStr(initial.etaArrival),
    notes: initial.notes ?? "",
  };
}

function buildBody(f: FormState): ShipmentBody {
  return {
    reference: f.reference.trim() || null,
    supplier: f.supplier.trim() || null,
    origin: f.origin.trim() || null,
    destination: f.destination.trim() || null,
    mode: f.mode,
    stage: f.stage,
    carrier: f.carrier.trim() || null,
    trackingNumber: f.trackingNumber.trim() || null,
    cartons: f.cartons ? parseInt(f.cartons, 10) : null,
    units: f.units ? parseInt(f.units, 10) : null,
    shippingCost: f.shippingCost ? parseFloat(f.shippingCost) : null,
    currency: f.currency,
    etaDeparture: f.etaDeparture || null,
    etaArrival: f.etaArrival || null,
    notes: f.notes.trim() || null,
  };
}

// ─── Create Shipment Form ─────────────────────────────────────────────────────

type CreateShipmentFormProps = { onSuccess: () => void; onCancel: () => void };

export function CreateShipmentForm({ onSuccess, onCancel }: CreateShipmentFormProps) {
  const [f, setF] = useState<FormState>(blankForm());
  const mutation = useApiMutation<ShipmentBody, unknown>("/api/shipments/create", "POST");

  function set(key: keyof FormState, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const result = await mutation.mutate(buildBody(f));
    if (result.ok) onSuccess();
  }

  return <ShipmentFormFields f={f} set={set} isLoading={mutation.isLoading} apiError={mutation.error} onSubmit={handleSubmit} onCancel={onCancel} submitLabel="Create Shipment" />;
}

// ─── Edit Shipment Form ───────────────────────────────────────────────────────

type EditShipmentFormProps = {
  id: string;
  initial: ShipmentBody;
  onSuccess: () => void;
  onCancel: () => void;
};

export function EditShipmentForm({ id, initial, onSuccess, onCancel }: EditShipmentFormProps) {
  const [f, setF] = useState<FormState>(toFormState(initial));
  const mutation = useApiMutation<ShipmentBody, unknown>(`/api/shipments/${id}`, "PATCH");

  function set(key: keyof FormState, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const result = await mutation.mutate(buildBody(f));
    if (result.ok) onSuccess();
  }

  return <ShipmentFormFields f={f} set={set} isLoading={mutation.isLoading} apiError={mutation.error} onSubmit={handleSubmit} onCancel={onCancel} submitLabel="Save Changes" />;
}

// ─── Shared field layout ──────────────────────────────────────────────────────

type ShipmentFormFieldsProps = {
  f: FormState;
  set: (key: keyof FormState, value: string) => void;
  isLoading: boolean;
  apiError: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
};

function ShipmentFormFields({ f, set, isLoading, apiError, onSubmit, onCancel, submitLabel }: ShipmentFormFieldsProps) {
  return (
    <div className="space-y-4">
      <FormRow>
        <FormField label="Reference" htmlFor="reference">
          <Input id="reference" value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="SHIP-001" />
        </FormField>
        <FormField label="Supplier" htmlFor="shipSupplier">
          <Input id="shipSupplier" value={f.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Supplier name" />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Origin" htmlFor="origin">
          <Input id="origin" value={f.origin} onChange={(e) => set("origin", e.target.value)} placeholder="Shenzhen, CN" />
        </FormField>
        <FormField label="Destination" htmlFor="destination">
          <Input id="destination" value={f.destination} onChange={(e) => set("destination", e.target.value)} placeholder="Los Angeles, US" />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Mode" htmlFor="mode">
          <Select id="mode" value={f.mode} onChange={(e) => set("mode", e.target.value)} options={MODE_OPTIONS} />
        </FormField>
        <FormField label="Stage" htmlFor="stage">
          <Select id="stage" value={f.stage} onChange={(e) => set("stage", e.target.value)} options={STAGE_OPTIONS} />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Carrier" htmlFor="carrier">
          <Input id="carrier" value={f.carrier} onChange={(e) => set("carrier", e.target.value)} placeholder="e.g. Flexport" />
        </FormField>
        <FormField label="Tracking Number" htmlFor="trackingNumber">
          <Input id="trackingNumber" value={f.trackingNumber} onChange={(e) => set("trackingNumber", e.target.value)} placeholder="Tracking ID" />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Cartons" htmlFor="cartons">
          <Input id="cartons" type="number" min="0" step="1" value={f.cartons} onChange={(e) => set("cartons", e.target.value)} placeholder="0" />
        </FormField>
        <FormField label="Units" htmlFor="units">
          <Input id="units" type="number" min="0" step="1" value={f.units} onChange={(e) => set("units", e.target.value)} placeholder="0" />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Shipping Cost ($)" htmlFor="shippingCost">
          <Input id="shippingCost" type="number" min="0" step="0.01" value={f.shippingCost} onChange={(e) => set("shippingCost", e.target.value)} placeholder="0.00" />
        </FormField>
        <FormField label="Currency" htmlFor="shipCurrency">
          <Select id="shipCurrency" value={f.currency} onChange={(e) => set("currency", e.target.value)} options={[{ value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "GBP", label: "GBP" }, { value: "CNY", label: "CNY" }]} />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="ETA Departure" htmlFor="etaDeparture">
          <Input id="etaDeparture" type="date" value={f.etaDeparture} onChange={(e) => set("etaDeparture", e.target.value)} />
        </FormField>
        <FormField label="ETA Arrival" htmlFor="etaArrival">
          <Input id="etaArrival" type="date" value={f.etaArrival} onChange={(e) => set("etaArrival", e.target.value)} />
        </FormField>
      </FormRow>

      <FormField label="Notes" htmlFor="shipNotes">
        <Textarea id="shipNotes" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes…" />
      </FormField>

      {apiError && <p className="text-sm text-destructive">{apiError}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" size="md" onClick={onCancel} disabled={isLoading}>Cancel</Button>
        <Button variant="primary" size="md" loading={isLoading} onClick={onSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );
}
