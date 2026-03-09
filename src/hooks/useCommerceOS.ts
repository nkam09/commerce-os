"use client";

import { useState, useEffect, useCallback } from "react";

const MARKETPLACE_ID = process.env.NEXT_PUBLIC_MARKETPLACE_ID ?? "REPLACE_WITH_MARKETPLACE_ID";
const STARTING_CASH  = process.env.NEXT_PUBLIC_STARTING_CASH  ?? "48000";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json();
}

function useApiGet<T>(url: string, deps: unknown[] = []) {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<T>(url);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { refetch(); }, [refetch, ...deps]);

  return { data, loading, error, refetch };
}

export type Period = "TODAY" | "YESTERDAY" | "7D" | "30D" | "MTD" | "LAST_MONTH" | "60D";

export function useOverview(period: Period = "MTD") {
  return useApiGet(
    `/api/dashboard/overview?marketplaceId=${MARKETPLACE_ID}&period=${period}`,
    [period]
  );
}

export function useProfit(period: Period = "MTD") {
  return useApiGet(
    `/api/dashboard/profit?marketplaceId=${MARKETPLACE_ID}&period=${period}`,
    [period]
  );
}

export function useInventory() {
  return useApiGet(`/api/dashboard/inventory?marketplaceId=${MARKETPLACE_ID}`);
}

export function useCashFlow() {
  return useApiGet(
    `/api/dashboard/cashflow?startingCash=${STARTING_CASH}&months=6`
  );
}

export function useProducts() {
  return useApiGet("/api/products");
}

export async function updateProductSettings(productId: string, settings: Record<string, unknown>) {
  return apiFetch(`/api/products/${productId}/settings`, {
    method: "PATCH",
    body:   JSON.stringify(settings),
  });
}

export function usePurchaseOrders() {
  return useApiGet("/api/purchase-orders");
}

export async function createPurchaseOrder(data: Record<string, unknown>) {
  return apiFetch("/api/purchase-orders", {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

export async function updatePurchaseOrder(id: string, data: Record<string, unknown>) {
  return apiFetch(`/api/purchase-orders/${id}`, {
    method: "PATCH",
    body:   JSON.stringify(data),
  });
}

export function useShipments() {
  return useApiGet("/api/shipments");
}

export async function updateShipmentStage(id: string, stage: string) {
  return apiFetch(`/api/shipments/${id}`, {
    method: "PATCH",
    body:   JSON.stringify({ stage }),
  });
}

export function useReimbursements() {
  return useApiGet("/api/reimbursements");
}

export async function updateReimbursement(id: string, data: Record<string, unknown>) {
  return apiFetch(`/api/reimbursements/${id}`, {
    method: "PATCH",
    body:   JSON.stringify(data),
  });
}

export function useExpenses() {
  return useApiGet("/api/expenses");
}

export async function createExpense(data: Record<string, unknown>) {
  return apiFetch("/api/expenses", {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

export function useProjects() {
  return useApiGet("/api/projects");
}

export async function createProject(data: Record<string, unknown>) {
  return apiFetch("/api/projects", {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

export function useTasks(projectId?: string) {
  const qs = projectId ? `?projectId=${projectId}` : "";
  return useApiGet(`/api/tasks${qs}`, [projectId]);
}

export async function updateTask(id: string, data: Record<string, unknown>) {
  return apiFetch(`/api/tasks/${id}`, {
    method: "PATCH",
    body:   JSON.stringify(data),
  });
}

export function useAiInsights() {
  return useApiGet("/api/ai/insights");
}

export async function dismissInsight(id: string) {
  return apiFetch("/api/ai/insights", {
    method: "PATCH",
    body:   JSON.stringify({ id, status: "DISMISSED" }),
  });
}

export async function markInsightActedOn(id: string) {
  return apiFetch("/api/ai/insights", {
    method: "PATCH",
    body:   JSON.stringify({ id, status: "ACTED_ON" }),
  });
}

export async function generateDailySummary() {
  return apiFetch("/api/ai/daily-summary", {
    method: "POST",
    body:   JSON.stringify({ marketplaceId: MARKETPLACE_ID, startingCash: parseFloat(STARTING_CASH) }),
  });
}

export async function askAI(question: string): Promise<{ answer: string }> {
  return apiFetch("/api/ai/ask", {
    method: "POST",
    body:   JSON.stringify({
      question,
      marketplaceId: MARKETPLACE_ID,
      startingCash:  parseFloat(STARTING_CASH),
    }),
  });
}