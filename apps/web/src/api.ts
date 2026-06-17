import type { ActivityRecord, DashboardSummary, ExpenseRecord, NavigationItem, ToolEnvelope } from "@runory/shared";

export const API_BASE = "";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = (await response.json()) as ToolEnvelope<never>;
    throw new Error(error.error?.message ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface WorkspaceInfo {
  name: string;
  slug: string;
  runtime: string;
  realtime: string;
  url: string;
}

export const api = {
  workspace: () => getJson<WorkspaceInfo>("/api/workspace"),
  navigation: () => getJson<NavigationItem[]>("/api/navigation"),
  dashboard: () => getJson<DashboardSummary>("/api/dashboard"),
  expenses: () => getJson<ExpenseRecord[]>("/api/expenses"),
  createExpenseFromText: (text: string) => postJson<ToolEnvelope<ExpenseRecord>>("/api/tools/runory.expense.create", { text })
};

export type { ActivityRecord, DashboardSummary, ExpenseRecord, NavigationItem };
