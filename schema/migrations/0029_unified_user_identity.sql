-- Migration: 0029_unified_user_identity
-- Description: Owner fields reference canonical platform users. Legacy demo
-- names are upgraded to the matching demo user without recreating workspaces.
-- Tolerant: true

UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}field_definitions
SET type = 'user'
WHERE field_key = 'owner';

UPDATE {{BUSINESS_TABLE_PREFIX}}company
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}company.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}company.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}company.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}company.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}company.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}company.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}company.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}company.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}company.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}company.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}company.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}company.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}company.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}company.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}company.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}company.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}contact
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}contact.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}contact.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}contact.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}contact.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}contact.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}contact.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}contact.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}contact.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}contact.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}contact.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}contact.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}contact.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}contact.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}contact.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}contact.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}contact.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}deal
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}deal.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}deal.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}deal.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}deal.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}deal.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}deal.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}deal.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}deal.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}deal.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}deal.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}deal.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}deal.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}deal.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}deal.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}deal.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}deal.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}ai_visibility_check
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}ai_visibility_check.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}conversation
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}conversation.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}conversation.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}conversation.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}conversation.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}conversation.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}conversation.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}conversation.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}conversation.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}conversation.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}conversation.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}conversation.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}conversation.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}conversation.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}conversation.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}conversation.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}conversation.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}return_request
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}return_request.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}return_request.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}return_request.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}return_request.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}return_request.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}return_request.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}return_request.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}return_request.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}return_request.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}return_request.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}return_request.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}return_request.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}return_request.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}return_request.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}return_request.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}return_request.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}maintenance_plan
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}maintenance_plan.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}customer_success
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}customer_success.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}customer_success.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}customer_success.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}customer_success.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}customer_success.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}customer_success.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}customer_success.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}customer_success.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}customer_success.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}customer_success.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}customer_success.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}customer_success.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}customer_success.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}customer_success.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}customer_success.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}customer_success.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}repair_request
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}repair_request.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}repair_request.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}repair_request.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}repair_request.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}repair_request.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}repair_request.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}repair_request.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}repair_request.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}repair_request.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}repair_request.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}repair_request.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}repair_request.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}repair_request.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}repair_request.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}repair_request.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}repair_request.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}ticket
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}ticket.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}ticket.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}ticket.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}ticket.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}ticket.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}ticket.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}ticket.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}ticket.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}ticket.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}ticket.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}ticket.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}ticket.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}ticket.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}ticket.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}ticket.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}ticket.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}answer_block
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}answer_block.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}answer_block.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}answer_block.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}answer_block.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}answer_block.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}answer_block.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}answer_block.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}answer_block.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}answer_block.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}answer_block.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}answer_block.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}answer_block.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}answer_block.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}answer_block.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}answer_block.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}answer_block.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}question_map
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}question_map.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}question_map.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}question_map.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}question_map.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}question_map.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}question_map.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}question_map.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}question_map.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}question_map.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}question_map.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}question_map.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}question_map.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}question_map.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}question_map.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}question_map.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}question_map.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}citation_source
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}citation_source.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}citation_source.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}citation_source.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}citation_source.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}citation_source.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}citation_source.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}citation_source.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}citation_source.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}citation_source.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}citation_source.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}citation_source.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}citation_source.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}citation_source.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}citation_source.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}citation_source.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}citation_source.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}landing_page
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}landing_page.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}landing_page.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}landing_page.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}landing_page.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}landing_page.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}landing_page.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}landing_page.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}landing_page.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}landing_page.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}landing_page.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}landing_page.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}landing_page.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}landing_page.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}landing_page.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}landing_page.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}landing_page.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}support_sla
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}support_sla.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}support_sla.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}support_sla.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}support_sla.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}support_sla.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}support_sla.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}support_sla.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}support_sla.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}support_sla.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}support_sla.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}support_sla.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}support_sla.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}support_sla.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}support_sla.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}support_sla.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}support_sla.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}entity_profile
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}entity_profile.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}entity_profile.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}entity_profile.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}entity_profile.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}entity_profile.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}entity_profile.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}entity_profile.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}entity_profile.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}entity_profile.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}entity_profile.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}entity_profile.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}entity_profile.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}entity_profile.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}entity_profile.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}entity_profile.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}entity_profile.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}warranty
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}warranty.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}warranty.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}warranty.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}warranty.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}warranty.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}warranty.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}warranty.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}warranty.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}warranty.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}warranty.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}warranty.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}warranty.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}warranty.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}warranty.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}warranty.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}warranty.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}quote
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}quote.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}quote.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}quote.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}quote.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}quote.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}quote.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}quote.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}quote.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}quote.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}quote.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}quote.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}quote.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}quote.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}quote.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}quote.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}quote.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}knowledge
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}knowledge.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}knowledge.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}knowledge.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}knowledge.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}knowledge.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}knowledge.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}knowledge.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}knowledge.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}knowledge.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}knowledge.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}knowledge.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}knowledge.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}knowledge.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}knowledge.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}knowledge.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}knowledge.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}campaign
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}campaign.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}campaign.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}campaign.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}campaign.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}campaign.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}campaign.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}campaign.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}campaign.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}campaign.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}campaign.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}campaign.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}campaign.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}campaign.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}campaign.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}campaign.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}campaign.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

UPDATE {{BUSINESS_TABLE_PREFIX}}entitlement
SET owner = (
  SELECT u.id
  FROM {{SAAS_TABLE_PREFIX}}users u
  JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
  WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}entitlement.workspace_id
    AND wm.status = 'active'
    AND (
      u.id = {{BUSINESS_TABLE_PREFIX}}entitlement.owner
      OR u.external_id = {{BUSINESS_TABLE_PREFIX}}entitlement.owner
      OR u.email = {{BUSINESS_TABLE_PREFIX}}entitlement.owner
      OR u.display_name = {{BUSINESS_TABLE_PREFIX}}entitlement.owner
      OR u.external_id = CASE
        WHEN {{BUSINESS_TABLE_PREFIX}}entitlement.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
        WHEN {{BUSINESS_TABLE_PREFIX}}entitlement.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
        WHEN {{BUSINESS_TABLE_PREFIX}}entitlement.owner = 'David Park' THEN 'persona:technician'
        ELSE ''
      END
    )
  LIMIT 1
)
WHERE owner IS NOT NULL
  AND owner <> ''
  AND EXISTS (
    SELECT 1
    FROM {{SAAS_TABLE_PREFIX}}users u
    JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id
    WHERE wm.workspace_id = {{BUSINESS_TABLE_PREFIX}}entitlement.workspace_id
      AND wm.status = 'active'
      AND (
        u.id = {{BUSINESS_TABLE_PREFIX}}entitlement.owner
        OR u.external_id = {{BUSINESS_TABLE_PREFIX}}entitlement.owner
        OR u.email = {{BUSINESS_TABLE_PREFIX}}entitlement.owner
        OR u.display_name = {{BUSINESS_TABLE_PREFIX}}entitlement.owner
        OR u.external_id = CASE
          WHEN {{BUSINESS_TABLE_PREFIX}}entitlement.owner IN ('Alex', 'Alex Chen') THEN 'persona:sales-rep'
          WHEN {{BUSINESS_TABLE_PREFIX}}entitlement.owner IN ('Sam', 'Sam Lee') THEN 'persona:sales-manager'
          WHEN {{BUSINESS_TABLE_PREFIX}}entitlement.owner = 'David Park' THEN 'persona:technician'
          ELSE ''
        END
      )
  );

