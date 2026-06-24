-- runory.answer-block v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}answer_block (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  question_map_id TEXT NOT NULL,
  entity_profile_id TEXT,
  question TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  source_type TEXT DEFAULT 'manual',
  landing_page_id TEXT,
  confidence_score REAL,
  locale TEXT DEFAULT 'zh-CN',
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_answer_block_workspace ON {{BUSINESS_TABLE_PREFIX}}answer_block(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_answer_block_status ON {{BUSINESS_TABLE_PREFIX}}answer_block(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_answer_block_question_map ON {{BUSINESS_TABLE_PREFIX}}answer_block(workspace_id, question_map_id);
CREATE INDEX IF NOT EXISTS idx_business_answer_block_entity ON {{BUSINESS_TABLE_PREFIX}}answer_block(workspace_id, entity_profile_id);
CREATE INDEX IF NOT EXISTS idx_business_answer_block_landing_page ON {{BUSINESS_TABLE_PREFIX}}answer_block(workspace_id, landing_page_id);
