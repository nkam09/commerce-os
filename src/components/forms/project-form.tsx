"use client";

import { useState } from "react";
import { useApiMutation } from "@/hooks/use-api-data";
import { Button } from "@/components/shared/button";
import { FormField, FormRow, Input, Textarea, Select } from "@/components/shared/form-fields";

const STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETE", label: "Complete" },
];

type ProjectBody = {
  title: string;
  description?: string | null;
  status?: string;
  owner?: string | null;
  dueDate?: string | null;
  priority?: number;
  notes?: string | null;
};

type FormState = {
  title: string;
  description: string;
  status: string;
  owner: string;
  dueDate: string;
  priority: string;
  notes: string;
};

function blankForm(): FormState {
  return {
    title: "", description: "", status: "BACKLOG",
    owner: "", dueDate: "", priority: "0", notes: "",
  };
}

function toFormState(initial: Partial<ProjectBody>): FormState {
  return {
    title: initial.title ?? "",
    description: initial.description ?? "",
    status: initial.status ?? "BACKLOG",
    owner: initial.owner ?? "",
    dueDate: initial.dueDate ? new Date(initial.dueDate).toISOString().slice(0, 10) : "",
    priority: initial.priority != null ? String(initial.priority) : "0",
    notes: initial.notes ?? "",
  };
}

function buildBody(f: FormState): ProjectBody {
  return {
    title: f.title.trim(),
    description: f.description.trim() || null,
    status: f.status,
    owner: f.owner.trim() || null,
    dueDate: f.dueDate || null,
    priority: parseInt(f.priority, 10) || 0,
    notes: f.notes.trim() || null,
  };
}

// ─── Create Project Form ──────────────────────────────────────────────────────

type CreateProjectFormProps = { onSuccess: () => void; onCancel: () => void };

export function CreateProjectForm({ onSuccess, onCancel }: CreateProjectFormProps) {
  const [f, setF] = useState<FormState>(blankForm());
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const mutation = useApiMutation<ProjectBody, unknown>("/api/projects/create", "POST");

  function set(key: keyof FormState, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!f.title.trim()) errs.title = "Title is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    const result = await mutation.mutate(buildBody(f));
    if (result.ok) onSuccess();
  }

  return <ProjectFormFields f={f} set={set} errors={errors} isLoading={mutation.isLoading} apiError={mutation.error} onSubmit={handleSubmit} onCancel={onCancel} submitLabel="Create Project" />;
}

// ─── Edit Project Form ────────────────────────────────────────────────────────

type EditProjectFormProps = {
  id: string;
  initial: Partial<ProjectBody>;
  onSuccess: () => void;
  onCancel: () => void;
};

export function EditProjectForm({ id, initial, onSuccess, onCancel }: EditProjectFormProps) {
  const [f, setF] = useState<FormState>(toFormState(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const mutation = useApiMutation<Partial<ProjectBody>, unknown>(`/api/projects/${id}`, "PATCH");

  function set(key: keyof FormState, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (f.title !== "" && !f.title.trim()) errs.title = "Title cannot be empty";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    const result = await mutation.mutate(buildBody(f));
    if (result.ok) onSuccess();
  }

  return <ProjectFormFields f={f} set={set} errors={errors} isLoading={mutation.isLoading} apiError={mutation.error} onSubmit={handleSubmit} onCancel={onCancel} submitLabel="Save Changes" />;
}

// ─── Shared field layout ──────────────────────────────────────────────────────

type ProjectFormFieldsProps = {
  f: FormState;
  set: (key: keyof FormState, value: string) => void;
  errors: Partial<Record<keyof FormState, string>>;
  isLoading: boolean;
  apiError: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
};

function ProjectFormFields({ f, set, errors, isLoading, apiError, onSubmit, onCancel, submitLabel }: ProjectFormFieldsProps) {
  return (
    <div className="space-y-4">
      <FormField label="Title" required htmlFor="projectTitle" error={errors.title}>
        <Input id="projectTitle" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Project title" error={errors.title} />
      </FormField>

      <FormField label="Description" htmlFor="projectDesc">
        <Textarea id="projectDesc" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What is this project about?" />
      </FormField>

      <FormRow>
        <FormField label="Status" htmlFor="projectStatus">
          <Select id="projectStatus" value={f.status} onChange={(e) => set("status", e.target.value)} options={STATUS_OPTIONS} />
        </FormField>
        <FormField label="Owner" htmlFor="owner">
          <Input id="owner" value={f.owner} onChange={(e) => set("owner", e.target.value)} placeholder="Assignee name" />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField label="Due Date" htmlFor="dueDate">
          <Input id="dueDate" type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </FormField>
        <FormField label="Priority" htmlFor="priority" hint="Lower number = higher priority">
          <Input id="priority" type="number" min="0" step="1" value={f.priority} onChange={(e) => set("priority", e.target.value)} placeholder="0" />
        </FormField>
      </FormRow>

      <FormField label="Notes" htmlFor="projNotes">
        <Textarea id="projNotes" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes…" />
      </FormField>

      {apiError && <p className="text-sm text-destructive">{apiError}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" size="md" onClick={onCancel} disabled={isLoading}>Cancel</Button>
        <Button variant="primary" size="md" loading={isLoading} onClick={onSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );
}
