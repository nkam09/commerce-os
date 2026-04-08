// ─── Expenses Service ────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import { toNum, round } from "@/lib/utils/math";

// ─── Types (unchanged) ──────────────────────────────────────────────────────

export type ExpenseRow = {
  id: string;
  date: string; // ISO date
  type: "monthly" | "one-time" | "custom";
  name: string;
  category: string | null;
  isAdCost: boolean;
  productId: string | null;
  productTitle: string | null;
  marketplace: string;
  amount: number;
};

export type ExpensesPageData = {
  expenses: ExpenseRow[];
  totalMonthly: number;
  categories: string[];
};

// ─── Frequency → front-end type mapping ──────────────────────────────────────

function frequencyToType(
  freq: "ONE_TIME" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY"
): ExpenseRow["type"] {
  switch (freq) {
    case "MONTHLY":
      return "monthly";
    case "ONE_TIME":
      return "one-time";
    default:
      // WEEKLY, QUARTERLY, ANNUALLY all map to "custom"
      return "custom";
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUniqueMonthlyTotal(expenses: ExpenseRow[]): number {
  const seen = new Map<string, number>();
  for (const e of expenses) {
    if (e.type === "monthly" && !seen.has(e.name)) {
      seen.set(e.name, e.amount);
    }
  }
  let total = 0;
  for (const amount of seen.values()) {
    total += amount;
  }
  return round(total, 2);
}

function getCategories(expenses: ExpenseRow[]): string[] {
  const cats = new Set<string>();
  for (const e of expenses) {
    if (e.category) cats.add(e.category);
  }
  return Array.from(cats).sort();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getExpensesPageData(
  userId: string
): Promise<ExpensesPageData> {
  const rows = await prisma.expense.findMany({
    where: { userId, archivedAt: null },
    orderBy: { effectiveAt: "desc" },
  });

  const expenses: ExpenseRow[] = rows.map((r) => ({
    id: r.id,
    date: r.effectiveAt.toISOString(),
    type: frequencyToType(r.frequency),
    name: r.name,
    category: r.category,
    isAdCost: (r.category ?? "").toLowerCase().includes("ppc") ||
              (r.category ?? "").toLowerCase().includes("ad"),
    productId: null,
    productTitle: null,
    marketplace: r.vendor ?? "Amazon US",
    amount: toNum(r.amount),
  }));

  return {
    expenses,
    totalMonthly: getUniqueMonthlyTotal(expenses),
    categories: getCategories(expenses),
  };
}

export function getExpensesPageDataSync(): ExpensesPageData {
  // Sync fallback returns empty data — callers should prefer the async version
  return {
    expenses: [],
    totalMonthly: 0,
    categories: [],
  };
}
