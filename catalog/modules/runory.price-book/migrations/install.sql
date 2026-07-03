-- runory.price-book v1.1.0 install migration
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

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}price_book_item (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  price_book_id TEXT NOT NULL,
  product_service_id TEXT,
  list_price REAL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  effective_from TEXT,
  effective_to TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_price_book_item_workspace ON {{BUSINESS_TABLE_PREFIX}}price_book_item(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_price_book_item_book ON {{BUSINESS_TABLE_PREFIX}}price_book_item(workspace_id, price_book_id);
CREATE INDEX IF NOT EXISTS idx_business_price_book_item_product ON {{BUSINESS_TABLE_PREFIX}}price_book_item(workspace_id, product_service_id);
