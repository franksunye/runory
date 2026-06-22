-- Runory Cloud POC Schema (SSOT)
-- Prefix placeholder: {{RUNORY_TABLE_PREFIX}} (default: runory_)
-- All CREATE statements use IF NOT EXISTS for idempotent initialization.

-- ── Platform Tables ──

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}users (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, user_id),
  FOREIGN KEY(organization_id) REFERENCES {{RUNORY_TABLE_PREFIX}}organizations(id),
  FOREIGN KEY(user_id) REFERENCES {{RUNORY_TABLE_PREFIX}}users(id)
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  template_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}workspace_tenants (
  workspace_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES {{RUNORY_TABLE_PREFIX}}workspaces(id),
  FOREIGN KEY(organization_id) REFERENCES {{RUNORY_TABLE_PREFIX}}organizations(id)
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}workspace_memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, user_id),
  FOREIGN KEY(workspace_id) REFERENCES {{RUNORY_TABLE_PREFIX}}workspaces(id),
  FOREIGN KEY(user_id) REFERENCES {{RUNORY_TABLE_PREFIX}}users(id)
);

CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_org_memberships_user
  ON {{RUNORY_TABLE_PREFIX}}organization_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_workspace_memberships_user
  ON {{RUNORY_TABLE_PREFIX}}workspace_memberships(user_id, status);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}installations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  module_version TEXT NOT NULL,
  pack_id TEXT,
  status TEXT NOT NULL DEFAULT 'installed',
  installed_at TEXT NOT NULL,
  UNIQUE(workspace_id, module_id)
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}object_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  label TEXT NOT NULL,
  module_id TEXT,
  ownership TEXT NOT NULL DEFAULT 'module_owned',
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, object_key)
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}field_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  ownership TEXT NOT NULL DEFAULT 'module_owned',
  required INTEGER NOT NULL DEFAULT 0,
  default_value TEXT,
  validation_json TEXT,
  module_id TEXT,
  extension_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, object_key, field_key)
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}view_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  view_key TEXT NOT NULL,
  view_type TEXT NOT NULL,
  label TEXT NOT NULL,
  config_json TEXT NOT NULL,
  module_id TEXT,
  extension_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, object_key, view_key)
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}navigation_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  label TEXT NOT NULL,
  route TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'file',
  sort_order INTEGER NOT NULL DEFAULT 100,
  module_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}extension_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  namespace TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}extension_versions (
  id TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  diff_json TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low',
  change_summary TEXT,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  applied_at TEXT,
  rollback_of_version INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(extension_id, version)
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  extension_version_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}agent_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  status TEXT NOT NULL,
  extension_version_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}extension_field_values (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  extension_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, object_key, record_id, field_key)
);

-- ── Business Tables (created by module migrations) ──
-- These are created dynamically by the installer when a module is installed.
-- The installer reads the module's migrations/install.sql and executes it.
-- Business tables do NOT use the runory_ prefix — they use the object key directly
-- (e.g., "customer", "contact") to allow natural SQL queries.
-- If isolation is needed, set RUNORY_BUSINESS_TABLE_PREFIX env var.
