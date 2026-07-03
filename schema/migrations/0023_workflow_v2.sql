-- 0023_workflow_v2.sql
-- v0.5 Workflow V2: versioned definitions, pinned instances, append-only events,
-- work items, approval decisions, workflow timers
-- Per v0.5 Commercial FSM Technical Specification §5.4-5.5

-- ── Workflow Definitions (stable identity) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_definitions_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workflow_key TEXT NOT NULL,
  name TEXT NOT NULL,
  target_object TEXT NOT NULL,
  active_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, workflow_key)
);

CREATE INDEX IF NOT EXISTS idx_wf_def_v2_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_definitions_v2(workspace_id);

CREATE INDEX IF NOT EXISTS idx_wf_def_v2_target
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_definitions_v2(workspace_id, target_object);

-- ── Workflow Definition Versions (immutable once published) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_definition_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  definition_json TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '2.0',
  published_by TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workflow_definition_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_wf_def_ver_def
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_definition_versions(workflow_definition_id);

-- ── Workflow Instances (pinned to definition version) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL,
  definition_version_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  current_step_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  started_by TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wf_inst_v2_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances_v2(workspace_id);

CREATE INDEX IF NOT EXISTS idx_wf_inst_v2_record
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances_v2(workspace_id, object_type, record_id);

-- ── Workflow Events (append-only) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  step_id TEXT,
  actor_type TEXT,
  actor_id TEXT,
  payload_json TEXT,
  occurred_at TEXT NOT NULL,
  UNIQUE(instance_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_wf_events_inst
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_events(workspace_id, instance_id);

-- ── Work Items ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}work_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  subject_type TEXT,
  subject_id TEXT,
  assignee_type TEXT,
  assignee_id TEXT,
  candidate_rule_json TEXT,
  due_at TEXT,
  claimed_by TEXT,
  claimed_at TEXT,
  completed_at TEXT,
  form_binding_id TEXT,
  input_snapshot_json TEXT,
  input_snapshot_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_items_assignee
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}work_items(workspace_id, status, assignee_type, assignee_id, due_at);

CREATE INDEX IF NOT EXISTS idx_work_items_subject
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}work_items(workspace_id, subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_work_items_instance
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}work_items(workspace_id, instance_id, step_id);

-- ── Approval Decisions (immutable, one terminal decision per work_item) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}approval_decisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  comment TEXT,
  decision_payload_json TEXT,
  input_snapshot_hash TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(work_item_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_wi
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}approval_decisions(workspace_id, work_item_id);

-- ── Workflow Timers ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_timers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  work_item_id TEXT,
  timer_type TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  payload_json TEXT,
  fired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wf_timers_due
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_timers(workspace_id, status, due_at);
