"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  CreditCard,
  HardDrive,
  KeyRound,
  Package,
  RefreshCw,
  ScrollText,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

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
  billingHistory: unknown[];
}

const FEATURE_LABELS: Record<string, { label: string; icon: typeof Package }> = {
  crm_lite: { label: "CRM Lite 模块", icon: Package },
  extensions: { label: "扩展与定制", icon: Zap },
  api_access: { label: "API 访问", icon: KeyRound },
  audit_log: { label: "审计日志", icon: ScrollText },
};

const METRIC_LABELS: Record<string, { label: string; icon: typeof Users; format: (v: number) => string }> = {
  records: { label: "记录数", icon: HardDrive, format: (v) => v.toLocaleString() },
  workspaces: { label: "工作区", icon: Package, format: (v) => v.toLocaleString() },
  members: { label: "成员数", icon: Users, format: (v) => v.toLocaleString() },
  api_requests: { label: "API 调用", icon: KeyRound, format: (v) => v.toLocaleString() },
  agent_operations: { label: "Agent 操作", icon: Zap, format: (v) => v.toLocaleString() },
  storage_bytes: {
    label: "存储空间",
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

  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBilling = useCallback(async () => {
    try {
      setError(null);
      // Resolve organizationId from the workspace context
      const wsRes = await fetch(`/api/workspaces/${workspaceId}`);
      const wsJson = await wsRes.json();
      if (!wsJson.success || !wsJson.data.organizationId) {
        throw new Error(wsJson.error?.message ?? "无法获取组织信息");
      }
      const orgId = wsJson.data.organizationId as string;

      const billingRes = await fetch(`/api/organizations/${orgId}/billing`);
      const billingJson = await billingRes.json();
      if (!billingJson.success) {
        throw new Error(billingJson.error?.message ?? "加载账单信息失败");
      }
      setData(billingJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
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
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">账单</h1>
          <p className="mt-1 text-sm text-slate-500">查看当前方案、用量与功能权益</p>
        </div>
        <button onClick={() => { setLoading(true); void loadBilling(); }} className="app-button-secondary self-start">
          <RefreshCw size={16} />刷新
        </button>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}

      {/* Current Plan Card */}
      <section className="app-card overflow-hidden bg-[linear-gradient(110deg,#fff_0%,#fff_58%,#f0f2ff_100%)] p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-600">
              <Sparkles size={17} />当前方案
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">Early Access</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              您正在使用 Early Access 方案，包含核心平台能力。Stripe 付费订阅集成即将上线。
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="app-badge bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={14} />{data?.status ?? "active"}
              </span>
              <span className="text-sm font-semibold text-slate-700">免费</span>
            </div>
          </div>
          <div className="flex min-w-fit flex-col items-end gap-2">
            <button
              type="button"
              disabled
              title="Stripe 集成即将上线"
              className="app-button-primary cursor-not-allowed opacity-60"
            >
              <CreditCard size={18} />管理订阅
            </button>
            <span className="text-xs text-slate-400">Stripe 集成即将上线</span>
          </div>
        </div>
      </section>

      {/* Usage Metrics */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-5">
          <h3 className="font-bold text-slate-900">用量统计</h3>
          <p className="mt-1 text-xs text-slate-500">当前周期内各项资源使用情况</p>
        </div>
        {sortedUsage.length === 0 ? (
          <p className="text-sm text-slate-500">暂无用量数据</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sortedUsage.map((item) => {
              const meta = METRIC_LABELS[item.metric] ?? {
                label: item.metric,
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
                      <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
                    </div>
                    <span className={`app-badge ${isHard ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>
                      {isHard ? "硬限制" : "软限制"}
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
                    剩余 {meta.format(item.remaining)}
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
          <h3 className="font-bold text-slate-900">功能权益</h3>
          <p className="mt-1 text-xs text-slate-500">当前方案包含的功能</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(data?.features ?? []).map((feature) => {
            const meta = FEATURE_LABELS[feature] ?? { label: feature, icon: CheckCircle2 };
            const Icon = meta.icon;
            return (
              <div key={feature} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5">
                <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Icon size={17} />
                </span>
                <span className="flex-1 text-sm font-semibold text-slate-700">{meta.label}</span>
                <CheckCircle2 size={18} className="text-emerald-500" />
              </div>
            );
          })}
        </div>
      </section>

      {/* Coming Soon Section */}
      <section className="app-card border-dashed bg-slate-50/50 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
            <CreditCard size={24} />
          </div>
          <h3 className="mt-4 text-lg font-bold text-slate-900">即将推出</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            Stripe 订阅计费集成正在开发中。届时将支持 Pro 与 Enterprise 方案的在线升级、降级与账单管理。
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="app-badge bg-white text-slate-600">Pro · $29/月</span>
            <span className="app-badge bg-white text-slate-600">Enterprise · 定制</span>
          </div>
        </div>
      </section>

      {/* Billing History (empty) */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-3">
          <h3 className="font-bold text-slate-900">账单记录</h3>
          <p className="mt-1 text-xs text-slate-500">历史账单与支付记录</p>
        </div>
        {(data?.billingHistory ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">暂无账单记录</p>
        ) : null}
      </section>
    </div>
  );
}
