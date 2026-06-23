"use client";

interface AuditTimelineProps {
  logs: any[];
}

const actionLabels: Record<string, string> = {
  "extension.apply": "应用扩展",
  "extension.rollback": "回滚扩展",
  "pack.install": "安装 Pack",
  "record.create": "创建记录",
  "record.update": "更新记录",
};

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString("zh-CN");
  } catch {
    return ts;
  }
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
    if (after.modulesInstalled) {
      return `模块：${(after.modulesInstalled as string[]).join(", ")}`;
    }
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
        return (
          <li key={log.id} className="relative">
            <span className="absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-blue-500 bg-white">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            </span>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  {label}
                </span>
                <time className="text-xs text-slate-400">
                  {formatTime(log.createdAt)}
                </time>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">
                  {log.actorType}
                </span>
                <span>{log.actorId}</span>
                <span className="text-slate-300">·</span>
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
