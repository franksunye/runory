-- runory.support-sla v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}support_sla (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  response_time_hours INTEGER NOT NULL DEFAULT 24,
  resolution_time_hours INTEGER NOT NULL DEFAULT 72,
  business_hours_only INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_support_sla_workspace ON {{BUSINESS_TABLE_PREFIX}}support_sla(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_support_sla_status ON {{BUSINESS_TABLE_PREFIX}}support_sla(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_support_sla_priority ON {{BUSINESS_TABLE_PREFIX}}support_sla(workspace_id, priority);
