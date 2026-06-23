-- 0012_workflow_runtime.sql
-- Workflow Runtime tables (per docs/06 §7: Approval Workflows)
-- Stores workflow definitions (state machines) and per-record workflow instances
-- with full transition history.

-- ── Workflow Definitions (workspace-scoped state machines) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_object TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, workflow_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_definitions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_target
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_definitions(workspace_id, target_object);

-- ── Workflow Instances (per-record workflow state) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  current_state TEXT NOT NULL,
  history_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_record
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances(workspace_id, object_type, record_id);
