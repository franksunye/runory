-- Migration: 0002_saas_core
-- Description: Phase 0 SaaS Core consolidation
--   1. Split OrganizationRole (owner/admin/member) and WorkspaceRole (admin/member/viewer) constraints
--   2. Migrate existing workspace 'owner' memberships to 'admin' (ownership belongs to Organization)
--   3. Add request_id to audit_logs for request tracing
--   4. Add status lifecycle to workspaces (active/archived/pending_deletion/purged)
-- SQLite does not support ALTER TABLE ... ALTER CONSTRAINT, so we recreate the membership tables.

-- ── Step 1: Migrate workspace owner → admin before recreating table ──

UPDATE {{RUNORY_TABLE_PREFIX}}workspace_memberships SET role = 'admin' WHERE role = 'owner';

-- ── Step 2: Recreate workspace_memberships with correct CHECK constraint ──

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}workspace_memberships_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, user_id),
  FOREIGN KEY(workspace_id) REFERENCES {{RUNORY_TABLE_PREFIX}}workspaces(id),
  FOREIGN KEY(user_id) REFERENCES {{RUNORY_TABLE_PREFIX}}users(id)
);

INSERT INTO {{RUNORY_TABLE_PREFIX}}workspace_memberships_new (id, workspace_id, user_id, role, status, created_at, updated_at)
SELECT id, workspace_id, user_id, role, status, created_at, updated_at
FROM {{RUNORY_TABLE_PREFIX}}workspace_memberships;

DROP TABLE {{RUNORY_TABLE_PREFIX}}workspace_memberships;
ALTER TABLE {{RUNORY_TABLE_PREFIX}}workspace_memberships_new RENAME TO {{RUNORY_TABLE_PREFIX}}workspace_memberships;

CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_workspace_memberships_user_v2
  ON {{RUNORY_TABLE_PREFIX}}workspace_memberships(user_id, status);

-- ── Step 3: Recreate organization_memberships with correct CHECK constraint ──

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}organization_memberships_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, user_id),
  FOREIGN KEY(organization_id) REFERENCES {{RUNORY_TABLE_PREFIX}}organizations(id),
  FOREIGN KEY(user_id) REFERENCES {{RUNORY_TABLE_PREFIX}}users(id)
);

INSERT INTO {{RUNORY_TABLE_PREFIX}}organization_memberships_new (id, organization_id, user_id, role, status, created_at, updated_at)
SELECT id, organization_id, user_id,
  CASE WHEN role IN ('owner', 'admin', 'member') THEN role ELSE 'member' END,
  status, created_at, updated_at
FROM {{RUNORY_TABLE_PREFIX}}organization_memberships;

DROP TABLE {{RUNORY_TABLE_PREFIX}}organization_memberships;
ALTER TABLE {{RUNORY_TABLE_PREFIX}}organization_memberships_new RENAME TO {{RUNORY_TABLE_PREFIX}}organization_memberships;

CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_org_memberships_user_v2
  ON {{RUNORY_TABLE_PREFIX}}organization_memberships(user_id, status);

-- ── Step 4: Add request_id to audit_logs ──

ALTER TABLE {{RUNORY_TABLE_PREFIX}}audit_logs ADD COLUMN request_id TEXT;
CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_audit_logs_request
  ON {{RUNORY_TABLE_PREFIX}}audit_logs(request_id);
CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_audit_logs_workspace_created
  ON {{RUNORY_TABLE_PREFIX}}audit_logs(workspace_id, created_at);

-- ── Step 5: Add status lifecycle to workspaces ──

ALTER TABLE {{RUNORY_TABLE_PREFIX}}workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE {{RUNORY_TABLE_PREFIX}}workspaces ADD COLUMN archived_at TEXT;
ALTER TABLE {{RUNORY_TABLE_PREFIX}}workspaces ADD COLUMN pending_deletion_at TEXT;
ALTER TABLE {{RUNORY_TABLE_PREFIX}}workspaces ADD COLUMN purged_at TEXT;
