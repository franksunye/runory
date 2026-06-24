-- runory.knowledge v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}knowledge (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  tags_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  views INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  author TEXT,
  published_at TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_knowledge_workspace ON {{BUSINESS_TABLE_PREFIX}}knowledge(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_knowledge_status ON {{BUSINESS_TABLE_PREFIX}}knowledge(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_knowledge_category ON {{BUSINESS_TABLE_PREFIX}}knowledge(workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_business_knowledge_slug ON {{BUSINESS_TABLE_PREFIX}}knowledge(workspace_id, slug);
