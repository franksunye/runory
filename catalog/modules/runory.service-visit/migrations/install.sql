-- runory.service-visit v1.1.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}service_visit (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT,
  work_order_id TEXT NOT NULL,
  technician_id TEXT,
  scheduled_start TEXT NOT NULL,
  scheduled_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  assignment_id TEXT,
  schedule_entry_id TEXT,
  outcome TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_service_visit_workspace ON {{BUSINESS_TABLE_PREFIX}}service_visit(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_service_visit_status ON {{BUSINESS_TABLE_PREFIX}}service_visit(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_service_visit_work_order ON {{BUSINESS_TABLE_PREFIX}}service_visit(workspace_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_business_service_visit_technician ON {{BUSINESS_TABLE_PREFIX}}service_visit(workspace_id, technician_id);
CREATE INDEX IF NOT EXISTS idx_business_service_visit_scheduled ON {{BUSINESS_TABLE_PREFIX}}service_visit(workspace_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_business_service_visit_assignment ON {{BUSINESS_TABLE_PREFIX}}service_visit(workspace_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_business_service_visit_schedule ON {{BUSINESS_TABLE_PREFIX}}service_visit(workspace_id, schedule_entry_id);
