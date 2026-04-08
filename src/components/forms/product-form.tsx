"use client";

import { useState } from "react";
import { useApiMutation } from "@/hooks/use-api-data";
import { Button } from "@/components/shared/button";
import { FormField, FormRow, Input, Textarea, Select } from "@/components/shared/form-fields";

// ─── Create Product Form ──────────────────────────────────────────────────────

type CreateProductBody = {
  asin: string;
  sku?: string;
  fnsku?: string;
  title?: string;
  brand?: string;
  category?: string;
};

type CreateProductFormProps = {
  onSuccess: () => void;
  onCancel: () => void;
};

export function CreateProductForm({ onSuccess, onCancel }: CreateProductFormProps) {
  const [form, setForm] = useState<CreateProductBody>({ asin: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CreateProductBody, string>>>({});
  const mutation = useApiMutation<CreateProductBody, unknown>("/api/products/create", "POST");

  function set<K extends keyof CreateProductBody>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    const asin = form.asin.trim();
    if (!asin) errors.asin = "ASIN is required";
    else if (asin.length !== 10) errors.asin = "ASIN must be exactly 10 characters";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    const result = await mutation.mutate(form);
    if (result.ok) onSuccess();
  }

  return (
    <div className="space-y-4">
      <FormField label="ASIN" required htmlFor="asin" error={fieldErrors.asin}>
        <Input
          id="asin"
          value={form.asin}
          onChange={(e) => set("asin", e.target.value.toUpperCase())}
          placeholder="B08XYZ1234"
          maxLength={10}
          error={fieldErrors.asin}
        />
      </FormField>

      <FormRow>
        <FormField label="SKU" htmlFor="sku">
          <Input id="sku" value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} placeholder="MY-SKU-001" />
        </FormField>
        <FormField label="FNSKU" htmlFor="fnsku">
          <Input id="fnsku" value={form.fnsku ?? ""} onChange={(e) => set("fnsku", e.target.value)} placeholder="X001..." />
        </FormField>
      </FormRow>

      <FormField label="Title" htmlFor="title">
        <Input id="title" value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Product title" />
      </FormField>

      <FormRow>
        <FormField label="Brand" htmlFor="brand">
          <Input id="brand" value={form.brand ?? ""} onChange={(e) => set("brand", e.target.value)} placeholder="Brand name" />
        </FormField>
        <FormField label="Category" htmlFor="category">
          <Input id="category" value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Kitchen" />
        </FormField>
      </FormRow>

      {mutation.isError && (
        <p className="text-sm text-destructive">{mutation.error}</p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" size="md" onClick={onCancel} disabled={mutation.isLoading}>
          Cancel
        </Button>
        <Button variant="primary" size="md" loading={mutation.isLoading} onClick={handleSubmit}>
          Add Product
        </Button>
      </div>
    </div>
  );
}

// ─── Product Settings Form ────────────────────────────────────────────────────

type SettingsBody = {
  landedCogs?: number | null;
  freightCost?: number | null;
  prepCost?: number | null;
  overheadCost?: number | null;
  safetyStockDays?: number | null;
  productionLeadDays?: number | null;
  shippingLeadDays?: number | null;
  receivingBufferDays?: number | null;
  reorderCoverageDays?: number | null;
  reorderMinQty?: number | null;
  reorderCasePack?: number | null;
  targetMarginPct?: number | null;
  targetAcosPct?: number | null;
  targetTacosPct?: number | null;
  notes?: string | null;
};

type ProductSettingsFormProps = {
  productId: string;
  initial?: SettingsBody;
  onSuccess: () => void;
  onCancel: () => void;
};

function numField(val: string): number | null {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function intField(val: string): number | null {
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function pctField(val: string): number | null {
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  // Accept 0–100 range and normalise to 0–1
  return n > 1 ? n / 100 : n;
}

export function ProductSettingsForm({ productId, initial, onSuccess, onCancel }: ProductSettingsFormProps) {
  // Store raw string values for inputs; convert on submit
  const [f, setF] = useState({
    landedCogs: initial?.landedCogs != null ? String(initial.landedCogs) : "",
    freightCost: initial?.freightCost != null ? String(initial.freightCost) : "",
    prepCost: initial?.prepCost != null ? String(initial.prepCost) : "",
    overheadCost: initial?.overheadCost != null ? String(initial.overheadCost) : "",
    safetyStockDays: initial?.safetyStockDays != null ? String(initial.safetyStockDays) : "",
    productionLeadDays: initial?.productionLeadDays != null ? String(initial.productionLeadDays) : "",
    shippingLeadDays: initial?.shippingLeadDays != null ? String(initial.shippingLeadDays) : "",
    receivingBufferDays: initial?.receivingBufferDays != null ? String(initial.receivingBufferDays) : "",
    reorderCoverageDays: initial?.reorderCoverageDays != null ? String(initial.reorderCoverageDays) : "",
    reorderMinQty: initial?.reorderMinQty != null ? String(initial.reorderMinQty) : "",
    reorderCasePack: initial?.reorderCasePack != null ? String(initial.reorderCasePack) : "",
    targetMarginPct: initial?.targetMarginPct != null ? String(Math.round((initial.targetMarginPct) * 100)) : "",
    targetAcosPct: initial?.targetAcosPct != null ? String(Math.round((initial.targetAcosPct) * 100)) : "",
    targetTacosPct: initial?.targetTacosPct != null ? String(Math.round((initial.targetTacosPct) * 100)) : "",
    notes: initial?.notes ?? "",
  });

  const mutation = useApiMutation<SettingsBody, unknown>(`/api/products/${productId}/settings`, "PATCH");

  function setVal(key: keyof typeof f, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const body: SettingsBody = {
      landedCogs: numField(f.landedCogs),
      freightCost: numField(f.freightCost),
      prepCost: numField(f.prepCost),
      overheadCost: numField(f.overheadCost),
      safetyStockDays: intField(f.safetyStockDays),
      productionLeadDays: intField(f.productionLeadDays),
      shippingLeadDays: intField(f.shippingLeadDays),
      receivingBufferDays: intField(f.receivingBufferDays),
      reorderCoverageDays: intField(f.reorderCoverageDays),
      reorderMinQty: intField(f.reorderMinQty),
      reorderCasePack: intField(f.reorderCasePack),
      targetMarginPct: pctField(f.targetMarginPct),
      targetAcosPct: pctField(f.targetAcosPct),
      targetTacosPct: pctField(f.targetTacosPct),
      notes: f.notes || null,
    };
    const result = await mutation.mutate(body);
    if (result.ok) onSuccess();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Cost Inputs</p>
        <div className="space-y-4">
          <FormRow>
            <FormField label="Landed COGS ($)" htmlFor="landedCogs" hint="All-in cost per unit">
              <Input id="landedCogs" type="number" min="0" step="0.01" value={f.landedCogs} onChange={(e) => setVal("landedCogs", e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Freight Cost ($)" htmlFor="freightCost">
              <Input id="freightCost" type="number" min="0" step="0.01" value={f.freightCost} onChange={(e) => setVal("freightCost", e.target.value)} placeholder="0.00" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Prep Cost ($)" htmlFor="prepCost">
              <Input id="prepCost" type="number" min="0" step="0.01" value={f.prepCost} onChange={(e) => setVal("prepCost", e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Overhead Cost ($)" htmlFor="overheadCost">
              <Input id="overheadCost" type="number" min="0" step="0.01" value={f.overheadCost} onChange={(e) => setVal("overheadCost", e.target.value)} placeholder="0.00" />
            </FormField>
          </FormRow>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Lead Times (days)</p>
        <div className="space-y-4">
          <FormRow>
            <FormField label="Production Lead" htmlFor="productionLeadDays">
              <Input id="productionLeadDays" type="number" min="0" step="1" value={f.productionLeadDays} onChange={(e) => setVal("productionLeadDays", e.target.value)} placeholder="45" />
            </FormField>
            <FormField label="Shipping Lead" htmlFor="shippingLeadDays">
              <Input id="shippingLeadDays" type="number" min="0" step="1" value={f.shippingLeadDays} onChange={(e) => setVal("shippingLeadDays", e.target.value)} placeholder="21" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Receiving Buffer" htmlFor="receivingBufferDays">
              <Input id="receivingBufferDays" type="number" min="0" step="1" value={f.receivingBufferDays} onChange={(e) => setVal("receivingBufferDays", e.target.value)} placeholder="7" />
            </FormField>
            <FormField label="Safety Stock" htmlFor="safetyStockDays">
              <Input id="safetyStockDays" type="number" min="0" step="1" value={f.safetyStockDays} onChange={(e) => setVal("safetyStockDays", e.target.value)} placeholder="30" />
            </FormField>
          </FormRow>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Reorder Rules</p>
        <div className="space-y-4">
          <FormRow>
            <FormField label="Coverage Days" htmlFor="reorderCoverageDays" hint="Units to cover this many days">
              <Input id="reorderCoverageDays" type="number" min="0" step="1" value={f.reorderCoverageDays} onChange={(e) => setVal("reorderCoverageDays", e.target.value)} placeholder="90" />
            </FormField>
            <FormField label="Min Order Qty" htmlFor="reorderMinQty">
              <Input id="reorderMinQty" type="number" min="0" step="1" value={f.reorderMinQty} onChange={(e) => setVal("reorderMinQty", e.target.value)} placeholder="100" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Case Pack Size" htmlFor="reorderCasePack" hint="Round up to nearest multiple">
              <Input id="reorderCasePack" type="number" min="1" step="1" value={f.reorderCasePack} onChange={(e) => setVal("reorderCasePack", e.target.value)} placeholder="1" />
            </FormField>
          </FormRow>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Targets (%)</p>
        <div className="space-y-4">
          <FormRow>
            <FormField label="Target Margin %" htmlFor="targetMarginPct" hint="Enter as whole number e.g. 30">
              <Input id="targetMarginPct" type="number" min="0" max="100" step="1" value={f.targetMarginPct} onChange={(e) => setVal("targetMarginPct", e.target.value)} placeholder="30" />
            </FormField>
            <FormField label="Target ACOS %" htmlFor="targetAcosPct" hint="Enter as whole number e.g. 25">
              <Input id="targetAcosPct" type="number" min="0" max="100" step="1" value={f.targetAcosPct} onChange={(e) => setVal("targetAcosPct", e.target.value)} placeholder="25" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Target TACOS %" htmlFor="targetTacosPct" hint="Enter as whole number e.g. 12">
              <Input id="targetTacosPct" type="number" min="0" max="100" step="1" value={f.targetTacosPct} onChange={(e) => setVal("targetTacosPct", e.target.value)} placeholder="12" />
            </FormField>
          </FormRow>
        </div>
      </div>

      <FormField label="Notes" htmlFor="settingsNotes">
        <Textarea id="settingsNotes" value={f.notes} onChange={(e) => setVal("notes", e.target.value)} placeholder="Optional notes…" />
      </FormField>

      {mutation.isError && (
        <p className="text-sm text-destructive">{mutation.error}</p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" size="md" onClick={onCancel} disabled={mutation.isLoading}>
          Cancel
        </Button>
        <Button variant="primary" size="md" loading={mutation.isLoading} onClick={handleSubmit}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}
