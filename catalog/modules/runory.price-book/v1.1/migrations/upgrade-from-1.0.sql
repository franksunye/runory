-- Upgrade migration: runory.price-book 1.0.0 → 1.1.0
-- Adds the price_book_item business table for per-product/service pricing
-- lines within a price book, plus supporting indexes.
--
-- NOTE: Uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS so the
-- statements are idempotent and safe to re-run. The migration framework still
-- tracks the 1.0.0 → 1.1.0 transition to avoid duplicate execution.
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
