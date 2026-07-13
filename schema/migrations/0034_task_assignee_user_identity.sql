-- Task Owner was historically a free-text assignee. Convert it to the same
-- canonical User reference used by every other people-owned business record.
UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}field_definitions
SET type = 'user'
WHERE object_key = 'task' AND field_key = 'assignee';

UPDATE {{BUSINESS_TABLE_PREFIX}}task
SET assignee = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm
    ON wm.user_id = u.id
   AND wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}task.workspace_id
   AND wm.status = 'active'
  WHERE u.id = {{BUSINESS_TABLE_PREFIX}}task.assignee
     OR u.external_id = {{BUSINESS_TABLE_PREFIX}}task.assignee
     OR u.email = {{BUSINESS_TABLE_PREFIX}}task.assignee
     OR u.display_name = {{BUSINESS_TABLE_PREFIX}}task.assignee
     OR u.external_id = CASE
       WHEN {{BUSINESS_TABLE_PREFIX}}task.assignee IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
       WHEN {{BUSINESS_TABLE_PREFIX}}task.assignee IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
       ELSE ''
     END
  LIMIT 1
)
WHERE assignee IS NOT NULL
  AND assignee <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm
      ON wm.user_id = u.id
     AND wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}task.workspace_id
     AND wm.status = 'active'
    WHERE u.id = {{BUSINESS_TABLE_PREFIX}}task.assignee
       OR u.external_id = {{BUSINESS_TABLE_PREFIX}}task.assignee
       OR u.email = {{BUSINESS_TABLE_PREFIX}}task.assignee
       OR u.display_name = {{BUSINESS_TABLE_PREFIX}}task.assignee
       OR u.external_id = CASE
         WHEN {{BUSINESS_TABLE_PREFIX}}task.assignee IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
         WHEN {{BUSINESS_TABLE_PREFIX}}task.assignee IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
         ELSE ''
       END
  );
