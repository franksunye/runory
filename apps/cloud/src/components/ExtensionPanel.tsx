"use client";

import { useState } from "react";
import DiffPreview from "./DiffPreview";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";

interface ExtensionPanelProps {
  workspaceId: string;
  extensions: any[];
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

export default function ExtensionPanel({
  workspaceId,
  extensions,
  onRefresh,
}: ExtensionPanelProps) {
  const [planText, setPlanText] = useState(JSON.stringify(EXAMPLE_PLAN, null, 2));
  const [validation, setValidation] = useState<any>(null);
  const [diff, setDiff] = useState<any>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

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
    const plan = parsePlan();
    if (!plan) return;
    setBusy(true);
    setMessage(null);
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
    const plan = parsePlan();
    if (!plan) return;
    setBusy(true);
    setMessage(null);
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
        setMessage({
          type: "success",
          text: `扩展已应用（版本 #${json.data.version}）`,
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
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Extension Plan
        </h3>
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
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Plan（校验）
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Preview（预览）
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Apply（应用）
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
      </div>

      {diff && <DiffPreview diff={diff} />}

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
