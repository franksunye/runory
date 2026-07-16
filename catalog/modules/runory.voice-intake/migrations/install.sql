CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}voice_call (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_call_id TEXT NOT NULL,
  provider_phone_id TEXT,
  caller_phone TEXT NOT NULL,
  callee_phone TEXT,
  status TEXT NOT NULL DEFAULT 'initiated',
  started_at TEXT,
  answered_at TEXT,
  ended_at TEXT,
  duration_seconds INTEGER,
  transcript_text TEXT,
  summary TEXT,
  recording_reference TEXT,
  primary_intent TEXT,
  outcome TEXT DEFAULT 'pending',
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  work_order_id TEXT,
  service_visit_id TEXT,
  contact_id TEXT,
  service_site_id TEXT,
  last_event_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}voice_intake_session (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  voice_call_id TEXT NOT NULL,
  schema_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting',
  confirmed_values_json TEXT,
  inferred_values_json TEXT,
  missing_fields_json TEXT,
  conflicts_json TEXT,
  warnings_json TEXT,
  confirmation_state TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}voice_provider_reference (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  provider_resource_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  configuration_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}voice_follow_up (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  voice_call_id TEXT NOT NULL,
  contact_id TEXT,
  work_order_id TEXT,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL,
  callback_window TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_call_provider_identity
ON {{BUSINESS_TABLE_PREFIX}}voice_call(workspace_id, provider, provider_call_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_provider_resource
ON {{BUSINESS_TABLE_PREFIX}}voice_provider_reference(workspace_id, provider, resource_type, provider_resource_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_intake_call
ON {{BUSINESS_TABLE_PREFIX}}voice_intake_session(workspace_id, voice_call_id);

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
