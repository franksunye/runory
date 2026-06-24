-- 0021_pack_permission_groups.sql
-- v0.3.6: Pack-aware permission groups
-- Allows packs to declare permission groups that can be assigned to workspace members.

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  group_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, pack_id, group_key)
);

CREATE INDEX IF NOT EXISTS idx_pack_permission_groups_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups(workspace_id);

-- Member assignments to permission groups
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_assignments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  assigned_by TEXT,
  assigned_at TEXT NOT NULL,
  UNIQUE(workspace_id, group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pack_permission_assignments_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_assignments(workspace_id);

CREATE INDEX IF NOT EXISTS idx_pack_permission_assignments_user
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_assignments(user_id);
