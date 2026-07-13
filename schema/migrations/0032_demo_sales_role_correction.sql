-- Golden demo personas should express their actual stable business role.
DELETE FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}business_role_assignments
WHERE role_key = 'sales_manager'
  AND user_id IN (
    SELECT id FROM {{SAAS_TABLE_PREFIX}}users WHERE external_id = 'persona:sales-rep'
  );

INSERT OR IGNORE INTO {{RUNORY_RUNTIME_TABLE_PREFIX}}business_role_assignments
  (id, workspace_id, role_key, user_id, assigned_by, assigned_at)
SELECT 'bra_demo_sales_rep_' || wm.workspace_id, wm.workspace_id, 'sales_representative',
       u.id, 'role-correction', CURRENT_TIMESTAMP
FROM {{SAAS_TABLE_PREFIX}}users u
JOIN {{SAAS_TABLE_PREFIX}}workspace_memberships wm ON wm.user_id = u.id AND wm.status = 'active'
JOIN {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_permission_groups ppg
  ON ppg.workspace_id = wm.workspace_id AND ppg.business_role_key = 'sales_representative'
WHERE u.external_id = 'persona:sales-rep';
