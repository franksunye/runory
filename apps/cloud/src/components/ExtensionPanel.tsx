"use client";

import { useState } from "react";
import Link from "next/link";
import DiffPreview from "./DiffPreview";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";

interface ExtensionPanelProps {
  workspaceId: string;
  extensions: any[];
  hasCrmPack: boolean;
  installingPack?: boolean;
  onInstallPack: () => void | Promise<void>;
  onRefresh: () => void;
}

const EXAMPLE_PLAN = {
  name: "客户等级扩展",
  description: "为客户对象添加等级字段",
  targetModules: ["runory.customer"],
  riskLevel: "low",
  customFields: [
    {
      targetObject: "customer",
      fieldKey: "tier",
      label: "客户等级",
      type: "select",
      ownership: "workspace_extension",
      required: false,
      validation: { options: ["Bronze", "Silver", "Gold", "Platinum"] },
      ui: {
        listColumn: true,
        slot: "customer.form.basic_fields.after",
        order: 100,
      },
    },
  ],
};

interface AppliedSummary {
  version: number;
  fields: Array<{ object: string; fieldKey: string; label: string }>;
  affectedViews: string[];
}

export default function ExtensionPanel({
  workspaceId,
  extensions,
  hasCrmPack,
  installingPack = false,
  onInstallPack,
  onRefresh,
}: ExtensionPanelProps) {
  const [planText, setPlanText] = useState(JSON.stringify(EXAMPLE_PLAN, null, 2));
  const [validation, setValidation] = useState<any>(null);
  const [diff, setDiff] = useState<any>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [appliedSummary, setAppliedSummary] = useState<AppliedSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false);

  const parsePlan = (): any | null => {
    try {
      return JSON.parse(planText);
    } catch (e) {
      setMessage({
        type: "error",
        text: `JSON 解析失败：${e instanceof Error ? e.message : "无效 JSON"}`,
      });
      return null;
    }
  };

  const handlePlan = async () => {
    if (!hasCrmPack) {
      setMessage({
        type: "info",
        text: "请先安装 CRM Lite Pack。安装后会创建 Customer 对象与字段，Plan 才能通过校验。",
      });
      return;
    }
    const plan = parsePlan();
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    setAppliedSummary(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agent/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(plan),
      });
      const json = await res.json();
      if (json.success) {
        setValidation(json.data);
        setMessage(
          json.data.valid
            ? { type: "success", text: "校验通过，可以预览" }
            : {
                type: "error",
                text: `校验失败：${json.data.errors.join("; ")}`,
              }
        );
      } else {
        setMessage({ type: "error", text: json.error?.message ?? "校验失败" });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "请求失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    if (!hasCrmPack) {
      setMessage({
        type: "info",
        text: "请先安装 CRM Lite Pack，然后再生成 Diff Preview。",
      });
      return;
    }
    const plan = parsePlan();
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    setAppliedSummary(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agent/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(plan),
      });
      const json = await res.json();
      if (json.success) {
        setDiff(json.data);
        setMessage({ type: "info", text: "已生成预览，确认后可应用" });
      } else {
        setMessage({ type: "error", text: json.error?.message ?? "预览失败" });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "请求失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!hasCrmPack) {
      setMessage({
        type: "info",
        text: "请先安装 CRM Lite Pack，然后再批准应用扩展。",
      });
      return;
    }
    const plan = parsePlan();
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agent/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ plan, createdBy: "ui-user" }),
      });
      const json = await res.json();
      if (json.success) {
        const addedFields = (plan.customFields ?? []).map((field: any) => ({
          object: field.targetObject,
          fieldKey: field.fieldKey,
          label: field.label,
        }));
        const affectedViews = addedFields.flatMap((field: { object: string }) => [
          `${field.object}_list`,
          `${field.object}_form`,
        ]);
        setMessage({
          type: "success",
          text: `扩展已应用（版本 #${json.data.version}）。现在可以去客户列表验证新增字段。`,
        });
        setAppliedSummary({
          version: json.data.version,
          fields: addedFields,
          affectedViews: Array.from(new Set(affectedViews)),
        });
        setDiff(null);
        setValidation(null);
        notifyWorkspaceDataChanged();
        onRefresh();
      } else {
        setMessage({ type: "error", text: json.error?.message ?? "应用失败" });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "请求失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (extensionId: string) => {
    if (!confirm("确定要回滚此扩展的最新版本吗？")) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agent/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ extensionId, rolledBy: "ui-user" }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({
          type: "success",
          text: `已回滚至版本 #${json.data.version}`,
        });
        notifyWorkspaceDataChanged();
        onRefresh();
      } else {
        setMessage({ type: "error", text: json.error?.message ?? "回滚失败" });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "请求失败",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-indigo-900">
              推荐使用引导式定制流程
            </p>
            <p className="mt-1 text-xs text-indigo-700">
              无需编辑 JSON，通过可视化向导一步步添加字段、预览变更并安全应用。
            </p>
          </div>
          <Link
            href={`/w/${workspaceId}/customize`}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            前往定制工作区
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
          Safe customization approval
        </p>
        <h3 className="mt-2 text-lg font-bold text-slate-950">
          体验一次由 Agent 提议、Admin 批准的安全定制
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          当前 0.1 先用内置示例模拟 Agent proposal：为 Customer 添加“客户等级”字段。
          Admin 需要依次校验 Plan、查看 Diff Preview，然后显式 Apply。未来 Codex
          插件、MCP 或 Skill 也会调用同一组受治理 API，Cloud UI 仍是最终审批与审计入口。
        </p>
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <li className="rounded-xl bg-white p-3 text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-950">1. Plan</span>
            <br />
            验证字段、对象、扩展点和风险等级。
          </li>
          <li className="rounded-xl bg-white p-3 text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-950">2. Preview</span>
            <br />
            查看会新增什么字段、影响哪些视图。
          </li>
          <li className="rounded-xl bg-white p-3 text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-950">3. Apply</span>
            <br />
            Admin 批准后正式改变 Workspace。
          </li>
        </ol>
      </div>

      {!hasCrmPack && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">需要先安装 CRM Lite Pack</p>
              <p className="mt-1 text-amber-800">
                这个 Agent Proposal 会给 Customer 对象添加字段；当前工作区还没有 Customer 的
                object/field metadata，所以需要先安装基础业务 Pack。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onInstallPack()}
              disabled={installingPack || busy}
              className="min-w-fit rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {installingPack ? "安装中..." : "安装 CRM Lite Pack"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">
              Agent Proposal（JSON 编辑器）
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              面向高级用户和 MCP 集成；可直接编辑结构化 plan。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              low risk
            </span>
            <button
              type="button"
              onClick={() => setJsonEditorOpen(!jsonEditorOpen)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {jsonEditorOpen ? "收起" : "展开"}
            </button>
          </div>
        </div>
        {jsonEditorOpen && (
          <>
        <textarea
          value={planText}
          onChange={(e) => setPlanText(e.target.value)}
          rows={18}
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePlan}
            disabled={busy || !hasCrmPack}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title={!hasCrmPack ? "请先安装 CRM Lite Pack" : undefined}
          >
            1. Validate Plan
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={busy || !hasCrmPack}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title={!hasCrmPack ? "请先安装 CRM Lite Pack" : undefined}
          >
            2. Preview Diff
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !hasCrmPack || !diff}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            title={
              !hasCrmPack
                ? "请先安装 CRM Lite Pack"
                : !diff
                  ? "请先生成 Diff Preview，再由 Admin 批准应用"
                  : undefined
            }
          >
            3. Approve & Apply
          </button>
        </div>

        {validation && (
          <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs">
            <p className="font-medium text-slate-700">
              校验结果：{validation.valid ? "通过" : "失败"}
            </p>
            {validation.errors?.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-red-600">
                {validation.errors.map((e: string, i: number) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {message && (
          <div
            className={`mt-3 rounded-md px-3 py-2 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700"
                : message.type === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-blue-50 text-blue-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {appliedSummary && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold">
                  已完成审批并应用到 Workspace
                </p>
                <p className="mt-1 text-emerald-800">
                  版本 #{appliedSummary.version} 已新增{" "}
                  {appliedSummary.fields.map((field) => field.label).join(", ")}
                  ，影响视图：{appliedSummary.affectedViews.join(", ")}。
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  下一步建议：打开客户列表查看新增列，再进入一条客户记录编辑并保存字段值。
                </p>
              </div>
              <div className="flex min-w-fit flex-wrap gap-2">
                <Link
                  href={`/w/${workspaceId}/customers`}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  查看客户列表
                </Link>
                <Link
                  href={`/w/${workspaceId}/audit`}
                  className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  查看审计日志
                </Link>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {diff && (
        <div className="space-y-3">
          <DiffPreview diff={diff} />
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            这是正式变更前的审批点。点击 <strong>Approve & Apply</strong> 后，
            Workspace schema、列表/表单视图和 Audit Log 会发生正式变化。
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          已安装扩展（{extensions.length}）
        </h3>
        {extensions.length === 0 ? (
          <p className="text-sm text-slate-500">暂无扩展</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {extensions.map((ext) => (
              <li
                key={ext.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {ext.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    当前版本 #{ext.currentVersion} ·{" "}
                    {ext.namespace} · 状态：{ext.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRollback(ext.id)}
                  disabled={busy || ext.currentVersion === 0}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  回滚
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
