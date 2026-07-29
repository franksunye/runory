// ── Plan definitions for billing UI ──
//
// Server-owned commercial catalog. Stripe Price IDs are configured separately
// and never accepted from the browser.

import { BILLING_PLAN_QUOTAS } from "@runory/platform-core";

export type PlanId = "early_access" | "starter" | "growth" | "pro" | "enterprise";

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
  selfServe: boolean;
  includedMinutes: number | null;
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
    selfServe: false,
    includedMinutes: null,
  },
  {
    id: "starter",
    name: "Starter",
    price: "$449/month",
    description: "For small service teams establishing one dependable operating loop.",
    features: ["crm_lite", "extensions", "api_access", "audit_log", "voice_intake"],
    limits: {
      workspaces: BILLING_PLAN_QUOTAS.starter.workspaces,
      members: BILLING_PLAN_QUOTAS.starter.members,
      records: BILLING_PLAN_QUOTAS.starter.records,
      storageBytes: BILLING_PLAN_QUOTAS.starter.storage_bytes,
      apiRequests: BILLING_PLAN_QUOTAS.starter.api_requests,
      agentOperations: BILLING_PLAN_QUOTAS.starter.agent_operations,
    },
    active: true,
    selfServe: true,
    includedMinutes: 1_000,
  },
  {
    id: "growth",
    name: "Growth",
    price: "$999/month",
    description: "For growing service businesses running a connected CRM, Sales, and FSM operation.",
    features: ["crm_lite", "extensions", "api_access", "audit_log", "voice_intake", "advanced_analytics", "priority_onboarding"],
    limits: {
      workspaces: BILLING_PLAN_QUOTAS.growth.workspaces,
      members: BILLING_PLAN_QUOTAS.growth.members,
      records: BILLING_PLAN_QUOTAS.growth.records,
      storageBytes: BILLING_PLAN_QUOTAS.growth.storage_bytes,
      apiRequests: BILLING_PLAN_QUOTAS.growth.api_requests,
      agentOperations: BILLING_PLAN_QUOTAS.growth.agent_operations,
    },
    active: true,
    selfServe: true,
    includedMinutes: 3_000,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$2,499/month",
    description: "For multi-team, multi-location, or multi-service operations.",
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
      workspaces: BILLING_PLAN_QUOTAS.pro.workspaces,
      members: BILLING_PLAN_QUOTAS.pro.members,
      records: BILLING_PLAN_QUOTAS.pro.records,
      storageBytes: BILLING_PLAN_QUOTAS.pro.storage_bytes,
      apiRequests: BILLING_PLAN_QUOTAS.pro.api_requests,
      agentOperations: BILLING_PLAN_QUOTAS.pro.agent_operations,
    },
    active: true,
    selfServe: true,
    includedMinutes: 8_000,
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
    selfServe: false,
    includedMinutes: null,
  },
];

export function getCurrentPlan(): PlanDefinition {
  return PLANS[0];
}

export function getPlanById(id: PlanId): PlanDefinition | undefined {
  return PLANS.find((p) => p.id === id);
}
