export type ExpenseStatus = "draft" | "needs_review" | "committed" | "archived";
export type ActorSource = "codex" | "ui" | "system";

export interface ExpenseRecord {
  id: string;
  vendorName: string;
  expenseDate: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  status: ExpenseStatus;
  confidence: number;
  source: ActorSource;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  monthExpenseTotal: number;
  monthExpenseCount: number;
  reviewCount: number;
  trend: Array<{ date: string; amount: number }>;
  recentActivity: ActivityRecord[];
}

export interface ActivityRecord {
  id: string;
  eventType: string;
  title: string;
  detail: string;
  createdAt: string;
}

export interface NavigationItem {
  id: string;
  label: string;
  route: string;
  icon: string;
  sortOrder: number;
  enabled: boolean;
}

export interface ToolEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
