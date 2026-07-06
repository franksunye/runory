import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import {
  type Principal,
  type RequestContext,
  AuthenticationError,
  AuthorizationError,
} from "./context";

// ── Audit Event Types ──

export type AuditAction =
  | "user.create"
  | "user.delete"
  | "session.create"
  | "session.revoke"
  | "organization.create"
  | "organization.delete"
  | "workspace.create"
  | "workspace.archive"
  | "workspace.delete"
  | "workspace.restore"
  | "workspace.purge"
  | "workspace.export"
  | "workspace.import"
  | "member.invite"
  | "member.accept"
  | "member.remove"
  | "member.role_change"
  | "ownership.transfer"
  | "invitation.create"
  | "invitation.revoke"
  | "invitation.resend"
  | "api_key.create"
  | "api_key.revoke"
  | "api_key.rotate"
  | "api_key.use"
  | "extension.apply"
  | "extension.rollback"
  | "record.create"
  | "record.update"
  | "record.delete"
  | "entitlement.update"
  | "quota.exceeded"
  // Catalog & Release Control Plane (docs/09 §17)
  | "catalog.candidate_import"
  | "catalog.version_freeze"
  | "catalog.version_reject"
  | "catalog.validation_run"
  | "catalog.release_promote"
  | "catalog.release_deprecate"
  | "catalog.release_withdraw"
  | "catalog.rollout_create"
  | "catalog.rollout_pause"
  | "catalog.rollout_resume"
  | "catalog.rollout_cancel"
  | "module.install"
  | "module.upgrade"
  | "module.upgrade_failed"
  | "module.compatibility_override"
  // Dashboard Workbench Composition (v0.2.1)
  | "dashboard.widget.hide"
  | "dashboard.widget.show"
  | "dashboard.widget.reorder"
  | "dashboard.widget.configure"
  | "dashboard.widget.add"
  | "dashboard.widget.remove"
  | "dashboard.layout.reset"
  // Workflow Runtime (v0.3.5)
  | "workflow.definition.create"
  | "workflow.definition.update"
  | "workflow.definition.delete"
  | "workflow.start"
  | "workflow.transition"
  | "workflow.approve"
  | "workflow.system_action"
  // Automation Runtime (v0.3.5)
  | "automation.create"
  | "automation.update"
  | "automation.delete"
  | "automation.enable"
  | "automation.disable"
  | "automation.run"
  | "automation.run_fail"
  // Quote Document Output (v0.5.1)
  | "quote.document_generated"
  // Work Item Lifecycle (v0.5.1)
  | "work_item.claim"
  | "work_item.release"
  | "work_item.complete"
  | "work_item.approval_decide"
  | "work_item.return"
  | "work_item.cancel"
  // Evidence Upload (v0.5.1)
  | "attachment.upload"
  | "attachment.download"
  // Form Submission Lifecycle (v0.5.1)
  | "form_submission.submit"
  | "form_submission.return"
  | "form_submission.accept"
  | "form_submission.save_draft";

export interface AuditEventInput {
  workspaceId: string;
  actorType: "user" | "api_key" | "system" | "agent";
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  extensionVersionId?: string | null;
  requestId?: string | null;
}

export interface AuditEvent extends AuditEventInput {
  id: string;
  createdAt: string;
}

// ── Sensitive fields to redact ──

const SENSITIVE_FIELDS = new Set([
  "password", "token", "secret", "otp", "code", "session_token",
  "key_hash", "key", "api_key", "authorization", "cookie",
  "challenge", "hash", "refresh_token",
]);

