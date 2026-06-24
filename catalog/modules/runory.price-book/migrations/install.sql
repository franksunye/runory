-- runory.price-book v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}price_book (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  active INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT,
  effective_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_price_book_workspace ON {{BUSINESS_TABLE_PREFIX}}price_book(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_price_book_active ON {{BUSINESS_TABLE_PREFIX}}price_book(workspace_id, active);
