"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  RefreshCw,
  ScrollText,
} from "lucide-react";

interface AuditLog {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

type ActionCategory = "all" | "record" | "extension" | "api_key" | "agent" | "member" | "workspace";
type DateRange = "24h" | "7d" | "30d" | "all";

const ACTION_LABELS: Record<string, string> = {
  "record.create": "创建记录",
  "record.update": "更新记录",
  "record.delete": "删除记录",
  "extension.apply": "应用扩展",
  "extension.rollback": "回滚扩展",
  "pack.install": "安装 Pack",
  "module.install": "安装模块",
  "module.upgrade": "升级模块",
  "module.upgrade_failed": "模块升级失败",
  "module.compatibility_override": "模块兼容性覆盖",
  "api_key.create": "创建 API 密钥",
  "api_key.revoke": "吊销 API 密钥",
  "api_key.rotate": "轮换 API 密钥",
  "api_key.use": "使用 API 密钥",
  "member.invite": "邀请成员",
  "member.accept": "接受邀请",
  "member.remove": "移除成员",
  "member.role_change": "变更成员角色",
  "invitation.create": "创建邀请",
  "invitation.revoke": "撤销邀请",
  "invitation.resend": "重发邀请",
  "ownership.transfer": "转移所有权",
  "workspace.create": "创建工作区",
  "workspace.archive": "归档工作区",
  "workspace.delete": "删除工作区",
  "workspace.restore": "恢复工作区",
  "workspace.purge": "清除工作区",
  "workspace.export": "导出工作区",
  "user.create": "创建用户",
  "user.delete": "删除用户",
  "session.create": "创建会话",
  "session.revoke": "撤销会话",
  "organization.create": "创建组织",
  "organization.delete": "删除组织",
  "entitlement.update": "更新权益",
  "quota.exceeded": "配额超限",
};

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  all: "全部操作",
  record: "记录变更",
  extension: "扩展与模块",
  api_key: "API 密钥",
  agent: "Agent 操作",
  member: "成员与邀请",
  workspace: "工作区",
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  "24h": "最近 24 小时",
  "7d": "最近 7 天",
  "30d": "最近 30 天",
  all: "全部时间",
};

function categorizeAction(action: string, actorType: string): ActionCategory {
  if (actorType === "agent") return "agent";
  if (action.startsWith("record.")) return "record";
  if (action.startsWith("extension.") || action.startsWith("module.") || action.startsWith("pack.")) return "extension";
  if (action.startsWith("api_key.")) return "api_key";
  if (action.startsWith("member.") || action.startsWith("invitation.") || action.startsWith("ownership.")) return "member";
  if (action.startsWith("workspace.")) return "workspace";
  return "all";
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString("zh-CN");
  } catch {
    return ts;
  }
}

function summarizeChange(log: AuditLog): string {
  const after = log.after;
  if (after && typeof after === "object") {
    if (after.version !== undefined) {
      const pieces = [`版本 #${after.version}`];
      if (after.riskLevel) pieces.push(`风险：${after.riskLevel}`);
      if (after.changeSummary) pieces.push(String(after.changeSummary));
      return pieces.join(" · ");
    }
    if (Array.isArray(after.modulesInstalled)) {
      return `模块：${(after.modulesInstalled as string[]).join(", ")}`;
    }
    if (after.name !== undefined) return `名称：${String(after.name)}`;
    if (after.status !== undefined) return `状态：${String(after.status)}`;
    if (after.role !== undefined) return `角色：${String(after.role)}`;
  }
  return "—";
}

export default function AuditPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [category, setCategory] = useState<ActionCategory>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadLogs = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/audit`);
      const json = await res.json();
      if (json.success) setLogs(json.data);
      else setError(json.error?.message ?? "加载失败");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const now = Date.now();
    const cutoff =
      dateRange === "24h" ? now - 24 * 3600_000
      : dateRange === "7d" ? now - 7 * 86_400_000
      : dateRange === "30d" ? now - 30 * 86_400_000
      : 0;

    return logs.filter((log) => {
      if (category !== "all" && categorizeAction(log.action, log.actorType) !== category) return false;
      if (cutoff > 0 && new Date(log.createdAt).getTime() < cutoff) return false;
      return true;
    });
  }, [logs, category, dateRange]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ scope: "audit" }),
      });
      const json = await res.json();
      if (json.success) {
        const blob = new Blob([JSON.stringify(json.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        a.download = `audit-export-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setMessage("审计日志已导出");
      } else {
        setError(json.error?.message ?? "导出失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Audit</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">审计日志</h1>
          <p className="mt-1 text-sm text-slate-500">
            工作区内所有变更操作记录（共 {logs.length} 条，筛选后 {filteredLogs.length} 条）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setLoading(true); void loadLogs(); }}
            className="app-button-secondary"
          >
            <RefreshCw size={16} />刷新
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="app-button-primary"
          >
            <Download size={16} />
            {exporting ? "导出中..." : "导出审计日志"}
          </button>
        </div>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}
      {message && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Filters */}
      <section className="app-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Filter size={14} />筛选
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">操作类型</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ActionCategory)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                {(Object.keys(CATEGORY_LABELS) as ActionCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">时间范围</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((d) => (
                  <option key={d} value={d}>{DATE_RANGE_LABELS[d]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      {filteredLogs.length === 0 ? (
        <div className="app-card p-8 text-center">
          <ScrollText size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {logs.length === 0 ? "暂无审计日志" : "没有符合筛选条件的日志"}
          </p>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l border-slate-200 pl-6">
          {filteredLogs.map((log) => {
            const label = ACTION_LABELS[log.action] ?? log.action;
            const isExpanded = expandedId === log.id;
            const hasDetails = log.before || log.after;
            return (
              <li key={log.id} className="relative">
                <span className="absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-indigo-500 bg-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                </span>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{label}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {log.actorType}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>操作者：<span className="font-mono">{log.actorId}</span></span>
                        <span className="text-slate-300">·</span>
                        <span>实体：{log.entityType}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono text-[11px] text-slate-400">{log.entityId}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{summarizeChange(log)}</p>
                    </div>
                    <time className="shrink-0 text-xs text-slate-400">{formatTime(log.createdAt)}</time>
                  </div>
                  {hasDetails && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {isExpanded ? "收起详情" : "查看详情"}
                      </button>
                      {isExpanded && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {log.before && (
                            <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">变更前</p>
                              <pre className="overflow-x-auto text-[11px] text-slate-600">
                                {JSON.stringify(log.before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.after && (
                            <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">变更后</p>
                              <pre className="overflow-x-auto text-[11px] text-slate-600">
                                {JSON.stringify(log.after, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
