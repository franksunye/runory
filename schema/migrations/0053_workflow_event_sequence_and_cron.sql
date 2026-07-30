-- 0053_workflow_event_sequence_and_cron.sql
-- Workflow event sequence allocator + dedupe_key + cron lease table
--
-- Per architectural decision:
--   1. Replace SELECT MAX(sequence)+1 with a per-instance counter column.
--   2. Add dedupe_key to workflow_events for idempotent timer processing.
--   3. Add scheduled_job_leases table for distributed cron coordination.

-- ── 1. next_event_sequence on workflow_instances ──
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances
  ADD COLUMN next_event_sequence INTEGER NOT NULL DEFAULT 1;

-- Backfill: set next_event_sequence to MAX(sequence)+1 for existing instances
-- that already have events. New instances start at 1 (the DEFAULT), which is
-- correct for instances that have no events yet (their first event will be
-- sequence 1). For instances with existing events, next_event_sequence must
-- be set to MAX(sequence)+1 so the next appended event doesn't collide with
-- an existing sequence number.
UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances
SET next_event_sequence = (
  SELECT COALESCE(MAX(e.sequence), 0) + 1
  FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_events e
  WHERE e.instance_id = {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances.id
)
WHERE EXISTS (
  SELECT 1 FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_events e
  WHERE e.instance_id = {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_instances.id
);

-- ── 2. dedupe_key on workflow_events ──
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_events
  ADD COLUMN dedupe_key TEXT;

-- Unique index on dedupe_key (NULL values are allowed and not constrained,
-- per SQLite's handling of NULL in unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_events_dedupe_key
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workflow_events(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ── 3. scheduled_job_leases for distributed cron coordination ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}scheduled_job_leases (
  job_key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  lease_until TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);
