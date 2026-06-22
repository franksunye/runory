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
