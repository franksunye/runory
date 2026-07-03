-- 0025_assignment_schedule.sql
-- v0.5 Slice 4: Assignment & Scheduling Runtime
-- Resources (technicians linked to workspace users), assignments (who is
-- assigned to what, with lifecycle), and schedule entries (when and where).

-- ── Resources (technicians linked to workspace users) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}resources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'technician',  -- user | crew | equipment
  user_id TEXT,
  display_name TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  active INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);
CREATE INDEX IF NOT EXISTS idx_resources_workspace ON {{RUNORY_RUNTIME_TABLE_PREFIX}}resources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_resources_user ON {{RUNORY_RUNTIME_TABLE_PREFIX}}resources(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_resources_active ON {{RUNORY_RUNTIME_TABLE_PREFIX}}resources(workspace_id, active);

-- ── Assignments (who is assigned to what, with lifecycle) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}assignments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,   -- work_order, service_visit
  subject_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  role_key TEXT,                -- primary, backup, etc.
  status TEXT NOT NULL DEFAULT 'proposed',  -- proposed | assigned | accepted | rejected | released | cancelled
  proposed_by TEXT,
  accepted_by TEXT,
  rejection_reason TEXT,
  effective_from TEXT,
  effective_to TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_workspace ON {{RUNORY_RUNTIME_TABLE_PREFIX}}assignments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_assignments_subject ON {{RUNORY_RUNTIME_TABLE_PREFIX}}assignments(workspace_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_assignments_resource ON {{RUNORY_RUNTIME_TABLE_PREFIX}}assignments(workspace_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON {{RUNORY_RUNTIME_TABLE_PREFIX}}assignments(workspace_id, status);

-- ── Schedule Entries (when and where) ──
CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,   -- service_visit, work_order
  subject_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'tentative',  -- tentative | confirmed | cancelled | completed
  location_type TEXT,           -- customer_site, office, remote
  location_id TEXT,
  latitude REAL,
  longitude REAL,
  conflict_state TEXT DEFAULT 'none',  -- none | warning | conflict
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_workspace ON {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_resource ON {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries(workspace_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_subject ON {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries(workspace_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_status ON {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_time ON {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries(workspace_id, start_at, end_at);
