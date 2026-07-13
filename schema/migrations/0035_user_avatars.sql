-- Migration: 0035_user_avatars
-- Description: Add a single user-owned avatar shared by People, resource
-- identities, planning, assignees, and the local demo identity switcher.
-- Tolerant: true

ALTER TABLE {{SAAS_TABLE_PREFIX}}users ADD COLUMN avatar_url TEXT;

UPDATE {{SAAS_TABLE_PREFIX}}users SET avatar_url = '/demo/avatars/sarah-chen.png'
WHERE external_id = 'persona:sales-rep';
UPDATE {{SAAS_TABLE_PREFIX}}users SET avatar_url = '/demo/avatars/michael-torres.png'
WHERE external_id = 'persona:sales-manager';
UPDATE {{SAAS_TABLE_PREFIX}}users SET avatar_url = '/demo/avatars/lisa-wang.png'
WHERE external_id = 'persona:dispatcher';
UPDATE {{SAAS_TABLE_PREFIX}}users SET avatar_url = '/demo/avatars/david-park.png'
WHERE external_id = 'persona:technician';
UPDATE {{SAAS_TABLE_PREFIX}}users SET avatar_url = '/demo/avatars/james-wilson.png'
WHERE external_id = 'persona:technician-james';
UPDATE {{SAAS_TABLE_PREFIX}}users SET avatar_url = '/demo/avatars/maria-garcia.png'
WHERE external_id = 'persona:technician-maria';
UPDATE {{SAAS_TABLE_PREFIX}}users SET avatar_url = '/demo/avatars/robert-kim.png'
WHERE external_id = 'persona:supervisor';

UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}field_definitions
SET type = 'user'
WHERE object_key = 'technician' AND field_key = 'user_id';

UPDATE {{BUSINESS_TABLE_PREFIX}}technician
SET user_id = (
  SELECT u.id FROM {{SAAS_TABLE_PREFIX}}users u
  WHERE u.email = CASE {{BUSINESS_TABLE_PREFIX}}technician.name
    WHEN 'David Park' THEN 'technician@runory.demo'
    WHEN 'James Wilson' THEN 'james@runory.demo'
    WHEN 'Maria Garcia' THEN 'maria@runory.demo'
    ELSE ''
  END
  LIMIT 1
)
WHERE (user_id IS NULL OR user_id = '')
  AND name IN ('David Park', 'James Wilson', 'Maria Garcia');
