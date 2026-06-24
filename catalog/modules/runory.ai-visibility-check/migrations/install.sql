-- runory.ai-visibility-check v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}ai_visibility_check (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_profile_id TEXT NOT NULL,
  query TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'chatgpt',
  locale TEXT DEFAULT 'zh-CN',
  result_status TEXT NOT NULL DEFAULT 'not_checked',
  result_summary TEXT,
  result_snippet TEXT,
  improvement_suggestions TEXT,
  checked_at TEXT,
  checked_by TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_ai_visibility_check_workspace ON {{BUSINESS_TABLE_PREFIX}}ai_visibility_check(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_ai_visibility_check_status ON {{BUSINESS_TABLE_PREFIX}}ai_visibility_check(workspace_id, result_status);
CREATE INDEX IF NOT EXISTS idx_business_ai_visibility_check_engine ON {{BUSINESS_TABLE_PREFIX}}ai_visibility_check(workspace_id, engine);
CREATE INDEX IF NOT EXISTS idx_business_ai_visibility_check_entity ON {{BUSINESS_TABLE_PREFIX}}ai_visibility_check(workspace_id, entity_profile_id);
