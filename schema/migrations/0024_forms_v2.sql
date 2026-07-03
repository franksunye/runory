-- 0024_forms_v2.sql
-- v0.5 Forms 2.0: versioned form definitions, typed bindings, immutable submissions,
-- and attachments (evidence blocks). Service reports are projected from accepted
-- form submissions rather than stored as a separate runtime concern.
-- Per v0.5 Commercial FSM Technical Specification §5.6

-- ── Form Definitions (stable identity, with active version pointer) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}form_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  form_key TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | active | retired
  active_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, form_key)
);

CREATE INDEX IF NOT EXISTS idx_form_definitions_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}form_definitions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_form_definitions_status
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}form_definitions(workspace_id, status);

-- ── Form Definition Versions (immutable, versioned schema + layout) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}form_definition_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  form_definition_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  schema_json TEXT NOT NULL,  -- blocks: header, field, checklist, evidence, signature
  layout_json TEXT,           -- optional layout config
  published_by TEXT,
  published_at TEXT NOT NULL,
  UNIQUE(form_definition_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_form_def_versions_def
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}form_definition_versions(form_definition_id);

-- ── Form Bindings (bind a form to a usage context) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}form_bindings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  form_definition_id TEXT NOT NULL,
  usage_type TEXT NOT NULL,    -- workflow_step | record_action | public_endpoint | service_deliverable | marketing_capture
  usage_key TEXT,              -- e.g. "visit.checklist" or "contact_us"
  label_override TEXT,
  timing_json TEXT,            -- when form should appear (before/after step, etc.)
  requirement_policy TEXT NOT NULL DEFAULT 'optional',  -- optional | required
  target_mapping_json TEXT,    -- maps form fields to target object fields
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_form_bindings_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}form_bindings(workspace_id);

CREATE INDEX IF NOT EXISTS idx_form_bindings_usage
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}form_bindings(workspace_id, usage_type, usage_key);

-- ── Form Submissions (immutable, revisioned) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}form_submissions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  form_definition_id TEXT NOT NULL,
  form_version_id TEXT NOT NULL,
  binding_id TEXT,
  subject_type TEXT,           -- quote, work_order, service_visit, etc.
  subject_id TEXT,
  work_item_id TEXT,
  revision_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | submitted | accepted | returned | void
  answers_json TEXT NOT NULL,  -- the submitted answers
  submitted_by TEXT,
  submitted_at TEXT,
  accepted_by TEXT,
  accepted_at TEXT,
  return_reason TEXT,
  supersedes_submission_id TEXT,  -- for returned -> new revision chain
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}form_submissions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_form_submissions_subject
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}form_submissions(workspace_id, subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_form_submissions_work_item
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}form_submissions(workspace_id, work_item_id);

CREATE INDEX IF NOT EXISTS idx_form_submissions_status
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}form_submissions(workspace_id, status);

-- ── Attachments (referenced by evidence blocks) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_type TEXT NOT NULL,    -- form_submission | evidence_block | etc.
  owner_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,   -- file path or key in storage
  file_name TEXT NOT NULL,
  content_type TEXT,
  byte_size INTEGER,
  sha256 TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_attachments_owner
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments(workspace_id, owner_type, owner_id);
