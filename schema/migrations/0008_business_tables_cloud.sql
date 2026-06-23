-- 0008_business_tables_cloud.sql
-- Pre-creates shared business tables for Cloud deployment mode.
-- In Cloud mode, these tables are created once at deploy time (not per-workspace install).
-- Module installation in Cloud mode only registers metadata (object/field/view definitions).
--
-- v0.2.2 update: CRM object model corrected — customer is deprecated, replaced by
-- company/contact/deal/task as module-owned business objects. These tables match
-- the schemas defined by runory.company, runory.contact (v2), runory.deal, and
-- runory.task (v2) module migrations.
--
-- Note: Uses {{BUSINESS_TABLE_PREFIX}} placeholder for business table prefix isolation.
-- Default business table prefix is "runory_business_" (e.g., "runory_business_company").

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}company (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  website TEXT,
  phone TEXT,
  industry TEXT,
  size TEXT,
  source TEXT,
  owner TEXT,
  lifecycle_stage TEXT NOT NULL DEFAULT 'lead',
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_company_workspace ON {{BUSINESS_TABLE_PREFIX}}company(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_company_stage ON {{BUSINESS_TABLE_PREFIX}}company(workspace_id, lifecycle_stage);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}contact (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  role TEXT,
  primary_company_id TEXT,
  source TEXT,
  owner TEXT,
  lifecycle_stage TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_contact_workspace ON {{BUSINESS_TABLE_PREFIX}}contact(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contact_company ON {{BUSINESS_TABLE_PREFIX}}contact(workspace_id, primary_company_id);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}deal (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  amount REAL,
  currency TEXT DEFAULT 'CNY',
  expected_close_date TEXT,
  probability REAL,
  company_id TEXT,
  primary_contact_id TEXT,
  owner TEXT,
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_deal_workspace ON {{BUSINESS_TABLE_PREFIX}}deal(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_deal_stage ON {{BUSINESS_TABLE_PREFIX}}deal(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_business_deal_company ON {{BUSINESS_TABLE_PREFIX}}deal(workspace_id, company_id);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}task (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  due_date TEXT,
  assignee TEXT,
  company_id TEXT,
  contact_id TEXT,
  deal_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_task_workspace ON {{BUSINESS_TABLE_PREFIX}}task(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_task_status ON {{BUSINESS_TABLE_PREFIX}}task(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_task_company ON {{BUSINESS_TABLE_PREFIX}}task(workspace_id, company_id);
