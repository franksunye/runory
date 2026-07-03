-- runory.technician v1.1.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}technician (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  skills TEXT,
  region TEXT,
  availability_status TEXT NOT NULL DEFAULT 'available',
  user_id TEXT,
  resource_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_technician_workspace ON {{BUSINESS_TABLE_PREFIX}}technician(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_technician_availability ON {{BUSINESS_TABLE_PREFIX}}technician(workspace_id, availability_status);
CREATE INDEX IF NOT EXISTS idx_business_technician_resource ON {{BUSINESS_TABLE_PREFIX}}technician(workspace_id, resource_id);
