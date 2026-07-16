-- 0027_attachments_metadata.sql
-- Tolerant: true
-- v0.5.1 Spec §5.5 (Mobile Field-Work / Evidence): Attachments are first-class
-- metadata associated with the submission revision and the Visit/Work Item subject.
-- They are NOT stored as untyped URLs inside form answers.
--
-- The attachments table was introduced in 0024_forms_v2.sql with a generic
-- owner_type/owner_id/storage_key/byte_size shape. This migration aligns the
-- table with the real evidence-block requirements from the v0.5.1 spec:
--   - size_bytes    : canonical byte size (mirrors byte_size)
--   - storage_path  : on-disk path / object key for the blob (mirrors storage_key)
--   - work_item_id  : nullable FK to the Work Item the evidence belongs to
--   - form_submission_id : nullable FK to the form submission revision
--
-- Server (per Spec §7 Security Gates) verifies content type, size, authorization,
-- and integrity metadata (sha256) before accepting an upload, and validates
-- workspace membership on every attachment request.
--
-- SQLite does not support IF NOT EXISTS for ALTER TABLE ADD COLUMN, so these
-- statements run exactly once (the migration runner records the version after
-- success). The columns are nullable to remain backward compatible with any
-- rows created by earlier tooling.

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments ADD COLUMN size_bytes INTEGER;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments ADD COLUMN storage_path TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments ADD COLUMN work_item_id TEXT;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments ADD COLUMN form_submission_id TEXT;
-- Historical 0024 installations predate soft-delete support on attachments.
-- The tolerant marker makes this safe when a newer 0024 already created it.
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments ADD COLUMN deleted_at TEXT;

-- Backfill the canonical columns from the 0024 columns so existing rows stay
-- queryable through the new field names. NULLs are preserved.
UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments
SET size_bytes = byte_size,
    storage_path = storage_key
WHERE size_bytes IS NULL AND byte_size IS NOT NULL;

-- Efficient lookup by workspace (list / download authorization) and by
-- subject association (Work Item / Form Submission).
CREATE INDEX IF NOT EXISTS idx_attachments_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments(workspace_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_attachments_work_item
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments(workspace_id, work_item_id);

CREATE INDEX IF NOT EXISTS idx_attachments_form_submission
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments(workspace_id, form_submission_id);

-- Integrity / idempotency lookup: a retry of the same content (same sha256)
-- within a workspace resolves to the existing attachment instead of duplicating
-- storage (Spec §5.5: "Retrying an attachment association MUST be idempotent").
CREATE INDEX IF NOT EXISTS idx_attachments_integrity
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}attachments(workspace_id, sha256);
