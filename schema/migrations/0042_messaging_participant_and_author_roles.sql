-- 0042_messaging_participant_and_author_roles.sql
-- Transaction: required
-- 0041 is immutable once applied. SQLite cannot alter CHECK constraints, so
-- rebuild only the two messaging tables whose permitted values evolved.

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}conversation_participants RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}conversation_participants_0041;

CREATE TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}conversation_participants (
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

INSERT INTO {{RUNORY_RUNTIME_TABLE_PREFIX}}conversation_participants (id, workspace_id, conversation_id, participant_type, participant_id, address, display_name, role, created_at)
SELECT id, workspace_id, conversation_id, participant_type, participant_id, address, display_name,
  CASE WHEN role = 'observer' THEN 'observer' ELSE 'participant' END, created_at
FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}conversation_participants_0041;

DROP TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}conversation_participants_0041;
CREATE INDEX idx_conversation_participants_conversation ON {{RUNORY_RUNTIME_TABLE_PREFIX}}conversation_participants(workspace_id, conversation_id);

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}messages RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}messages_0041;

CREATE TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}messages (
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

INSERT INTO {{RUNORY_RUNTIME_TABLE_PREFIX}}messages (id, workspace_id, conversation_id, notification_id, direction, channel, author_type, author_id, subject, body_text, body_html, provider, external_id, created_at)
SELECT id, workspace_id, conversation_id, notification_id, direction, channel, author_type, author_id, subject, body_text, body_html, provider, external_id, created_at
FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}messages_0041;

DROP TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}messages_0041;
CREATE INDEX idx_messages_conversation ON {{RUNORY_RUNTIME_TABLE_PREFIX}}messages(workspace_id, conversation_id, created_at ASC);
CREATE INDEX idx_messages_notification ON {{RUNORY_RUNTIME_TABLE_PREFIX}}messages(workspace_id, notification_id);
