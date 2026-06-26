-- runory.form v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}form (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  target_object TEXT DEFAULT 'contact',
  fields_json TEXT,
  submit_button_label TEXT DEFAULT 'Submit',
  success_message TEXT DEFAULT 'Thank you for your submission. We will contact you soon.',
  campaign_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_form_workspace ON {{BUSINESS_TABLE_PREFIX}}form(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_form_status ON {{BUSINESS_TABLE_PREFIX}}form(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_form_slug ON {{BUSINESS_TABLE_PREFIX}}form(workspace_id, slug);
