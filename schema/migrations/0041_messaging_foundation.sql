-- 0041_messaging_foundation.sql
-- Canonical customer communication model. Outbox remains execution infrastructure;
-- conversations, notifications, messages and deliveries are product facts.

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  contact_id TEXT,
  work_order_id TEXT,
  service_site_id TEXT,
  voice_call_id TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','archived')),
  owner_user_id TEXT,
  last_message_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_activity ON {{RUNORY_RUNTIME_TABLE_PREFIX}}conversations(workspace_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_work_order ON {{RUNORY_RUNTIME_TABLE_PREFIX}}conversations(workspace_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON {{RUNORY_RUNTIME_TABLE_PREFIX}}conversations(workspace_id, contact_id);

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}conversation_participants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('contact','user','agent','system','external')),
  participant_id TEXT,
  address TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant','observer')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON {{RUNORY_RUNTIME_TABLE_PREFIX}}conversation_participants(workspace_id, conversation_id);

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  source_type TEXT,
  source_id TEXT,
  conversation_id TEXT,
  contact_id TEXT,
  work_order_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_status ON {{RUNORY_RUNTIME_TABLE_PREFIX}}notifications(workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  notification_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound','system')),
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','voice','web','internal')),
  author_type TEXT NOT NULL CHECK (author_type IN ('contact','user','agent','system','external')),
  author_id TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  provider TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON {{RUNORY_RUNTIME_TABLE_PREFIX}}messages(workspace_id, conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_notification ON {{RUNORY_RUNTIME_TABLE_PREFIX}}messages(workspace_id, notification_id);

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}message_deliveries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','voice','web','internal')),
  provider TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','delivered','failed','bounced','suppressed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  last_error TEXT,
  accepted_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_message_deliveries_status ON {{RUNORY_RUNTIME_TABLE_PREFIX}}message_deliveries(workspace_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_message_deliveries_message ON {{RUNORY_RUNTIME_TABLE_PREFIX}}message_deliveries(workspace_id, message_id);
