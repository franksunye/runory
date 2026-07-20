-- Durable Outbox delivery lifecycle for v0.6 Foundation reliability.
-- Transaction: required

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages
  ADD COLUMN next_attempt_at TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages
  ADD COLUMN last_attempt_at TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages
  ADD COLUMN locked_at TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages
  ADD COLUMN correlation_id TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages
  ADD COLUMN updated_at TEXT;

UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages
SET next_attempt_at = COALESCE(next_attempt_at, created_at),
    updated_at = COALESCE(updated_at, created_at);

CREATE INDEX IF NOT EXISTS idx_outbox_delivery_due
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages(
    workspace_id, status, next_attempt_at, created_at
  );

CREATE INDEX IF NOT EXISTS idx_outbox_correlation
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}outbox_messages(workspace_id, correlation_id);
