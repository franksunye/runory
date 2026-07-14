-- v0.5.3 FSM execution runtime
-- A visit is not merely a dated record. Dispatch creates a durable execution
-- item and snapshots every required deliverable that must be satisfied before
-- the visit can be completed. This keeps My Work, Planning and completion
-- validation on the same operational facts.

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}visit_execution_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  schedule_entry_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready', -- ready | active | completed | cancelled
  due_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, visit_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_execution_items_assignee
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}visit_execution_items(workspace_id, resource_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_visit_execution_items_visit
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}visit_execution_items(workspace_id, visit_id);

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}visit_execution_requirements (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  form_definition_id TEXT NOT NULL,
  form_version_id TEXT NOT NULL,
  label TEXT NOT NULL,
  requirement_policy TEXT NOT NULL DEFAULT 'required',
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, visit_id, binding_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_execution_requirements_visit
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}visit_execution_requirements(workspace_id, visit_id);
