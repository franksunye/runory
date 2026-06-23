-- 0013_workspace_dashboard_layout.sql
-- Workspace Dashboard Layout overrides (per docs/product/v0.2.1-workbench-composition-plan.md §7.1)
-- Stores workspace-level personalization of the workbench layout.
-- Identity: workspace_id + zone + widget_module + widget_key + widget_instance

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_dashboard_layout (
  workspace_id     TEXT NOT NULL,
  zone             TEXT NOT NULL,
  widget_module    TEXT NOT NULL,
  widget_key       TEXT NOT NULL,
  widget_instance  TEXT NOT NULL DEFAULT 'default',
  position         INTEGER NOT NULL,
  hidden           INTEGER NOT NULL DEFAULT 0,
  config_override  TEXT,
  updated_at       TEXT NOT NULL,
  updated_by       TEXT NOT NULL,
  PRIMARY KEY (workspace_id, zone, widget_module, widget_key, widget_instance)
);

CREATE INDEX IF NOT EXISTS idx_workspace_dashboard_layout_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_dashboard_layout(workspace_id);
