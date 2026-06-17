import { useCallback, useEffect, useState } from "react";
import { api, type DashboardSummary, type ExpenseRecord, type NavigationItem, type WorkspaceInfo } from "../api";

const emptyDashboard: DashboardSummary = {
  monthExpenseTotal: 0,
  monthExpenseCount: 0,
  reviewCount: 0,
  trend: [],
  recentActivity: []
};

export function useRunoryData() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [navigation, setNavigation] = useState<NavigationItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary>(emptyDashboard);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [sseStatus, setSseStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [workspaceData, navigationData, dashboardData, expensesData] = await Promise.all([
      api.workspace(),
      api.navigation(),
      api.dashboard(),
      api.expenses()
    ]);
    setWorkspace(workspaceData);
    setNavigation(navigationData);
    setDashboard(dashboardData);
    setExpenses(expensesData);
  }, []);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  useEffect(() => {
    const source = new EventSource("/api/events/stream");
    source.onopen = () => setSseStatus("connected");
    source.onerror = () => setSseStatus("disconnected");
    source.addEventListener("business-event", (event) => {
      setLastEventAt(new Date().toISOString());
      refresh().catch(console.error);
      console.info("Runory business event", event.data);
    });
    return () => source.close();
  }, [refresh]);

  return {
    workspace,
    navigation,
    dashboard,
    expenses,
    sseStatus,
    lastEventAt,
    refresh
  };
}
