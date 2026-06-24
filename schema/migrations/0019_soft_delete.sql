-- 0019_soft_delete.sql
-- Soft delete support for key business objects (v0.3.6)
-- Instead of hard-deleting records, we mark them as deleted with a timestamp.
-- This allows restore and audit traceability.
-- The soft-delete columns are added to all business tables that have data.

-- Tolerant: true
-- Business tables are created dynamically by pack installations, so they may
-- not exist in fresh databases. This flag lets the migration runner skip
-- "no such table" errors for ALTER TABLE / CREATE INDEX statements.

-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN,
-- so we use a procedural approach. Each business table gets:
--   deleted_at TEXT (NULL = active, non-NULL = soft-deleted)
--   deleted_by TEXT (actor who deleted)

-- We add these columns to the core business tables. New tables created by
-- pack installations should also include these columns going forward.

-- CRM Lite Pack tables
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_company ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_company ADD COLUMN deleted_by TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_contact ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_contact ADD COLUMN deleted_by TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_deal ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_deal ADD COLUMN deleted_by TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_task ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_task ADD COLUMN deleted_by TEXT;

-- FSM Pack tables
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_work_order ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_work_order ADD COLUMN deleted_by TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_service_site ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_service_site ADD COLUMN deleted_by TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_asset ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_asset ADD COLUMN deleted_by TEXT;

-- Sales Quote Pack tables
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_quote ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_quote ADD COLUMN deleted_by TEXT;

-- Customer Service Pack tables
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_ticket ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_ticket ADD COLUMN deleted_by TEXT;

-- Marketing Capture Pack tables
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_form_submission ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_form_submission ADD COLUMN deleted_by TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_landing_page ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_landing_page ADD COLUMN deleted_by TEXT;

-- AI Visibility Pack tables
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_answer_block ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_answer_block ADD COLUMN deleted_by TEXT;

-- After-sales Pack tables
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_warranty ADD COLUMN deleted_at TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}business_warranty ADD COLUMN deleted_by TEXT;

-- Create indexes for efficient soft-delete queries
CREATE INDEX IF NOT EXISTS idx_business_company_deleted ON {{RUNORY_RUNTIME_TABLE_PREFIX}}business_company(workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_business_contact_deleted ON {{RUNORY_RUNTIME_TABLE_PREFIX}}business_contact(workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_business_deal_deleted ON {{RUNORY_RUNTIME_TABLE_PREFIX}}business_deal(workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_business_task_deleted ON {{RUNORY_RUNTIME_TABLE_PREFIX}}business_task(workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_business_work_order_deleted ON {{RUNORY_RUNTIME_TABLE_PREFIX}}business_work_order(workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_business_quote_deleted ON {{RUNORY_RUNTIME_TABLE_PREFIX}}business_quote(workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_business_ticket_deleted ON {{RUNORY_RUNTIME_TABLE_PREFIX}}business_ticket(workspace_id, deleted_at);
