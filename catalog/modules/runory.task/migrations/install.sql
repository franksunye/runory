-- runory.task v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}task (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  due_date TEXT,
  assignee TEXT,
  customer_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_task_workspace ON {{BUSINESS_TABLE_PREFIX}}task(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_task_status ON {{BUSINESS_TABLE_PREFIX}}task(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_task_customer ON {{BUSINESS_TABLE_PREFIX}}task(workspace_id, customer_id);
