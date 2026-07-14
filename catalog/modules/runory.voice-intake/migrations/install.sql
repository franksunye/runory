CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_call_provider_identity
ON business_voice_call(workspace_id, provider, provider_call_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_provider_resource
ON business_voice_provider_reference(workspace_id, provider, resource_type, provider_resource_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_intake_call
ON business_voice_intake_session(workspace_id, voice_call_id);

CREATE TABLE IF NOT EXISTS voice_intake_idempotency (
  workspace_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS voice_intake_provider_events (
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_call_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  sequence_number INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL,
  payload_json TEXT,
  PRIMARY KEY (workspace_id, provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_events_call
ON voice_intake_provider_events(workspace_id, provider, provider_call_id);

CREATE TABLE IF NOT EXISTS voice_intake_slot_tokens (
  workspace_id TEXT NOT NULL,
  token TEXT NOT NULL PRIMARY KEY,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  subject_key TEXT,
  created_at TEXT NOT NULL
);
