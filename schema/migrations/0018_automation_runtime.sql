-- 0018_automation_runtime.sql
-- Automation Runtime tables (v0.3.5: Agent Operations, Workflow, And Automation MVP)
-- Stores automation definitions (trigger -> conditions -> actions) and run history.
-- Automations are workspace-scoped and may be enabled/disabled without deletion.

-- ── Automation Definitions (workspace-scoped trigger/action rules) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}automation_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_run_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, automation_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_definitions_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}automation_definitions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automation_definitions_enabled
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}automation_definitions(workspace_id, enabled);

-- ── Automation Runs (execution history) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}automation_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_payload_json TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  actions_taken_json TEXT NOT NULL DEFAULT '[]',
  dry_run INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}automation_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}automation_runs(workspace_id, automation_id);
