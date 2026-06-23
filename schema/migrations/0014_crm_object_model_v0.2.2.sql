-- 0014_crm_object_model_v0.2.2.sql
-- v0.2.2: CRM object model correction — migrate existing DBs to new schema.
-- On DBs created before v0.2.2, migration 0008 created the contact table with
-- customer_id (NOT NULL, FK to customer) and 0011 preserved that schema. This
-- migration brings those DBs in line with the v0.2.2 module-owned schemas:
--   - Creates company and deal tables (new in v0.2.2)
--   - Recreates contact table with primary_company_id (nullable, no FK)
--   - Recreates task table with company_id + contact_id + deal_id
--   - Clears old module installations so the next pack install refreshes
--     object/field/view definitions (contact v1 → v2, task v1 → v2, etc.)
-- On fresh installs (where 0008 already created the new schemas), this
-- migration is a safe no-op: tables are recreated identically and the DELETE
-- statements affect zero rows.
-- Transaction: required

-- ── Company table (new in v0.2.2) ──
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

-- ── Deal table (new in v0.2.2) ──
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

-- ── Contact table migration (customer_id → primary_company_id) ──
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}contact RENAME TO {{BUSINESS_TABLE_PREFIX}}contact_legacy_0014;

CREATE TABLE {{BUSINESS_TABLE_PREFIX}}contact (
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

INSERT INTO {{BUSINESS_TABLE_PREFIX}}contact
  (id, workspace_id, name, email, phone, role, created_at, updated_at)
SELECT id, workspace_id, name, email, phone, role, created_at, updated_at
FROM {{BUSINESS_TABLE_PREFIX}}contact_legacy_0014;

DROP TABLE {{BUSINESS_TABLE_PREFIX}}contact_legacy_0014;

CREATE INDEX IF NOT EXISTS idx_contact_workspace ON {{BUSINESS_TABLE_PREFIX}}contact(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contact_company ON {{BUSINESS_TABLE_PREFIX}}contact(workspace_id, primary_company_id);

-- ── Task table migration (customer_id → company_id + contact_id + deal_id) ──
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}task RENAME TO {{BUSINESS_TABLE_PREFIX}}task_legacy_0014;

CREATE TABLE {{BUSINESS_TABLE_PREFIX}}task (
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

INSERT INTO {{BUSINESS_TABLE_PREFIX}}task
  (id, workspace_id, title, description, status, priority, due_date, assignee, created_at, updated_at)
SELECT id, workspace_id, title, description, status, priority, due_date, assignee, created_at, updated_at
FROM {{BUSINESS_TABLE_PREFIX}}task_legacy_0014;

DROP TABLE {{BUSINESS_TABLE_PREFIX}}task_legacy_0014;

CREATE INDEX IF NOT EXISTS idx_business_task_workspace ON {{BUSINESS_TABLE_PREFIX}}task(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_task_status ON {{BUSINESS_TABLE_PREFIX}}task(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_task_company ON {{BUSINESS_TABLE_PREFIX}}task(workspace_id, company_id);

-- ── Clear old module installations and definitions ──
-- This forces the next pack install to re-register object/field/view
-- definitions with the v2 schemas (primary_company_id, company_id, etc.)
DELETE FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}installations
  WHERE module_id IN ('runory.contact', 'runory.task', 'runory.customer');

DELETE FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}object_definitions
  WHERE module_id IN ('runory.contact', 'runory.task', 'runory.customer');

DELETE FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}field_definitions
  WHERE module_id IN ('runory.contact', 'runory.task', 'runory.customer');

DELETE FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}view_definitions
  WHERE module_id IN ('runory.contact', 'runory.task', 'runory.customer');

DELETE FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}navigation_items
  WHERE module_id IN ('runory.contact', 'runory.task', 'runory.customer');
