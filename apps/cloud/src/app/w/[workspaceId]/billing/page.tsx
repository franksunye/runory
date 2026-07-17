"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  CreditCard,
  HardDrive,
  KeyRound,
  Loader2,
  Package,
  RefreshCw,
  ScrollText,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch, apiPost } from "@/lib/api-fetch";

interface UsageItem {
  metric: string;
  current: number;
  limit: number;
  type: string;
  remaining: number;
}

interface BillingData {
  plan: string;
  status: string;
  entitlements: {
    plan: string;
    status: string;
    quotas: Record<string, number>;
  } | null;
  usage: UsageItem[];
  features: string[];
  subscription: {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null;
  hasBillingCustomer: boolean;
  canManageBilling: boolean;
  selfServePlans: Array<{ id: string; name: string; price: string }>;
  billingHistory: unknown[];
}

const FEATURE_LABELS: Record<string, { labelKey?: MessageKey; icon: typeof Package }> = {
  crm_lite: { labelKey: "billing.feature.crmLite", icon: Package },
  extensions: { labelKey: "billing.feature.extensions", icon: Zap },
  api_access: { labelKey: "billing.feature.apiAccess", icon: KeyRound },
  audit_log: { labelKey: "billing.feature.auditLog", icon: ScrollText },
};

const METRIC_LABELS: Record<string, { labelKey?: MessageKey; icon: typeof Users; format: (v: number) => string }> = {
  records: { labelKey: "billing.metric.records", icon: HardDrive, format: (v) => v.toLocaleString() },
  workspaces: { labelKey: "billing.metric.workspaces", icon: Package, format: (v) => v.toLocaleString() },
  members: { labelKey: "billing.metric.members", icon: Users, format: (v) => v.toLocaleString() },
  api_requests: { labelKey: "billing.metric.apiRequests", icon: KeyRound, format: (v) => v.toLocaleString() },
  agent_operations: { labelKey: "billing.metric.agentOperations", icon: Zap, format: (v) => v.toLocaleString() },
  storage_bytes: {
    labelKey: "billing.metric.storageBytes",
    icon: HardDrive,
    format: (v) => {
      if (v <= 0) return "0 B";
      const gb = v / (1024 * 1024 * 1024);
      if (gb >= 1) return `${gb.toFixed(1)} GB`;
      const mb = v / (1024 * 1024);
      return `${mb.toFixed(0)} MB`;
    },
  },
};

const METRIC_ORDER = ["records", "workspaces", "members", "api_requests", "agent_operations", "storage_bytes"];

export default function BillingPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const { t } = useI18n();

  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [billingAction, setBillingAction] = useState<"checkout" | "portal" | null>(null);

