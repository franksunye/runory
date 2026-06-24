-- runory.question-map v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}question_map (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT DEFAULT 'manual',
  questions_json TEXT,
  question_count INTEGER DEFAULT 0,
  locale TEXT DEFAULT 'zh-CN',
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_question_map_workspace ON {{BUSINESS_TABLE_PREFIX}}question_map(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_question_map_status ON {{BUSINESS_TABLE_PREFIX}}question_map(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_question_map_entity ON {{BUSINESS_TABLE_PREFIX}}question_map(workspace_id, entity_profile_id);
