import { getDb, genId, now } from "./db";
import { getObjects, getFields, getViews, getInstallations, getNavigation } from "./metadata";
import { getExtensions, getExtensionVersions } from "./extension";

// ── Audit Log ──

export interface AuditLog {
  id: string;
  workspaceId: string;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  extensionVersionId: string | null;
  createdAt: string;
}

export function getAuditLogs(workspaceId: string): AuditLog[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC`).all(workspaceId) as any[];
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, actorType: r.actor_type, actorId: r.actor_id,
    action: r.action, entityType: r.entity_type, entityId: r.entity_id,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    extensionVersionId: r.extension_version_id, createdAt: r.created_at,
  }));
}

// ── Workspace Export ──

export function exportWorkspace(workspaceId: string) {
  const db = getDb();
  const workspace = db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(workspaceId) as any;
  if (!workspace) throw new Error("Workspace not found");

  const installations = getInstallations(workspaceId);
  const objects = getObjects(workspaceId);
  const fields = objects.flatMap(obj => getFields(workspaceId, obj.objectKey));
  const views = objects.flatMap(obj => getViews(workspaceId, obj.objectKey));
  const navigation = getNavigation(workspaceId);
  const extensions = getExtensions(workspaceId);
  const extensionVersions = extensions.flatMap(ext => getExtensionVersions(workspaceId, ext.id));
  const auditLogs = getAuditLogs(workspaceId);

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      templateId: workspace.template_id,
      createdAt: workspace.created_at,
      updatedAt: workspace.updated_at,
    },
    installations,
    objects,
    fields,
    views,
    navigation,
    extensions,
    extensionVersions,
    auditLogs,
    exportedAt: now(),
  };
}
