CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}invoice (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued',
  work_order_id TEXT NOT NULL,
  quote_id TEXT,
  company_id TEXT,
  contact_id TEXT,
  currency TEXT NOT NULL,
  total_minor INTEGER NOT NULL,
  amount_paid_minor INTEGER NOT NULL DEFAULT 0,
  balance_due_minor INTEGER NOT NULL,
  issued_at TEXT NOT NULL,
  due_at TEXT,
  paid_at TEXT,
  voided_at TEXT,
  memo TEXT,
  source_snapshot_hash TEXT,
  created_by TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id),
  UNIQUE(workspace_id, invoice_number),
  UNIQUE(workspace_id, work_order_id),
  CHECK(total_minor > 0),
  CHECK(amount_paid_minor >= 0 AND amount_paid_minor <= total_minor),
  CHECK(balance_due_minor >= 0 AND balance_due_minor <= total_minor)
);

CREATE INDEX IF NOT EXISTS idx_business_invoice_status
  ON {{BUSINESS_TABLE_PREFIX}}invoice(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_invoice_due
  ON {{BUSINESS_TABLE_PREFIX}}invoice(workspace_id, due_at);
CREATE INDEX IF NOT EXISTS idx_business_invoice_quote
  ON {{BUSINESS_TABLE_PREFIX}}invoice(workspace_id, quote_id);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}invoice_line (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT,
  unit_price_minor INTEGER NOT NULL,
  line_total_minor INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_invoice_line_invoice
  ON {{BUSINESS_TABLE_PREFIX}}invoice_line(workspace_id, invoice_id);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}invoice_payment_allocation (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  refunded_amount_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  allocated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id),
  UNIQUE(workspace_id, payment_id),
  CHECK(amount_minor > 0),
  CHECK(refunded_amount_minor >= 0 AND refunded_amount_minor <= amount_minor)
);

CREATE INDEX IF NOT EXISTS idx_business_invoice_allocation_invoice
  ON {{BUSINESS_TABLE_PREFIX}}invoice_payment_allocation(workspace_id, invoice_id);
