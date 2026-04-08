"use client";

import { useState } from "react";
import { useApiMutation } from "@/hooks/use-api-data";
import { Button } from "@/components/shared/button";
import { FormField, FormRow, Input, Textarea, Select } from "@/components/shared/form-fields";

const FREQUENCY_OPTIONS = [
  { value: "ONE_TIME", label: "One Time" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUALLY", label: "Annually" },
];

type ExpenseBody = {
  name: string;
  category?: string | null;
  amount: number;
  currency?: string;
  frequency?: string;
  effectiveAt: string;
  endsAt?: string | null;
  vendor?: string | null;
  notes?: string | null;
};

type FormState = {
  name: string;
  category: string;
  amount: string;
  currency: string;
  frequency: string;
  effectiveAt: string;
  endsAt: string;
  vendor: string;
  notes: string;
};

function blankForm(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: "", category: "", amount: "", currency: "USD",
    frequency: "MONTHLY", effectiveAt: today, endsAt: "", vendor: "", notes: "",
  };
}

function toFormState(initial: Partial<ExpenseBody>): FormState {
  function dateStr(v: string | null | undefined) {
    return v ? new Date(v).toISOString().slice(0, 10) : "";
  }
  return {
    name: initial.name ?? "",
    category: initial.category ?? "",
    amount: initial.amount != null ? String(initial.amount) : "",
    currency: initial.currency ?? "USD",
    frequency: initial.frequency ?? "MONTHLY",
    effectiveAt: dateStr(initial.effectiveAt) || new Date().toISOString().slice(0, 10),
    endsAt: dateStr(initial.endsAt),
    vendor: initial.vendor ?? "",
    notes: initial.notes ?? "",
  };
}

function buildBody(f: FormState): ExpenseBody {
  return {
    name: f.name.trim(),
    category: f.category.trim() || null,
    amount: parseFloat(f.amount),
    currency: f.currency,
    frequency: f.frequency,
    effectiveAt: f.effectiveAt,
    endsAt: f.endsAt || null,
    vendor: f.vendor.trim() || null,
    notes: f.notes.trim() || null,
  };
}

// ─── Create Expense Form ──────────────────────────────────────────────────────

type CreateExpenseFormProps = { onSuccess: () => void; onCancel: () => void };

export function CreateExpenseForm({ onSuccess, onCancel }: CreateExpenseFormProps) {
  const [f, setF] = useState<FormState>(blankForm());
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const mutation = useApiMutation<ExpenseBody, unknown>("/api/expenses/create", "POST");

  function set(key: keyof FormState, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!f.name.trim()) errs.name = "Name is required";
    const amt = parseFloat(f.amount);
    if (isNaN(amt) || amt < 0) errs.amount = "Enter a valid amount";
    if (!f.effectiveAt) errs.effectiveAt = "Effective date is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    const result = await mutation.mutate(buildBody(f));
    if (result.ok) onSuccess();
  }

  return <ExpenseFormFields f={f} set={set} errors={errors} isLoading={mutation.isLoading} apiError={mutation.error} onSubmit={handleSubmit} onCancel={onCancel} submitLabel="Add Expense" />;
}

// ─── Edit Expense Form ────────────────────────────────────────────────────────

type EditExpenseFormProps = {
  id: string;
  initial: Partial<ExpenseBody>;
  onSuccess: () => void;
  onCancel: () => void;
};

export function EditExpenseForm({ id, initial, onSuccess, onCancel }: EditExpenseFormProps) {
  const [f, setF] = useState<FormState>(toFormState(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const mutation = useApiMutation<Partial<ExpenseBody>, unknown>(`/api/expenses/${id}`, "PATCH");

  function set(key: keyof FormState, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (f.name !== "" && !f.name.trim()) errs.name = "Name cannot be empty";
    if (f.amount !== "") {
      const n = parseFloat(f.amount);
      if (isNaN(n) || n < 0) errs.amount = "Enter a valid amount";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    const body = buildBody(f);
    const result = await mutation.mutate(body);
    if (result.ok) onSuccess();
  }

  return <ExpenseFormFields f={f} set={set} errors={errors} isLoading={mutation.isLoading} apiError={mutation.error} onSubmit={handleSubmit} onCancel={onCancel} submitLabel="Save Changes" />;
}

// ─── Shared field layout ──────────────────────────────────────────────────────

type ExpenseFormFieldsProps = {
  f: FormState;
  set: (key: keyof FormState, value: string) => void;
  errors: Partial<Record<keyof FormState, string>>;
  isLoading: boolean;
  apiError: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
};

function ExpenseFormFields({ f, set, errors, isLoading, apiError, onSubmit, onCancel, submitLabel }: ExpenseFormFieldsProps) {
  return (
    <div className="space-y-4">
      <FormField label="Name" required htmlFor="expenseName" error={errors.name}>
        <Input id="expenseName" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Software subscription" error={errors.name} />
      </FormField>

      <FormRow>
        <FormField label="Amount ($)" required htmlFor="amount" error={errors.amount}>
          <Input id="amount" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" error={errors.amount} />
        </FormField>
        <FormField label="Currency" htmlFor="expCurrency">
          <Select id="expCurrency" value={f.currency} onChange={(e) => set("currency", e.target.value)} options={[{ value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "GBP", label: "GBP" }]} />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Frequency" htmlFor="frequency">
          <Select id="frequency" value={f.frequency} onChange={(e) => set("frequency", e.target.value)} options={FREQUENCY_OPTIONS} />
        </FormField>
        <FormField label="Category" htmlFor="category">
          <Input id="category" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Software" />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Effective Date" required htmlFor="effectiveAt" error={errors.effectiveAt}>
          <Input id="effectiveAt" type="date" value={f.effectiveAt} onChange={(e) => set("effectiveAt", e.target.value)} error={errors.effectiveAt} />
        </FormField>
        <FormField label="End Date" htmlFor="endsAt" hint="Leave blank for ongoing">
          <Input id="endsAt" type="date" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
        </FormField>
      </FormRow>

      <FormField label="Vendor" htmlFor="vendor">
        <Input id="vendor" value={f.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="Vendor name" />
      </FormField>

      <FormField label="Notes" htmlFor="expNotes">
        <Textarea id="expNotes" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes…" />
      </FormField>

      {apiError && <p className="text-sm text-destructive">{apiError}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" size="md" onClick={onCancel} disabled={isLoading}>Cancel</Button>
        <Button variant="primary" size="md" loading={isLoading} onClick={onSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );
}
