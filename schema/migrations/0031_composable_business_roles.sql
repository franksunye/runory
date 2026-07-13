-- Stable workspace business roles composed from installed Pack contributions.

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups ADD COLUMN business_role_key TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups ADD COLUMN business_role_label TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups ADD COLUMN business_role_description TEXT;

UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups
SET business_role_key = CASE
      WHEN pack_id = 'crm-lite-pack' AND group_key = 'sales_admin' THEN 'sales_manager'
      WHEN pack_id = 'crm-lite-pack' AND group_key = 'sales_agent' THEN 'sales_representative'
      WHEN pack_id = 'crm-lite-pack' AND group_key = 'sales_viewer' THEN 'sales_viewer'
      WHEN pack_id = 'sales-quote-pack' AND group_key IN ('sales_manager', 'sales_representative') THEN group_key
      WHEN pack_id = 'fsm-pack' AND group_key IN ('dispatcher', 'field_technician', 'service_supervisor') THEN group_key
      ELSE pack_id || ':' || group_key
    END,
    business_role_label = CASE
      WHEN (pack_id = 'crm-lite-pack' AND group_key = 'sales_admin') OR (pack_id = 'sales-quote-pack' AND group_key = 'sales_manager') THEN 'Sales Manager'
      WHEN (pack_id = 'crm-lite-pack' AND group_key = 'sales_agent') OR (pack_id = 'sales-quote-pack' AND group_key = 'sales_representative') THEN 'Sales Representative'
      ELSE label
    END,
    business_role_description = CASE
      WHEN (pack_id = 'crm-lite-pack' AND group_key = 'sales_admin') OR (pack_id = 'sales-quote-pack' AND group_key = 'sales_manager') THEN 'Leads the commercial team across CRM, quotes, and approvals'
      WHEN (pack_id = 'crm-lite-pack' AND group_key = 'sales_agent') OR (pack_id = 'sales-quote-pack' AND group_key = 'sales_representative') THEN 'Manages customers, opportunities, and commercial proposals'
      ELSE description
    END
WHERE group_key != 'workspace_administrator';

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}business_role_assignments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  assigned_by TEXT,
  assigned_at TEXT NOT NULL,
  UNIQUE(workspace_id, role_key, user_id)
);
CREATE INDEX IF NOT EXISTS idx_business_role_assignments_workspace ON {{RUNORY_RUNTIME_TABLE_PREFIX}}business_role_assignments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_role_assignments_user ON {{RUNORY_RUNTIME_TABLE_PREFIX}}business_role_assignments(user_id);

INSERT OR IGNORE INTO {{RUNORY_RUNTIME_TABLE_PREFIX}}business_role_assignments
  (id, workspace_id, role_key, user_id, assigned_by, assigned_at)
SELECT 'bra_' || ppa.id, ppa.workspace_id,
       COALESCE(ppg.business_role_key, ppg.pack_id || ':' || ppg.group_key),
       ppa.user_id, ppa.assigned_by, ppa.assigned_at
FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_assignments ppa
JOIN {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups ppg ON ppg.id = ppa.group_id
WHERE ppg.group_key != 'workspace_administrator';
