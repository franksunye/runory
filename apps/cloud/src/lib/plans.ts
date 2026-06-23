// ── Plan definitions for billing UI ──
//
// Phase 6 (Billing/Stripe) is not yet implemented. These definitions power the
// billing UI foundation (P1-5) so the interface is ready when Stripe lands.
// `early_access` is the only active plan; `pro` and `enterprise` are placeholders.

export type PlanId = "early_access" | "pro" | "enterprise";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  price: string;
  description: string;
  features: string[];
  limits: {
    workspaces: number;
    members: number;
    records: number;
    storageBytes: number;
    apiRequests: number;
    agentOperations: number;
  };
  active: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "early_access",
    name: "Early Access",
    price: "免费",
    description: "当前阶段免费使用，包含核心平台能力。",
    features: ["crm_lite", "extensions", "api_access", "audit_log"],
    limits: {
      workspaces: 3,
      members: 10,
      records: 50_000,
      storageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
      apiRequests: 100_000,
      agentOperations: 1_000,
    },
    active: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29/月",
    description: "适合成长型团队，提供更高额度与高级功能。（即将推出）",
    features: [
      "crm_lite",
      "extensions",
      "api_access",
      "audit_log",
      "advanced_analytics",
      "priority_support",
      "custom_roles",
    ],
    limits: {
      workspaces: 20,
      members: 50,
      records: 500_000,
      storageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
      apiRequests: 1_000_000,
      agentOperations: 10_000,
    },
    active: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "定制",
    description: "面向大型组织，提供专属支持与定制额度。（即将推出）",
    features: [
      "crm_lite",
      "extensions",
      "api_access",
      "audit_log",
      "advanced_analytics",
      "priority_support",
      "custom_roles",
      "sso",
      "dedicated_support",
      "custom_integrations",
    ],
    limits: {
      workspaces: -1, // unlimited
      members: -1,
      records: -1,
      storageBytes: -1,
      apiRequests: -1,
      agentOperations: -1,
    },
    active: false,
  },
];

export function getCurrentPlan(): PlanDefinition {
  return PLANS[0];
}

export function getPlanById(id: PlanId): PlanDefinition | undefined {
  return PLANS.find((p) => p.id === id);
}
