-- runory.conversation v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}conversation (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  author_type TEXT NOT NULL DEFAULT 'agent',
  author_name TEXT,
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'comment',
  is_internal INTEGER DEFAULT 0,
  attachments_json TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_conversation_workspace ON {{BUSINESS_TABLE_PREFIX}}conversation(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_conversation_ticket ON {{BUSINESS_TABLE_PREFIX}}conversation(workspace_id, ticket_id);
CREATE INDEX IF NOT EXISTS idx_business_conversation_type ON {{BUSINESS_TABLE_PREFIX}}conversation(workspace_id, message_type);
