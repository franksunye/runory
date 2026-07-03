-- 0022_command_runtime.sql
-- v0.5 Command Runtime: command executions, domain events, outbox messages
-- Per v0.5 Commercial FSM Technical Specification §5.3

-- ── Command Executions (idempotency table) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  result_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(workspace_id, command_id)
);

CREATE INDEX IF NOT EXISTS idx_cmd_exec_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions(workspace_id);

-- ── Domain Events (append-only) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}domain_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_events_agg
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}domain_events(workspace_id, aggregate_type, aggregate_id);

-- ── Outbox Messages (at-least-once delivery) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages(workspace_id, status);
