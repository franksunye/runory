import { queryAll, queryOne, genId, now } from "./db";
import { TABLES } from "./contracts";
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

export async function getAuditLogs(workspaceId: string): Promise<AuditLog[]> {
  const rows = await queryAll<{
    id: string; workspace_id: string; actor_type: string; actor_id: string;
    action: string; entity_type: string; entity_id: string;
    before_json: string | null; after_json: string | null;
    extension_version_id: string | null; created_at: string;
  }>(`SELECT * FROM ${TABLES.auditLogs} WHERE workspace_id = ? ORDER BY created_at DESC`, [workspaceId]);
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, actorType: r.actor_type, actorId: r.actor_id,
    action: r.action, entityType: r.entity_type, entityId: r.entity_id,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    extensionVersionId: r.extension_version_id, createdAt: r.created_at,
  }));
}

// ── Workspace Export ──

export async function exportWorkspace(workspaceId: string) {
  const workspace = await queryOne<{
    id: string; name: string; slug: string; template_id: string | null;
    created_at: string; updated_at: string;
  }>(`SELECT * FROM ${TABLES.workspaces} WHERE id = ?`, [workspaceId]);
  if (!workspace) throw new Error("Workspace not found");

  const installations = await getInstallations(workspaceId);
  const objects = await getObjects(workspaceId);
  const fields = (await Promise.all(objects.map(obj => getFields(workspaceId, obj.objectKey)))).flat();
  const views = (await Promise.all(objects.map(obj => getViews(workspaceId, obj.objectKey)))).flat();
  const navigation = await getNavigation(workspaceId);
  const extensions = await getExtensions(workspaceId);
  const extensionVersions = (await Promise.all(extensions.map(ext => getExtensionVersions(workspaceId, ext.id)))).flat();
  const auditLogs = await getAuditLogs(workspaceId);

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