function redactSensitive(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

// ── Write Audit Event (append-only) ──

export async function writeAuditEvent(input: AuditEventInput): Promise<string> {
  const id = genId("aud");
  const ts = now();
  const before = redactSensitive(input.before ?? null);
  const after = redactSensitive(input.after ?? null);

  await execute(
    `INSERT INTO ${TABLES.auditLogs}
     (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, extension_version_id, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.workspaceId,
      input.actorType,
      input.actorId,
      input.action,
      input.entityType,
      input.entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      input.extensionVersionId ?? null,
      input.requestId ?? null,
      ts,
    ]
  );

  return id;
}

// ── Query Audit Events ──

export async function getAuditEvents(
  workspaceId: string,
  options?: {
    action?: string;
    actorId?: string;
    entityType?: string;
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }
): Promise<AuditEvent[]> {
  const conditions = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (options?.action) {
    conditions.push("action = ?");
    args.push(options.action);
  }
  if (options?.actorId) {
    conditions.push("actor_id = ?");
    args.push(options.actorId);
  }
  if (options?.entityType) {
    conditions.push("entity_type = ?");
    args.push(options.entityType);
  }
  if (options?.startDate) {
    conditions.push("created_at >= ?");
    args.push(options.startDate);
  }
  if (options?.endDate) {
    conditions.push("created_at <= ?");
    args.push(options.endDate);
  }

  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;
  args.push(limit, offset);

  const rows = await queryAll<{
    id: string; workspace_id: string; actor_type: string; actor_id: string;
    action: string; entity_type: string; entity_id: string;
    before_json: string | null; after_json: string | null;
    extension_version_id: string | null; request_id: string | null; created_at: string;
  }>(
    `SELECT * FROM ${TABLES.auditLogs} WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args
  );

  return rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    actorType: r.actor_type as AuditEventInput["actorType"],
    actorId: r.actor_id,
    action: r.action as AuditAction,
    entityType: r.entity_type,
    entityId: r.entity_id,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    extensionVersionId: r.extension_version_id,
    requestId: r.request_id,
    createdAt: r.created_at,
  }));
}

// ── Find audit events by request ID ──

