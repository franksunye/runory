"use client";

interface AuditTimelineProps {
  logs: any[];
}

const actionLabels: Record<string, string> = {
  "record.create": "创建了记录",
  "record.update": "更新了记录",
  "record.delete": "删除了记录",
  "extension.apply": "应用了扩展",
  "extension.rollback": "回滚了扩展",
  "pack.install": "安装了 Pack",
  "module.install": "安装了模块",
  "module.upgrade": "升级了模块",
  "api_key.create": "创建了 API 密钥",
  "api_key.revoke": "撤销了 API 密钥",
  "api_key.rotate": "轮换了 API 密钥",
  "member.invite": "邀请了成员",
  "member.remove": "移除了成员",
  "workspace.create": "创建了工作区",
  "workspace.delete": "删除了工作区",
  "workspace.export": "导出了工作区",
};

type ActionTone = "create" | "update" | "delete" | "extension" | "system";

const toneStyles: Record<ActionTone, { dot: string; ring: string; badge: string }> = {
  create: { dot: "bg-emerald-500", ring: "border-emerald-400", badge: "bg-emerald-50 text-emerald-700" },
  update: { dot: "bg-blue-500", ring: "border-blue-400", badge: "bg-blue-50 text-blue-700" },
  delete: { dot: "bg-red-500", ring: "border-red-400", badge: "bg-red-50 text-red-700" },
  extension: { dot: "bg-violet-500", ring: "border-violet-400", badge: "bg-violet-50 text-violet-700" },
  system: { dot: "bg-slate-400", ring: "border-slate-300", badge: "bg-slate-100 text-slate-600" },
};

function categorize(action: string): ActionTone {
  if (action.startsWith("record.create") || action.startsWith("api_key.create") || action.startsWith("workspace.create") || action.startsWith("pack.install") || action.startsWith("module.install")) return "create";
  if (action.startsWith("record.update") || action.startsWith("module.upgrade") || action.startsWith("api_key.rotate")) return "update";
  if (action.startsWith("record.delete") || action.startsWith("api_key.revoke") || action.startsWith("workspace.delete") || action.startsWith("member.remove")) return "delete";
  if (action.startsWith("extension.")) return "extension";
  return "system";
}

function formatRelativeTime(ts: string): string {
  try {
    const then = new Date(ts).getTime();
    const diff = Date.now() - then;
    if (diff < 0) return new Date(ts).toLocaleString("zh-CN");
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "刚刚";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    if (hours < 48) return "昨天";
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return new Date(ts).toLocaleDateString("zh-CN");
  } catch {
    return ts;
  }
}

function actorLabel(log: any): string {
  if (log.actorType === "agent") return "Agent";
  if (log.actorType === "system") return "系统";
  if (log.actorType === "user") return "用户";
  return log.actorType ?? "未知";
}

function summarizeChange(log: any): string {
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
  }
  return "—";
}

export default function AuditTimeline({ logs }: AuditTimelineProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">暂无审计日志</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-6">
      {logs.map((log) => {
        const label = actionLabels[log.action] ?? log.action;
        const tone = categorize(log.action);
        const style = toneStyles[tone];
        return (
          <li key={log.id} className="relative">
            <span className={`absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${style.ring} bg-white`}>
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            </span>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  {label}
                </span>
                <time className="text-xs text-slate-400" title={new Date(log.createdAt).toLocaleString("zh-CN")}>
                  {formatRelativeTime(log.createdAt)}
                </time>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className={`app-badge ${style.badge}`}>
                  {actorLabel(log)}
                </span>
                <span>实体：{log.entityType}</span>
                <span className="text-slate-300">·</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {log.entityId}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {summarizeChange(log)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
