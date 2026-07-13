-- Migration: 0030_demo_technician_users
-- Description: Human technician resources in the golden demo receive matching
-- platform users so People, Demo identity, Planning, and My Work share identity.
-- Tolerant: true

INSERT OR IGNORE INTO {{SAAS_TABLE_PREFIX}}users
  (id, external_id, email, display_name, status, created_at, updated_at)
SELECT 'usr_demo_technician_james', 'persona:technician-james', 'james@runory.demo',
       'James Wilson', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}resources WHERE display_name = 'James Wilson'
);

INSERT OR IGNORE INTO {{SAAS_TABLE_PREFIX}}users
  (id, external_id, email, display_name, status, created_at, updated_at)
SELECT 'usr_demo_technician_maria', 'persona:technician-maria', 'maria@runory.demo',
       'Maria Garcia', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}resources WHERE display_name = 'Maria Garcia'
);

INSERT OR IGNORE INTO {{SAAS_TABLE_PREFIX}}auth_identities
  (id, user_id, method, email_normalized, email_display, verified, verified_at, created_at, updated_at)
SELECT 'auth_demo_technician_james', id, 'email_otp', 'james@runory.demo',
       'james@runory.demo', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM {{SAAS_TABLE_PREFIX}}users WHERE external_id = 'persona:technician-james';

INSERT OR IGNORE INTO {{SAAS_TABLE_PREFIX}}auth_identities
  (id, user_id, method, email_normalized, email_display, verified, verified_at, created_at, updated_at)
SELECT 'auth_demo_technician_maria', id, 'email_otp', 'maria@runory.demo',
       'maria@runory.demo', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM {{SAAS_TABLE_PREFIX}}users WHERE external_id = 'persona:technician-maria';

INSERT OR IGNORE INTO {{SAAS_TABLE_PREFIX}}workspace_memberships
  (id, workspace_id, user_id, role, status, created_at, updated_at)
SELECT 'wsmem_demo_james_' || r.workspace_id, r.workspace_id, u.id, 'member', 'active',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}resources r
JOIN {{SAAS_TABLE_PREFIX}}users u ON u.external_id = 'persona:technician-james'
WHERE r.display_name = 'James Wilson' AND r.resource_type = 'technician';

INSERT OR IGNORE INTO {{SAAS_TABLE_PREFIX}}workspace_memberships
  (id, workspace_id, user_id, role, status, created_at, updated_at)
SELECT 'wsmem_demo_maria_' || r.workspace_id, r.workspace_id, u.id, 'member', 'active',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}resources r
JOIN {{SAAS_TABLE_PREFIX}}users u ON u.external_id = 'persona:technician-maria'
WHERE r.display_name = 'Maria Garcia' AND r.resource_type = 'technician';

UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}resources
SET user_id = (SELECT id FROM {{SAAS_TABLE_PREFIX}}users WHERE external_id = 'persona:technician-james'),
    updated_at = CURRENT_TIMESTAMP
WHERE display_name = 'James Wilson' AND resource_type = 'technician' AND user_id IS NULL;

UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}resources
SET user_id = (SELECT id FROM {{SAAS_TABLE_PREFIX}}users WHERE external_id = 'persona:technician-maria'),
    updated_at = CURRENT_TIMESTAMP
WHERE display_name = 'Maria Garcia' AND resource_type = 'technician' AND user_id IS NULL;

INSERT OR IGNORE INTO {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_assignments
  (id, workspace_id, group_id, user_id, assigned_by, assigned_at)
SELECT 'pa_demo_james_' || pg.workspace_id, pg.workspace_id, pg.id, u.id, 'identity-migration', CURRENT_TIMESTAMP
FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups pg
JOIN {{SAAS_TABLE_PREFIX}}users u ON u.external_id = 'persona:technician-james'
JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.workspace_id = pg.workspace_id AND wm.user_id = u.id
WHERE pg.group_key = 'field_technician';

INSERT OR IGNORE INTO {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_assignments
  (id, workspace_id, group_id, user_id, assigned_by, assigned_at)
SELECT 'pa_demo_maria_' || pg.workspace_id, pg.workspace_id, pg.id, u.id, 'identity-migration', CURRENT_TIMESTAMP
FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups pg
JOIN {{SAAS_TABLE_PREFIX}}users u ON u.external_id = 'persona:technician-maria'
JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.workspace_id = pg.workspace_id AND wm.user_id = u.id
WHERE pg.group_key = 'field_technician';