export async function findAuditByRequestId(
  requestId: string,
  workspaceId?: string
): Promise<AuditEvent[]> {
  const conditions = ["request_id = ?"];
  const args: unknown[] = [requestId];

  if (workspaceId) {
    conditions.push("workspace_id = ?");
    args.push(workspaceId);
  }

  const rows = await queryAll<{
    id: string; workspace_id: string; actor_type: string; actor_id: string;
    action: string; entity_type: string; entity_id: string;
    before_json: string | null; after_json: string | null;
    extension_version_id: string | null; request_id: string | null; created_at: string;
  }>(
    `SELECT * FROM ${TABLES.auditLogs} WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    args
  );

  return rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    actorType: r.actor_type as AuditEventInput["actorType"],
    actorId: r.actor_id,
    action: r.action as AuditAction,
    entityType: r.entity_type,
    entityId: r.entity_id,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    extensionVersionId: r.extension_version_id,
    requestId: r.request_id,
    createdAt: r.created_at,
  }));
}

// ── Retention: delete audit events older than 365 days ──

export async function cleanupOldAuditEvents(retentionDays = 365): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  await execute(
    `DELETE FROM ${TABLES.auditLogs} WHERE created_at < ?`,
    [cutoff]
  );
}

// ── Business-Readable Audit Summary (v0.3.6) ──

export interface AuditSummaryEntry {
  /** Human-readable summary, e.g. "批准了报价审批流实例（草稿 → 已批准）" */
  summary: string;
  /** Category for filtering and icons */
  category: "workflow" | "automation" | "record" | "dashboard" | "admin" | "catalog" | "system";
  /** Optional detail lines */
  detail?: string;
  /** Optional deep-link route to the relevant object */
  linkRoute?: string;
  /** Optional label for the link */
  linkLabel?: string;
}

const ACTOR_LABELS: Record<string, string> = {
  user: "用户",
  api_key: "API Key",
  system: "系统",
  agent: "Agent",
};

const ENTITY_LABELS: Record<string, string> = {
  workflow_instance: "工作流实例",
  workflow_definition: "工作流定义",
  automation_definition: "自动化规则",
  notification: "通知",
  company: "公司",
  contact: "联系人",
  deal: "商机",
  task: "任务",
  quote: "报价单",
  work_order: "工单",
  ticket: "服务单",
  landing_page: "着陆页",
  form_submission: "表单提交",
  workspace: "工作区",
  organization: "组织",
  user: "用户",
};

function getActorLabel(actorType: string, actorId: string): string {
  const label = ACTOR_LABELS[actorType] ?? actorType;
  return `${label} ${actorId.substring(0, 12)}`;
}

function getEntityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

function truncateId(id: string): string {
  return id.length > 20 ? `${id.substring(0, 20)}…` : id;
}

/**
 * Convert a raw audit event into a business-readable summary.
 * This is the primary audit surface experience — admins should understand
 * what happened without inspecting raw JSON.
 */
export function renderAuditSummary(event: AuditEvent): AuditSummaryEntry {
  const actor = getActorLabel(event.actorType, event.actorId);
  const entityLabel = getEntityLabel(event.entityType);
  const entityId = truncateId(event.entityId);
  const after = event.after as Record<string, unknown> | null;
  const before = event.before as Record<string, unknown> | null;

  switch (event.action) {
    // Workflow actions
    case "workflow.definition.create":
      return {
        summary: `${actor} 创建了工作流定义「${after?.name ?? entityId}」`,
        category: "workflow",
        detail: `目标对象: ${after?.targetObject ?? "未知"}`,
        linkRoute: `/workflows`,
        linkLabel: "查看工作流",
      };
    case "workflow.definition.delete":
      return {
        summary: `${actor} 删除了工作流定义「${before?.name ?? entityId}」`,
        category: "workflow",
      };
    case "workflow.start":
      return {
        summary: `${actor} 启动了工作流实例（${after?.workflowId ?? "未知"}）`,
        category: "workflow",
        detail: `对象: ${after?.objectType ?? "?"} #${truncateId(String(after?.recordId ?? ""))} → 初始状态: ${after?.initialState ?? "?"}`,
      };
    case "workflow.transition":
      return {
        summary: `${actor} 执行了状态转换「${after?.transitionLabel ?? "?"}」`,
        category: "workflow",
        detail: `${before?.state ?? "?"} → ${after?.state ?? "?"}${after?.comment ? ` · 备注: ${after.comment}` : ""}`,
      };
    case "workflow.approve":
      return {
        summary: `${actor} 审批通过了状态转换「${after?.transitionLabel ?? "?"}」`,
        category: "workflow",
        detail: `${before?.state ?? "?"} → ${after?.state ?? "?"}${after?.comment ? ` · 备注: ${after.comment}` : ""}`,
      };
    case "workflow.system_action":
      return {
        summary: `系统执行了工作流动作「${after?.systemActionType ?? "?"}」`,
        category: "workflow",
        detail: after?.error ? `执行失败: ${after.error}` : `转换: ${after?.transitionLabel ?? "?"}`,
      };

    // Automation actions
    case "automation.create":
      return {
        summary: `${actor} 创建了自动化规则「${after?.name ?? entityId}」`,
        category: "automation",
        linkRoute: `/automations`,
        linkLabel: "查看自动化",
      };
    case "automation.update":
      return {
        summary: `${actor} 更新了自动化规则「${after?.name ?? entityId}」`,
        category: "automation",
      };
    case "automation.delete":
      return {
        summary: `${actor} 删除了自动化规则「${before?.name ?? entityId}」`,
        category: "automation",
      };
    case "automation.enable":
      return {
        summary: `${actor} 启用了自动化规则`,
        category: "automation",
      };
    case "automation.disable":
      return {
        summary: `${actor} 禁用了自动化规则`,
        category: "automation",
      };
    case "automation.run":
      return {
        summary: `${actor} 自动化执行完成（${after?.automationId ?? "?"}）`,
        category: "automation",
        detail: `状态: ${after?.status ?? "?"} · 动作数: ${after?.actionsCount ?? 0} · 触发: ${after?.triggerType ?? "?"}`,
      };
    case "automation.run_fail":
      return {
        summary: `${actor} 自动化执行失败（${after?.automationId ?? "?"}）`,
        category: "automation",
        detail: `状态: ${after?.status ?? "?"} · 触发: ${after?.triggerType ?? "?"}`,
      };

    // Record actions
    case "record.create":
      return {
        summary: `${actor} 创建了${entityLabel}记录`,
        category: "record",
        detail: `ID: ${entityId}`,
      };
    case "record.update":
      return {
        summary: `${actor} 更新了${entityLabel}记录`,
        category: "record",
        detail: `ID: ${entityId}`,
      };
    case "record.delete":
      return {
        summary: `${actor} 删除了${entityLabel}记录`,
        category: "record",
        detail: `ID: ${entityId}`,
      };

    // Dashboard actions
    case "dashboard.widget.configure":
      return {
        summary: `${actor} 配置了仪表盘组件`,
        category: "dashboard",
      };
    case "dashboard.widget.hide":
      return {
        summary: `${actor} 隐藏了仪表盘组件`,
        category: "dashboard",
      };
    case "dashboard.widget.show":
      return {
        summary: `${actor} 显示了仪表盘组件`,
        category: "dashboard",
      };
    case "dashboard.layout.reset":
      return {
        summary: `${actor} 重置了仪表盘布局`,
        category: "dashboard",
      };

    // Admin actions
    case "workspace.create":
      return {
        summary: `${actor} 创建了工作区「${after?.name ?? entityId}」`,
        category: "admin",
      };
    case "workspace.archive":
      return {
        summary: `${actor} 归档了工作区`,
        category: "admin",
      };
    case "member.invite":
      return {
        summary: `${actor} 邀请了新成员`,
        category: "admin",
      };
    case "member.role_change":
      return {
        summary: `${actor} 变更了成员角色`,
        category: "admin",
      };
    case "api_key.create":
      return {
        summary: `${actor} 创建了 API Key`,
        category: "admin",
      };
    case "api_key.revoke":
      return {
        summary: `${actor} 撤销了 API Key`,
        category: "admin",
      };

    // Extension actions
    case "extension.apply":
      return {
        summary: `${actor} 应用了扩展变更`,
        category: "system",
        detail: `ID: ${entityId}`,
      };
    case "extension.rollback":
      return {
        summary: `${actor} 回滚了扩展变更`,
        category: "system",
        detail: `ID: ${entityId}`,
      };

    // Catalog actions
    case "module.install":
      return {
        summary: `${actor} 安装了模块`,
        category: "catalog",
      };
    case "module.upgrade":
      return {
        summary: `${actor} 升级了模块`,
        category: "catalog",
      };

    // Workspace import/export (v0.3.6)
    case "workspace.import":
      return {
        summary: `${actor} 导入了工作区配置`,
        category: "system",
        detail: `对象: ${after?.imported ?? "?"}, 统计: ${JSON.stringify(after?.stats ?? {})}`,
      };

    default:
      return {
        summary: `${actor} 执行了操作: ${event.action}`,
        category: "system",
        detail: `对象: ${entityLabel} #${entityId}`,
      };
  }
}

// ── Get audit events with summaries (convenience) ──

export interface AuditEventWithSummary extends AuditEvent {
  summary: AuditSummaryEntry;
}

export async function getAuditEventsWithSummaries(
  workspaceId: string,
  options?: Parameters<typeof getAuditEvents>[1]
): Promise<AuditEventWithSummary[]> {
  const events = await getAuditEvents(workspaceId, options);
  return events.map(event => ({
    ...event,
    summary: renderAuditSummary(event),
  }));
}
