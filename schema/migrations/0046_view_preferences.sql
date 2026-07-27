-- User view preferences for v0.8 Batch 1 (Tech Spec §4.6).
-- Stores per-user ListViewPreferenceOverlay: visible fields, exact filters,
-- sort, and page size. One row per user per view definition.

CREATE TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}view_preferences (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  view_definition_id TEXT NOT NULL,
  visible_fields_json TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  sort_json TEXT,
  page_size INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, user_id, view_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_view_prefs_user
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}view_preferences(workspace_id, user_id);
