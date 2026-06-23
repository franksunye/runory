-- runory.service-report v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}service_report (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  service_visit_id TEXT,
  summary TEXT NOT NULL,
  resolution TEXT,
  customer_signature TEXT,
  photos TEXT,
  created_by TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_service_report_workspace ON {{BUSINESS_TABLE_PREFIX}}service_report(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_service_report_work_order ON {{BUSINESS_TABLE_PREFIX}}service_report(workspace_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_business_service_report_visit ON {{BUSINESS_TABLE_PREFIX}}service_report(workspace_id, service_visit_id);
