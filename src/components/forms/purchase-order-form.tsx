"use client";

import { useState } from "react";
import { useApiMutation } from "@/hooks/use-api-data";
import { Button } from "@/components/shared/button";
import { FormField, FormRow, Input, Textarea, Select } from "@/components/shared/form-fields";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DEPOSITED", label: "Deposited" },
  { value: "IN_PRODUCTION", label: "In Production" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "RECEIVED", label: "Received" },
  { value: "CANCELLED", label: "Cancelled" },
];

type POBody = {
  supplier: string;
  poNumber?: string | null;
  totalAmount: number;
  depositAmount?: number;
  currency?: string;
  expectedEta?: string | null;
  notes?: string | null;
};

type POUpdateBody = Partial<POBody> & { status?: string };

// ─── Shared form state type ───────────────────────────────────────────────────

type FormState = {
  supplier: string;
  poNumber: string;
  totalAmount: string;
  depositAmount: string;
  currency: string;
  expectedEta: string;
  notes: string;
  status?: string;
};

function blankForm(): FormState {
  return {
    supplier: "",
    poNumber: "",
    totalAmount: "",
    depositAmount: "0",
    currency: "USD",
    expectedEta: "",
    notes: "",
  };
}

function toFormState(initial: Partial<POBody> & { status?: string }): FormState {
  return {
    supplier: initial.supplier ?? "",
    poNumber: initial.poNumber ?? "",
    totalAmount: initial.totalAmount != null ? String(initial.totalAmount) : "",
    depositAmount: initial.depositAmount != null ? String(initial.depositAmount) : "0",
    currency: initial.currency ?? "USD",
    expectedEta: initial.expectedEta
      ? new Date(initial.expectedEta).toISOString().slice(0, 10)
      : "",
    notes: initial.notes ?? "",
    status: initial.status,
  };
}

// ─── Create Purchase Order Form ───────────────────────────────────────────────

type CreatePOFormProps = {
  onSuccess: () => void;
  onCancel: () => void;
};

export function CreatePurchaseOrderForm({ onSuccess, onCancel }: CreatePOFormProps) {
  const [f, setF] = useState<FormState>(blankForm());
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const mutation = useApiMutation<POBody, unknown>("/api/purchase-orders/create", "POST");

  function set(key: keyof FormState, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!f.supplier.trim()) errs.supplier = "Supplier is required";
    const total = parseFloat(f.totalAmount);
    if (isNaN(total) || total < 0) errs.totalAmount = "Enter a valid total amount";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    const body: POBody = {
      supplier: f.supplier.trim(),
      poNumber: f.poNumber.trim() || null,
      totalAmount: parseFloat(f.totalAmount),
      depositAmount: parseFloat(f.depositAmount) || 0,
      currency: f.currency,
      expectedEta: f.expectedEta || null,
      notes: f.notes.trim() || null,
    };
    const result = await mutation.mutate(body);
    if (result.ok) onSuccess();
  }

  return <POFormFields f={f} set={set} errors={errors} isLoading={mutation.isLoading} apiError={mutation.error} onSubmit={handleSubmit} onCancel={onCancel} submitLabel="Create PO" showStatus={false} />;
}

// ─── Edit Purchase Order Form ─────────────────────────────────────────────────

type EditPOFormProps = {
  id: string;
  initial: Partial<POBody> & { status?: string };
  onSuccess: () => void;
  onCancel: () => void;
};

export function EditPurchaseOrderForm({ id, initial, onSuccess, onCancel }: EditPOFormProps) {
  const [f, setF] = useState<FormState>(toFormState(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const mutation = useApiMutation<POUpdateBody, unknown>(`/api/purchase-orders/${id}`, "PATCH");

  function set(key: keyof FormState, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (f.supplier !== undefined && !f.supplier.trim()) errs.supplier = "Supplier is required";
    if (f.totalAmount !== "") {
      const n = parseFloat(f.totalAmount);
      if (isNaN(n) || n < 0) errs.totalAmount = "Enter a valid amount";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    const body: POUpdateBody = {
      supplier: f.supplier.trim() || undefined,
      poNumber: f.poNumber.trim() || null,
      totalAmount: f.totalAmount ? parseFloat(f.totalAmount) : undefined,
      depositAmount: f.depositAmount ? parseFloat(f.depositAmount) : undefined,
      currency: f.currency || undefined,
      expectedEta: f.expectedEta || null,
      notes: f.notes.trim() || null,
      status: f.status || undefined,
    };
    const result = await mutation.mutate(body);
    if (result.ok) onSuccess();
  }

  return <POFormFields f={f} set={set} errors={errors} isLoading={mutation.isLoading} apiError={mutation.error} onSubmit={handleSubmit} onCancel={onCancel} submitLabel="Save Changes" showStatus />;
}

// ─── Shared field layout ──────────────────────────────────────────────────────

type POFormFieldsProps = {
  f: FormState;
  set: (key: keyof FormState, value: string) => void;
  errors: Partial<Record<keyof FormState, string>>;
  isLoading: boolean;
  apiError: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  showStatus: boolean;
};

function POFormFields({ f, set, errors, isLoading, apiError, onSubmit, onCancel, submitLabel, showStatus }: POFormFieldsProps) {
  return (
    <div className="space-y-4">
      <FormRow>
        <FormField label="Supplier" required htmlFor="supplier" error={errors.supplier}>
          <Input id="supplier" value={f.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Supplier name" error={errors.supplier} />
        </FormField>
        <FormField label="PO Number" htmlFor="poNumber">
          <Input id="poNumber" value={f.poNumber} onChange={(e) => set("poNumber", e.target.value)} placeholder="PO-001" />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Total Amount ($)" required htmlFor="totalAmount" error={errors.totalAmount}>
          <Input id="totalAmount" type="number" min="0" step="0.01" value={f.totalAmount} onChange={(e) => set("totalAmount", e.target.value)} placeholder="0.00" error={errors.totalAmount} />
        </FormField>
        <FormField label="Deposit Amount ($)" htmlFor="depositAmount">
          <Input id="depositAmount" type="number" min="0" step="0.01" value={f.depositAmount} onChange={(e) => set("depositAmount", e.target.value)} placeholder="0.00" />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Currency" htmlFor="currency">
          <Select id="currency" value={f.currency} onChange={(e) => set("currency", e.target.value)} options={[{ value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "GBP", label: "GBP" }, { value: "CNY", label: "CNY" }]} />
        </FormField>
        <FormField label="Expected ETA" htmlFor="expectedEta">
          <Input id="expectedEta" type="date" value={f.expectedEta} onChange={(e) => set("expectedEta", e.target.value)} />
        </FormField>
      </FormRow>

      {showStatus && (
        <FormField label="Status" htmlFor="status">
          <Select id="status" value={f.status ?? "DRAFT"} onChange={(e) => set("status", e.target.value)} options={STATUS_OPTIONS} />
        </FormField>
      )}

      <FormField label="Notes" htmlFor="poNotes">
        <Textarea id="poNotes" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes…" />
      </FormField>

      {apiError && <p className="text-sm text-destructive">{apiError}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" size="md" onClick={onCancel} disabled={isLoading}>Cancel</Button>
        <Button variant="primary" size="md" loading={isLoading} onClick={onSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );
}
