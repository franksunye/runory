-- 0008_business_tables_cloud.sql
-- Pre-creates shared business tables for Cloud deployment mode.
-- In Cloud mode, these tables are created once at deploy time (not per-workspace install).
-- Module installation in Cloud mode only registers metadata (object/field/view definitions).
--
-- Note: Uses {{BUSINESS_TABLE_PREFIX}} placeholder for business table prefix isolation.
-- Default business table prefix is "runory_business_" (e.g., "runory_business_customer", "runory_business_contact").
-- Three-tier architecture: platform_ (SaaS Core) / runory_runtime_ (reserved) / runory_business_ (business data).

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}customer (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_customer_workspace ON {{BUSINESS_TABLE_PREFIX}}customer(workspace_id);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}contact (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Composite FK ensures contact can only reference a customer in the SAME workspace
  FOREIGN KEY (workspace_id, customer_id) REFERENCES {{BUSINESS_TABLE_PREFIX}}customer(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_contact_workspace ON {{BUSINESS_TABLE_PREFIX}}contact(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contact_customer ON {{BUSINESS_TABLE_PREFIX}}contact(workspace_id, customer_id);
