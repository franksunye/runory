"use client";

import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { formatRelativeTime } from "./SchemaTable";

interface AuditTimelineProps {
  logs: any[];
}

const ACTION_LABEL_KEY: Record<string, MessageKey> = {
  "record.create": "audit.action.recordCreate",
  "record.update": "audit.action.recordUpdate",
  "record.delete": "audit.action.recordDelete",
  "extension.apply": "audit.action.extensionApply",
  "extension.rollback": "audit.action.extensionRollback",
  "pack.install": "audit.action.packInstall",
  "module.install": "audit.action.moduleInstall",
  "module.upgrade": "audit.action.moduleUpgrade",
  "api_key.create": "audit.action.apiKeyCreate",
  "api_key.revoke": "audit.action.apiKeyRevoke",
  "api_key.rotate": "audit.action.apiKeyRotate",
  "member.invite": "audit.action.memberInvite",
  "member.remove": "audit.action.memberRemove",
  "workspace.create": "audit.action.workspaceCreate",
  "workspace.delete": "audit.action.workspaceDelete",
  "workspace.export": "audit.action.workspaceExport",
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

function actorLabel(log: any, t: (key: MessageKey, params?: Record<string, string | number>) => string): string {
  if (log.actorType === "agent") return t("audit.actor.agent");
  if (log.actorType === "system") return t("audit.actor.system");
  if (log.actorType === "user") return t("audit.actor.user");
  return log.actorType ?? t("audit.actor.unknown");
}

function summarizeChange(log: any, t: (key: MessageKey, params?: Record<string, string | number>) => string): string {
  const after = log.after;
  if (after && typeof after === "object") {
    if (after.version !== undefined) {
      const pieces = [t("audit.summary.version", { version: after.version })];
      if (after.riskLevel) pieces.push(t("audit.summary.risk", { level: after.riskLevel }));
      if (after.changeSummary) pieces.push(String(after.changeSummary));
      return pieces.join(" · ");
    }
    if (Array.isArray(after.modulesInstalled)) {
      return t("audit.summary.modules", { modules: (after.modulesInstalled as string[]).join(", ") });
    }
    if (after.name !== undefined) return t("audit.summary.name", { name: String(after.name) });
    if (after.status !== undefined) return t("audit.summary.status", { status: String(after.status) });
  }
  return "—";
}

export default function AuditTimeline({ logs }: AuditTimelineProps) {
  const { t } = useI18n();

  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">{t("audit.empty")}</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-6">
      {logs.map((log) => {
        const labelKey = ACTION_LABEL_KEY[log.action];
        const label = labelKey ? t(labelKey) : log.action;
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
                  {formatRelativeTime(log.createdAt, t)}
                </time>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className={`app-badge ${style.badge}`}>
                  {actorLabel(log, t)}
                </span>
                <span>{t("audit.entity", { entity: log.entityType })}</span>
                <span className="text-slate-300">·</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {log.entityId}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {summarizeChange(log, t)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
