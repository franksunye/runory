-- Stable business-role assignments are authoritative. Remove duplicate legacy
-- Pack-group assignments once they have a role-key equivalent. Internal groups
-- without a business role (for example workspace administrator compatibility)
-- remain untouched.
DELETE FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_assignments
WHERE group_id IN (
  SELECT id FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups
  WHERE business_role_key IS NOT NULL
);
