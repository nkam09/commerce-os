"use client";
import ReactDOM from "react-dom";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useApiData } from "@/hooks/use-api-data";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import { AIInsightBanner } from "@/components/pages/dashboard/ai-insight-banner";
import type { ExpensesPageData, ExpenseRow } from "@/lib/services/expenses-service";

// ─── Types ───────────────────────────────────────────────────────────────────

type ExpenseFormData = {
  name: string;
  amount: string;
  type: "monthly" | "one-time" | "custom";
  date: string;
  category: string;
  isAdCost: boolean;
  productId: string;
  marketplace: string;
};

const EMPTY_FORM: ExpenseFormData = {
  name: "",
  amount: "",
  type: "monthly",
  date: new Date().toISOString().slice(0, 10),
  category: "",
  isAdCost: false,
  productId: "",
  marketplace: "Amazon US",
};

type TypeFilter = "all" | "monthly" | "one-time" | "custom";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateMMDDYYYY(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function getMonthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(iso: string): string {
  const d = new Date(iso);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

type MonthGroup = {
  key: string;
  label: string;
  expenses: ExpenseRow[];
  total: number;
};

function groupByMonth(expenses: ExpenseRow[]): MonthGroup[] {
  const sorted = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const map = new Map<string, ExpenseRow[]>();
  for (const e of sorted) {
    const key = getMonthKey(e.date);
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }

  const groups: MonthGroup[] = [];
  for (const [key, items] of map) {
    groups.push({
      key,
      label: getMonthLabel(items[0].date),
      expenses: items,
      total: items.reduce((s, e) => s + e.amount, 0),
    });
  }

  return groups.sort((a, b) => b.key.localeCompare(a.key));
}

// ─── Type Badge ──────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ExpenseRow["type"] }) {
  const styles: Record<ExpenseRow["type"], string> = {
    monthly: "bg-blue-500/20 text-blue-400",
    "one-time": "bg-zinc-500/20 text-zinc-400",
    custom: "bg-yellow-500/20 text-yellow-400",
  };
  const labels: Record<ExpenseRow["type"], string> = {
    monthly: "Monthly",
    "one-time": "One-time",
    custom: "Custom",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold",
        styles[type]
      )}
    >
      {labels[type]}
    </span>
  );
}

// ─── Three-dot Menu ──────────────────────────────────────────────────────────

function RowMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right - 128 });
    }
    setOpen((v) => !v);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="rounded p-1 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
      >
        &#x22EF;
      </button>
      {open &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] w-32 rounded-md border border-border bg-card shadow-lg py-1"
            style={{ top: pos.top, left: pos.left }}
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-elevated transition"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
            >
              Edit
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-elevated transition"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
            >
              Delete
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDelete({
  open,
  name,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl">
        <h2 className="text-sm font-semibold text-foreground mb-2">Delete expense?</h2>
        <p className="text-xs text-muted-foreground mb-4">
          &ldquo;{name}&rdquo; will be permanently removed.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Expense Form ────────────────────────────────────────────────────────────

function ExpenseForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ExpenseFormData;
  onSave: (data: ExpenseFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ExpenseFormData>(initial);

  const labelClass = "block text-2xs font-medium text-muted-foreground mb-1";
  const inputClass =
    "w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="space-y-3"
    >
      <div>
        <label className={labelClass}>Name</label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputClass}
          placeholder="e.g. Helium 10"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Amount ($)</label>
          <input
            type="number"
            required
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className={inputClass}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select
            value={form.type}
            onChange={(e) =>
              setForm({
                ...form,
                type: e.target.value as ExpenseFormData["type"],
              })
            }
            className={inputClass}
          >
            <option value="monthly">Monthly</option>
            <option value="one-time">One-time</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Start Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <input
            type="text"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={inputClass}
            placeholder="e.g. Software"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Marketplace</label>
        <select
          value={form.marketplace}
          onChange={(e) => setForm({ ...form, marketplace: e.target.value })}
          className={inputClass}
        >
          <option value="Amazon US">Amazon US</option>
          <option value="Amazon CA">Amazon CA</option>
          <option value="Amazon UK">Amazon UK</option>
          <option value="Amazon DE">Amazon DE</option>
          <option value="Shopify">Shopify</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>Product (optional)</label>
        <select
          value={form.productId}
          onChange={(e) => setForm({ ...form, productId: e.target.value })}
          className={inputClass}
        >
          <option value="">None</option>
          <option value="prod-1">Garlic Press – Premium Stainless Steel</option>
          <option value="prod-2">Silicone Kitchen Utensil Set (12-Piece)</option>
          <option value="prod-3">Bamboo Cutting Board Set (3-Pack)</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isAdCost"
          checked={form.isAdCost}
          onChange={(e) => setForm({ ...form, isAdCost: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-border"
        />
        <label htmlFor="isAdCost" className="text-xs text-foreground">
          Is Advertising Cost
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
        >
          Save
        </button>
      </div>
    </form>
  );
}

// ─── Skeleton Loader ─────────────────────────────────────────────────────────

function ExpensesSkeleton() {
  const rows = Array.from({ length: 8 }, (_, i) => i);
  return (
    <div className="rounded-lg border border-border bg-card">
      <div>
        <table className="w-full">
          <thead>
            <tr className="bg-elevated/50">
              {Array.from({ length: 8 }, (_, i) => (
                <th key={i} className="px-3 py-2">
                  <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i} className="border-t border-border">
                {Array.from({ length: 8 }, (_, j) => (
                  <td key={j} className="px-3 py-2.5">
                    <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

type ExpensesPageProps = {
  initialData?: ExpensesPageData;
};

export function ExpensesPage({ initialData }: ExpensesPageProps) {
  const apiUrl = initialData ? null : "/api/pages/expenses";
  const { data: apiData, isLoading, isError, error, refetch } =
    useApiData<ExpensesPageData>(apiUrl);

  const data = initialData ?? apiData;

  // ── Local state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);

  // ── Local expenses (for add/edit/delete without real API) ────────────────
  const [localExpenses, setLocalExpenses] = useState<ExpenseRow[] | null>(null);

  const expenses = localExpenses ?? data?.expenses ?? [];

  // Sync local state when data first arrives
  useEffect(() => {
    if (data && !localExpenses) {
      setLocalExpenses(data.expenses);
    }
  }, [data, localExpenses]);

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = expenses;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (typeFilter !== "all") {
      result = result.filter((e) => e.type === typeFilter);
    }
    if (categoryFilter !== "all") {
      result = result.filter((e) => e.category === categoryFilter);
    }
    if (marketplaceFilter !== "all") {
      result = result.filter((e) => e.marketplace === marketplaceFilter);
    }
    return result;
  }, [expenses, search, typeFilter, categoryFilter, marketplaceFilter]);

  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const e of expenses) {
      if (e.category) cats.add(e.category);
    }
    return Array.from(cats).sort();
  }, [expenses]);

  const marketplaces = useMemo(() => {
    const mps = new Set<string>();
    for (const e of expenses) {
      mps.add(e.marketplace);
    }
    return Array.from(mps).sort();
  }, [expenses]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAdd = useCallback(
    (form: ExpenseFormData) => {
      const newExpense: ExpenseRow = {
        id: `exp-${Date.now()}`,
        date: new Date(form.date).toISOString(),
        type: form.type,
        name: form.name,
        category: form.category || null,
        isAdCost: form.isAdCost,
        productId: form.productId || null,
        productTitle: null,
        marketplace: form.marketplace,
        amount: parseFloat(form.amount) || 0,
      };
      setLocalExpenses((prev) => [...(prev ?? []), newExpense]);
      setAddOpen(false);
    },
    []
  );

  const handleEdit = useCallback(
    (form: ExpenseFormData) => {
      if (!editTarget) return;
      setLocalExpenses((prev) =>
        (prev ?? []).map((e) =>
          e.id === editTarget.id
            ? {
                ...e,
                name: form.name,
                amount: parseFloat(form.amount) || 0,
                type: form.type,
                date: new Date(form.date).toISOString(),
                category: form.category || null,
                isAdCost: form.isAdCost,
                productId: form.productId || null,
                marketplace: form.marketplace,
              }
            : e
        )
      );
      setEditTarget(null);
    },
    [editTarget]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/expenses/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        console.error("[expenses] delete failed:", json.error ?? res.statusText);
        alert(`Failed to delete expense: ${json.error ?? "Unknown error"}`);
        return;
      }
      setLocalExpenses((prev) =>
        (prev ?? []).filter((e) => e.id !== deleteTarget.id)
      );
    } catch (err) {
      console.error("[expenses] delete error:", err);
      alert("Failed to delete expense. Please try again.");
    }
    setDeleteTarget(null);
  }, [deleteTarget]);

  // ── Table classes (matching campaign-table.tsx) ──────────────────────────
  const thClass =
    "px-3 py-2 text-left text-2xs font-medium text-muted-foreground whitespace-nowrap select-none";
  const tdClass = "px-3 py-2 text-xs whitespace-nowrap";

  const selectClass =
    "rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary";

  // ── Render ───────────────────────────────────────────────────────────────

  // Loading state
  if (!initialData && isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-16 rounded-lg bg-muted animate-pulse" />
        <ExpensesSkeleton />
      </div>
    );
  }

  // Error state
  if (!initialData && isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            {error ?? "Failed to load expenses"}
          </p>
          <button
            type="button"
            onClick={refetch}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (data && expenses.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm font-medium text-foreground mb-1">No expenses</p>
          <p className="text-xs text-muted-foreground mb-4">
            Track recurring and one-time operating expenses.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
          >
            + Add Expense
          </button>
          <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Expense">
            <ExpenseForm
              initial={EMPTY_FORM}
              onSave={handleAdd}
              onCancel={() => setAddOpen(false)}
            />
          </Modal>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* AI Insight Banner */}
      <AIInsightBanner
        message={`Your monthly recurring expenses total ${formatCurrency(data?.totalMonthly ?? 0)}. ${expenses.length} expense${expenses.length !== 1 ? "s" : ""} tracked across ${categories.length} categor${categories.length !== 1 ? "ies" : "y"}.`}
      />

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <input
          type="text"
          placeholder="Search expenses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary w-48"
        />

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className={selectClass}
        >
          <option value="all">All Types</option>
          <option value="monthly">Monthly</option>
          <option value="one-time">One-time</option>
          <option value="custom">Custom</option>
        </select>

        {/* Marketplace filter */}
        <select
          value={marketplaceFilter}
          onChange={(e) => setMarketplaceFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">All Marketplaces</option>
          {marketplaces.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add Expense button */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
        >
          + Add Expense
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-elevated/50">
                <th className={thClass}>Date</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Name</th>
                <th className={thClass}>Category</th>
                <th className={thClass}>Ad Cost</th>
                <th className={thClass}>Product</th>
                <th className={thClass}>Marketplace</th>
                <th className={cn(thClass, "text-right")}>Amount</th>
                <th className={cn(thClass, "w-10")} />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => [
                // Month header row
                <tr key={`header-${group.key}`} className="bg-elevated/30">
                  <td
                    colSpan={9}
                    className="px-3 py-1.5 text-2xs font-semibold text-foreground"
                  >
                    {group.label}
                  </td>
                </tr>,
                // Expense rows
                ...group.expenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className="border-t border-border hover:bg-elevated/20"
                  >
                    <td className={cn(tdClass, "tabular-nums text-muted-foreground")}>
                      {formatDateMMDDYYYY(expense.date)}
                    </td>
                    <td className={tdClass}>
                      <TypeBadge type={expense.type} />
                    </td>
                    <td className={cn(tdClass, "font-medium text-foreground")}>
                      {expense.name}
                    </td>
                    <td className={cn(tdClass, "text-muted-foreground")}>
                      {expense.category ?? "—"}
                    </td>
                    <td className={tdClass}>
                      {expense.isAdCost ? (
                        <svg
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="h-3.5 w-3.5 text-green-400"
                        >
                          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                        </svg>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={cn(tdClass, "text-muted-foreground max-w-[180px] truncate")}>
                      {expense.productTitle ?? "—"}
                    </td>
                    <td className={cn(tdClass, "text-muted-foreground")}>
                      {expense.marketplace}
                    </td>
                    <td className={cn(tdClass, "text-right tabular-nums font-medium text-foreground")}>
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className={tdClass}>
                      <RowMenu
                        onEdit={() => setEditTarget(expense)}
                        onDelete={() => setDeleteTarget(expense)}
                      />
                    </td>
                  </tr>
                )),
                // Totals row
                <tr
                  key={`total-${group.key}`}
                  className="border-t border-border/50 bg-elevated/10"
                >
                  <td colSpan={7} className="px-3 py-1.5 text-2xs font-semibold text-muted-foreground text-right">
                    Total {group.label}:
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs tabular-nums font-bold text-foreground">
                    {formatCurrency(group.total)}
                  </td>
                  <td />
                </tr>,
              ])}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">
                    No expenses match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border text-2xs text-muted-foreground">
          <span>{filtered.length} expense{filtered.length !== 1 ? "s" : ""}</span>
          <span>
            Total:{" "}
            <span className="tabular-nums text-foreground">
              {formatCurrency(filtered.reduce((s, e) => s + e.amount, 0))}
            </span>
          </span>
        </div>
      </div>

      {/* Add Expense Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Expense">
        <ExpenseForm
          initial={EMPTY_FORM}
          onSave={handleAdd}
          onCancel={() => setAddOpen(false)}
        />
      </Modal>

      {/* Edit Expense Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Expense"
      >
        {editTarget && (
          <ExpenseForm
            initial={{
              name: editTarget.name,
              amount: String(editTarget.amount),
              type: editTarget.type,
              date: editTarget.date.slice(0, 10),
              category: editTarget.category ?? "",
              isAdCost: editTarget.isAdCost,
              productId: editTarget.productId ?? "",
              marketplace: editTarget.marketplace,
            }}
            onSave={handleEdit}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDelete
        open={!!deleteTarget}
        name={deleteTarget?.name ?? ""}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