  const loadBilling = useCallback(async () => {
    try {
      setError(null);
      // Resolve organizationId from the workspace context
      const wsJson = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: { organizationId?: string };
      }>(`/api/workspaces/${workspaceId}`);
      if (!wsJson.success || !wsJson.data?.organizationId) {
        throw new Error(wsJson.error?.message ?? t("billing.orgInfoFailed"));
      }
      const orgId = wsJson.data.organizationId as string;
      setOrganizationId(orgId);

      const billingJson = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: BillingData;
      }>(`/api/organizations/${orgId}/billing`);
      if (!billingJson.success) {
        throw new Error(billingJson.error?.message ?? t("billing.loadFailed"));
      }
      setData(billingJson.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const startCheckout = async () => {
    if (!organizationId) return;
    setBillingAction("checkout");
    setError(null);
    try {
      const result = await apiPost<{
        success: boolean;
        data: { checkoutUrl: string };
      }>(`/api/organizations/${organizationId}/billing/checkout`, {
        plan: "pro",
        returnPath: `/w/${workspaceId}/billing`,
      }, {
        headers: { "Idempotency-Key": `billing-checkout:${organizationId}:${crypto.randomUUID()}` },
      });
      window.location.assign(result.data.checkoutUrl);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("billing.loadFailed"));
      setBillingAction(null);
    }
  };

  const openPortal = async () => {
    if (!organizationId) return;
    setBillingAction("portal");
    setError(null);
    try {
      const result = await apiPost<{
        success: boolean;
        data: { portalUrl: string };
      }>(`/api/organizations/${organizationId}/billing/portal`, {
        returnPath: `/w/${workspaceId}/billing`,
      });
      window.location.assign(result.data.portalUrl);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("billing.loadFailed"));
      setBillingAction(null);
    }
  };

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  const sortedUsage = (data?.usage ?? []).slice().sort((a, b) => {
    const ai = METRIC_ORDER.indexOf(a.metric);
    const bi = METRIC_ORDER.indexOf(b.metric);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Billing</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{t("billing.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("billing.subtitle")}</p>
        </div>
        <button onClick={() => { setLoading(true); void loadBilling(); }} className="app-button-secondary self-start">
          <RefreshCw size={16} />{t("workspace.refresh")}
        </button>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}

      {/* Current Plan Card */}
      <section className="app-card overflow-hidden bg-[linear-gradient(110deg,#fff_0%,#fff_58%,#f0f2ff_100%)] p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-600">
              <Sparkles size={17} />{t("billing.currentPlan")}
            </div>
            <h2 className="mt-3 text-2xl font-bold capitalize tracking-tight text-slate-950">
              {(data?.plan ?? "early_access").replace("_", " ")}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              {t("billing.planDesc")}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="app-badge bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={14} />{data?.status ?? "active"}
              </span>
              <span className="text-sm font-semibold text-slate-700">
                {data?.plan === "pro" ? t("billing.proPlan") : t("billing.free")}
              </span>
            </div>
            {data?.subscription && (
              <p className="mt-3 text-xs font-medium text-slate-500">
                Stripe subscription: {data.subscription.status}
                {data.subscription.cancelAtPeriodEnd ? " · cancels at period end" : ""}
              </p>
            )}
          </div>
          <div className="flex min-w-fit flex-col items-end gap-2">
            <button
              type="button"
              disabled={!data?.canManageBilling || !data.subscription || billingAction !== null}
              onClick={() => void openPortal()}
              title={data?.canManageBilling ? undefined : "Organization owner required"}
              className="app-button-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {billingAction === "portal" ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
              {t("billing.manageSubscription")}
            </button>
            <span className="text-xs text-slate-400">{t("billing.stripeComingSoon")}</span>
          </div>
        </div>
      </section>

      {/* Free Plan Boundaries (v0.4.3) */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-5">
          <h3 className="font-bold text-slate-900">{t("freeBoundaries.title")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("freeBoundaries.subtitle")}</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-semibold">{t("freeBoundaries.boundary")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("freeBoundaries.value")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("freeBoundaries.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                { label: t("freeBoundaries.workspaceLimit"), value: t("freeBoundaries.workspaceValue"), enforced: true },
                { label: t("freeBoundaries.memberLimit"), value: t("freeBoundaries.memberValue"), enforced: false },
                { label: t("freeBoundaries.packAvailability"), value: t("freeBoundaries.packValue"), enforced: true },
                { label: t("freeBoundaries.operationLimit"), value: t("freeBoundaries.operationValue"), enforced: false },
                { label: t("freeBoundaries.apiAccess"), value: t("freeBoundaries.apiValue"), enforced: true },
                { label: t("freeBoundaries.storage"), value: t("freeBoundaries.storageValue"), enforced: false },
                { label: t("freeBoundaries.support"), value: t("freeBoundaries.supportValue"), enforced: false },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="px-4 py-2.5 font-medium text-slate-700">{row.label}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.value}</td>
                  <td className="px-4 py-2.5">
                    <span className={`app-badge ${row.enforced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {row.enforced ? t("freeBoundaries.enforced") : t("freeBoundaries.notEnforced")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">{t("freeBoundaries.note")}</p>
      </section>

      {/* Usage Metrics */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-5">
          <h3 className="font-bold text-slate-900">{t("billing.usageStats")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("billing.usageDesc")}</p>
        </div>
        {sortedUsage.length === 0 ? (
          <p className="text-sm text-slate-500">{t("billing.noUsage")}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sortedUsage.map((item) => {
              const meta = METRIC_LABELS[item.metric] ?? {
                icon: HardDrive,
                format: (v: number) => v.toLocaleString(),
              };
              const Icon = meta.icon;
              const pct = item.limit > 0 ? Math.min(100, (item.current / item.limit) * 100) : 0;
              const isHard = item.type === "hard";
              return (
                <div key={item.metric} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-lg bg-white text-indigo-600 shadow-sm">
                        <Icon size={16} />
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{meta.labelKey ? t(meta.labelKey) : item.metric}</span>
                    </div>
                    <span className={`app-badge ${isHard ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>
                      {isHard ? t("billing.hardLimit") : t("billing.softLimit")}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-lg font-bold text-slate-950">{meta.format(item.current)}</span>
                    <span className="text-xs text-slate-500">/ {meta.format(item.limit)}</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-indigo-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {t("billing.remaining", { value: meta.format(item.remaining) })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Features List */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-5">
          <h3 className="font-bold text-slate-900">{t("billing.features")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("billing.featuresDesc")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(data?.features ?? []).map((feature) => {
            const meta = FEATURE_LABELS[feature] ?? { icon: CheckCircle2 };
            const Icon = meta.icon;
            return (
              <div key={feature} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5">
                <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Icon size={17} />
                </span>
                <span className="flex-1 text-sm font-semibold text-slate-700">{meta.labelKey ? t(meta.labelKey) : feature}</span>
                <CheckCircle2 size={18} className="text-emerald-500" />
              </div>
            );
          })}
        </div>
      </section>

      {/* Self-serve subscription */}
      <section className="app-card bg-slate-50/50 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
            <CreditCard size={24} />
          </div>
          <h3 className="mt-4 text-lg font-bold text-slate-900">{t("billing.comingSoon")}</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            {t("billing.comingSoonBody")}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="app-badge bg-white text-slate-600">{t("billing.proPlan")}</span>
            <span className="app-badge bg-white text-slate-600">{t("billing.enterprisePlan")}</span>
          </div>
          {data?.plan !== "pro" && (
            <button
              type="button"
              disabled={!data?.canManageBilling || billingAction !== null}
              onClick={() => void startCheckout()}
              className="app-button-primary mt-5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {billingAction === "checkout" ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
              {t("billing.proPlan")}
            </button>
          )}
        </div>
      </section>

      {/* Billing History (empty) */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-3">
          <h3 className="font-bold text-slate-900">{t("billing.history")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("billing.historyDesc")}</p>
        </div>
        {(data?.billingHistory ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{t("billing.noHistory")}</p>
        ) : null}
      </section>
    </div>
  );
}
