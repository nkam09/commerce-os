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
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { CreateExpenseForm } from "@/components/forms/expense-form";
import { EditExpenseForm } from "@/components/forms/edit-forms";
import type { ExpensesPagePayload } from "@/lib/services/page-payload-service";

type Expense = ExpensesPagePayload["expenses"][number];

const FREQ_LABEL: Record<string, string> = {
  ONE_TIME: "One Time", WEEKLY: "Weekly", MONTHLY: "Monthly",
  QUARTERLY: "Quarterly", ANNUALLY: "Annually",
};

export function ExpensesPage() {
  const { data, isLoading, isError, error, refetch } =
    useApiData<ExpensesPagePayload>("/api/pages/expenses");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Expense | null>(null);

  const archiveMutation = useApiMutation<Record<string, never>, unknown>(
    archiveTarget ? `/api/expenses/${archiveTarget.id}/archive` : "",
    "POST"
  );

  async function handleArchive() {
    if (!archiveTarget) return;
    const result = await archiveMutation.mutate({});
    if (result.ok) { setArchiveTarget(null); refetch(); }
  }

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (e: Expense) => (
        <div>
          <p className="text-sm font-medium">{e.name}</p>
          {e.vendor && <p className="text-xs text-muted-foreground">{e.vendor}</p>}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (e: Expense) => (
        <span className="text-sm text-muted-foreground">{e.category ?? "—"}</span>
      ),
    },
    {
      key: "frequency",
      header: "Frequency",
      render: (e: Expense) => (
        <StatusBadge label={FREQ_LABEL[e.frequency] ?? e.frequency} variant="muted" />
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (e: Expense) => (
        <span className="tabular-nums text-sm font-medium">{formatCurrency(e.amount)}</span>
      ),
    },
    {
      key: "effective",
      header: "Effective",
      render: (e: Expense) => (
        <span className="text-sm text-muted-foreground">{formatDate(e.effectiveAt)}</span>
      ),
    },
    {
      key: "ends",
      header: "Ends",
      render: (e: Expense) => (
        <span className="text-sm text-muted-foreground">{formatDate(e.endsAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (e: Expense) => (
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={(ev) => { ev.stopPropagation(); setEditTarget(e); }}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={(ev) => { ev.stopPropagation(); setArchiveTarget(e); }} className="text-destructive hover:text-destructive">Archive</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <AppTopbar
        title="Expenses"
        actions={<Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>+ Add Expense</Button>}
      />
      <main className="flex-1 overflow-y-auto p-6">
        {isLoading && <PageLoading />}
        {isError && <PageError message={error ?? undefined} onRetry={refetch} />}
        {data && data.expenses.length === 0 && (
          <EmptyState title="No expenses" description="Track recurring and one-time operating expenses." action={<button onClick={() => setCreateOpen(true)} className="text-sm font-medium text-primary hover:underline">+ Add Expense</button>} />
        )}
        {data && data.expenses.length > 0 && (
          <DataTable columns={columns} rows={data.expenses} getKey={(e) => e.id} />
        )}
      </main>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add Expense">
        <CreateExpenseForm onSuccess={() => { setCreateOpen(false); refetch(); }} onCancel={() => setCreateOpen(false)} />
      </Dialog>

      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Expense">
        {editTarget && (
          <EditExpenseForm
            id={editTarget.id}
            initial={{
              name: editTarget.name,
              category: editTarget.category,
              amount: editTarget.amount,
              currency: editTarget.currency,
              frequency: editTarget.frequency,
              effectiveAt: editTarget.effectiveAt,
              endsAt: editTarget.endsAt,
              vendor: editTarget.vendor,
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
        title="Archive expense?"
        description={archiveTarget ? `"${archiveTarget.name}" will be removed from all expense reports.` : ""}
        confirmLabel="Archive"
        destructive
        loading={archiveMutation.isLoading}
      />
    </>
  );
}
