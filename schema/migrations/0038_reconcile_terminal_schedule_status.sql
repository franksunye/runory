-- Reconcile Schedule's independent lifecycle with terminal FSM aggregates.
-- Earlier visit.complete and work_order.complete commands closed their primary
-- aggregate but omitted the associated resource reservation. The command path
-- is fixed in code and this migration repairs already-created records.
-- Tolerant: true

UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries
SET status = 'completed',
    version = version + 1,
    updated_at = COALESCE(
      (SELECT visit.actual_end
       FROM {{BUSINESS_TABLE_PREFIX}}service_visit visit
       WHERE visit.workspace_id = {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries.workspace_id
         AND visit.id = {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries.subject_id),
      CURRENT_TIMESTAMP
    )
WHERE subject_type = 'service_visit'
  AND status IN ('tentative', 'confirmed')
  AND EXISTS (
    SELECT 1
    FROM {{BUSINESS_TABLE_PREFIX}}service_visit visit
    WHERE visit.workspace_id = {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries.workspace_id
      AND visit.id = {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries.subject_id
      AND visit.status = 'completed'
  );

UPDATE {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries
SET status = 'completed',
    version = version + 1,
    updated_at = COALESCE(
      (SELECT work_order.completed_at
       FROM {{BUSINESS_TABLE_PREFIX}}work_order work_order
       WHERE work_order.workspace_id = {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries.workspace_id
         AND work_order.id = {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries.subject_id),
      CURRENT_TIMESTAMP
    )
WHERE subject_type = 'work_order'
  AND status IN ('tentative', 'confirmed')
  AND EXISTS (
    SELECT 1
    FROM {{BUSINESS_TABLE_PREFIX}}work_order work_order
    WHERE work_order.workspace_id = {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries.workspace_id
      AND work_order.id = {{RUNORY_RUNTIME_TABLE_PREFIX}}schedule_entries.subject_id
      AND work_order.status = 'completed'
  );
