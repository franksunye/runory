-- runory.citation-source v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}citation_source (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  answer_block_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  source_type TEXT DEFAULT 'web',
  snippet TEXT,
  credibility_score REAL,
  captured_at TEXT,
  author TEXT,
  publisher TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_citation_source_workspace ON {{BUSINESS_TABLE_PREFIX}}citation_source(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_citation_source_answer_block ON {{BUSINESS_TABLE_PREFIX}}citation_source(workspace_id, answer_block_id);
CREATE INDEX IF NOT EXISTS idx_business_citation_source_type ON {{BUSINESS_TABLE_PREFIX}}citation_source(workspace_id, source_type);
