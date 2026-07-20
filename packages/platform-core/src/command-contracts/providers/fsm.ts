import { TABLES, businessTable } from "../../contracts";
import { queryOne } from "../../db";
import { commandContractError } from "../errors";
import { registerCommandEffectProvider } from "../registry";
import { assertEffectCardinality } from "./cardinality";

registerCommandEffectProvider({
  capability: "fsm.activate_visit_execution",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.visitExecutionItems}
       WHERE workspace_id = ? AND visit_id = ? AND status = 'ready'`,
      [envelope.workspaceId, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "ready Visit execution item(s)",
    );
    const count = row?.count ?? 0;
    return {
      recordCount: count,
      statements: [{
        sql: `UPDATE ${TABLES.visitExecutionItems}
              SET status = 'active', updated_at = ?
              WHERE workspace_id = ? AND visit_id = ? AND status = 'ready'`,
        args: [envelope.occurredAt, envelope.workspaceId, envelope.aggregateId],
        expectedRowsAffected: count,
      }],
    };
  },
});

registerCommandEffectProvider({
  capability: "fsm.cancel_visit_execution",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.visitExecutionItems}
       WHERE workspace_id = ? AND visit_id = ? AND status IN ('ready', 'active')`,
      [envelope.workspaceId, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "active Visit execution item(s)",
    );
    const count = row?.count ?? 0;
    return {
      recordCount: count,
      statements: [{
        sql: `UPDATE ${TABLES.visitExecutionItems}
              SET status = 'cancelled', updated_at = ?
              WHERE workspace_id = ? AND visit_id = ? AND status IN ('ready', 'active')`,
        args: [envelope.occurredAt, envelope.workspaceId, envelope.aggregateId],
        expectedRowsAffected: count,
      }],
    };
  },
});

registerCommandEffectProvider({
  capability: "fsm.cancel_work_order_visits",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${businessTable("service_visit")}
       WHERE workspace_id = ? AND work_order_id = ?
         AND status NOT IN ('completed', 'cancelled')`,
      [envelope.workspaceId, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "non-terminal Service Visit(s)",
    );
    const count = row?.count ?? 0;
    return {
      recordCount: count,
      statements: [{
        sql: `UPDATE ${businessTable("service_visit")}
              SET status = 'cancelled', aggregate_version = aggregate_version + 1, updated_at = ?
              WHERE workspace_id = ? AND work_order_id = ?
                AND status NOT IN ('completed', 'cancelled')`,
        args: [envelope.occurredAt, envelope.workspaceId, envelope.aggregateId],
        expectedRowsAffected: count,
      }],
    };
  },
});

interface CreateDispatchedVisitRequirementInput {
  requirementId: string;
  workItemId: string;
  bindingId: string;
  formDefinitionId: string;
  formVersionId: string;
  label: string;
}

interface CreateDispatchedVisitEffectInput {
  visitId: string;
  assignmentId: string;
  scheduleEntryId: string;
  executionItemId: string;
  workOrderId: string;
  technicianId: string;
  resourceId: string;
  resourceUserId: string | null;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  notes: string | null;
  scheduleStatus: "tentative" | "confirmed";
  conflictState: "conflict" | "none";
  requirements: CreateDispatchedVisitRequirementInput[];
}

function parseCreateDispatchedVisitEffectInput(
  commandType: string,
  input: unknown,
): CreateDispatchedVisitEffectInput {
  const invalid = (): never => {
    throw commandContractError(
      `${commandType} did not provide a valid effect input for fsm.create_dispatched_visit.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  const requiredStrings = [
    "visitId", "assignmentId", "scheduleEntryId", "executionItemId",
    "workOrderId", "technicianId", "resourceId", "title",
    "scheduledStart", "scheduledEnd",
  ];
  if (requiredStrings.some(
    (key) => typeof value[key] !== "string" || value[key] === "",
  )) invalid();
  if (value.resourceUserId !== null && typeof value.resourceUserId !== "string") invalid();
  if (value.notes !== null && typeof value.notes !== "string") invalid();
  if (!(["tentative", "confirmed"] as unknown[]).includes(value.scheduleStatus)) invalid();
  if (!(["conflict", "none"] as unknown[]).includes(value.conflictState)) invalid();
  if (!Array.isArray(value.requirements)) invalid();
  const requirements = value.requirements as unknown[];
  if (requirements.length === 0) invalid();
  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) invalid();
    const row = requirement as Record<string, unknown>;
    if ([
      "requirementId", "workItemId", "bindingId", "formDefinitionId",
      "formVersionId", "label",
    ].some((key) => typeof row[key] !== "string" || row[key] === "")) invalid();
  }
  return value as unknown as CreateDispatchedVisitEffectInput;
}

registerCommandEffectProvider({
  capability: "fsm.create_dispatched_visit",
  version: "1.0.0",
  consistency: "atomic",
  prepare: ({ envelope, requirement, effectInput }) => {
    const input = parseCreateDispatchedVisitEffectInput(envelope.commandType, effectInput);
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      1,
      "Service Visit creation request(s)",
    );
    const ts = envelope.occurredAt;
    return {
      recordCount: 1,
      statements: [
        {
        sql: `INSERT INTO ${TABLES.assignments}
              (id, workspace_id, subject_type, subject_id, resource_id, role_key,
               status, proposed_by, effective_from, version, created_at, updated_at)
              VALUES (?, ?, 'service_visit', ?, ?, 'primary', 'assigned', ?, ?, 1, ?, ?)`,
        args: [
          input.assignmentId, envelope.workspaceId, input.visitId, input.resourceId,
          envelope.actor.id, input.scheduledStart, ts, ts,
        ],
        expectedRowsAffected: 1,
        },
        {
        sql: `INSERT INTO ${TABLES.scheduleEntries}
              (id, workspace_id, subject_type, subject_id, resource_id, start_at, end_at,
               timezone, status, conflict_state, version, created_at, updated_at)
              VALUES (?, ?, 'service_visit', ?, ?, ?, ?, 'UTC', ?, ?, 1, ?, ?)`,
        args: [
          input.scheduleEntryId, envelope.workspaceId, input.visitId, input.resourceId,
          input.scheduledStart, input.scheduledEnd, input.scheduleStatus,
          input.conflictState, ts, ts,
        ],
        expectedRowsAffected: 1,
        },
        {
        sql: `INSERT INTO ${businessTable("service_visit")}
              (id, workspace_id, title, work_order_id, technician_id,
               scheduled_start, scheduled_end, actual_start, actual_end,
               status, notes, aggregate_version, assignment_id, schedule_entry_id, outcome,
               created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'scheduled', ?, 1, ?, ?, NULL, ?, ?)`,
        args: [
          input.visitId, envelope.workspaceId, input.title, input.workOrderId,
          input.technicianId, input.scheduledStart, input.scheduledEnd, input.notes,
          input.assignmentId, input.scheduleEntryId, ts, ts,
        ],
        expectedRowsAffected: 1,
        },
        {
        sql: `INSERT INTO ${TABLES.visitExecutionItems}
              (id, workspace_id, visit_id, resource_id, assignment_id, schedule_entry_id,
               status, due_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)`,
        args: [
          input.executionItemId, envelope.workspaceId, input.visitId, input.resourceId,
          input.assignmentId, input.scheduleEntryId, input.scheduledEnd, ts, ts,
        ],
        expectedRowsAffected: 1,
        },
        ...input.requirements.flatMap((item) => [
          {
          sql: `INSERT INTO ${TABLES.workItems}
                (id, workspace_id, instance_id, step_id, kind, status,
                 subject_type, subject_id, assignee_type, assignee_id,
                 candidate_rule_json, form_binding_id, due_at, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'human_task', 'ready', 'service_visit', ?, ?, ?, NULL, ?, ?, 1, ?, ?)`,
          args: [
            item.workItemId, envelope.workspaceId, `visit_execution:${input.visitId}`,
            item.requirementId, input.visitId, input.resourceUserId ? "user" : null,
            input.resourceUserId, item.bindingId, input.scheduledEnd, ts, ts,
          ],
          expectedRowsAffected: 1,
          },
          {
          sql: `INSERT INTO ${TABLES.visitExecutionRequirements}
                (id, workspace_id, visit_id, binding_id, form_definition_id, form_version_id,
                 label, requirement_policy, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'required', ?)`,
          args: [
            item.requirementId, envelope.workspaceId, input.visitId, item.bindingId,
            item.formDefinitionId, item.formVersionId, item.label, ts,
          ],
          expectedRowsAffected: 1,
          },
        ]),
      ],
    };
  },
});

interface CreateWorkOrderFromQuoteEffectInput {
  workOrderId: string;
  workOrderNumber: string;
  title: string;
  description: string;
  companyId: string | null;
  contactId: string | null;
  snapshotHash: string;
}

function parseCreateWorkOrderFromQuoteEffectInput(
  commandType: string,
  input: unknown,
): CreateWorkOrderFromQuoteEffectInput {
  const invalid = (): never => {
    throw commandContractError(
      `${commandType} did not provide a valid effect input for fsm.create_work_order_from_quote.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  for (const key of [
    "workOrderId", "workOrderNumber", "title", "description", "snapshotHash",
  ]) {
    if (typeof value[key] !== "string" || value[key] === "") invalid();
  }
  for (const key of ["companyId", "contactId"]) {
    if (value[key] !== null && typeof value[key] !== "string") invalid();
  }
  return value as unknown as CreateWorkOrderFromQuoteEffectInput;
}

registerCommandEffectProvider({
  capability: "fsm.create_work_order_from_quote",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement, effectInput }) => {
    const existing = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${businessTable("work_order")}
       WHERE workspace_id = ? AND source_type = 'quote' AND source_id = ?`,
      [envelope.workspaceId, envelope.aggregateId],
    );
    const count = existing?.count ?? 0;
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      count,
      "existing Work Order conversion(s)",
    );
    if (effectInput === undefined) {
      if (count !== 1) {
        throw commandContractError(
          `${envelope.commandType} omitted its creation input without an existing Work Order.`,
        );
      }
      return { recordCount: 1, statements: [] };
    }
    if (count !== 0) {
      throw commandContractError(
        `${envelope.commandType} cannot create a duplicate Work Order for Quote '${envelope.aggregateId}'.`,
      );
    }
    const input = parseCreateWorkOrderFromQuoteEffectInput(
      envelope.commandType,
      effectInput,
    );
    const ts = envelope.occurredAt;
    return {
      recordCount: 1,
      statements: [{
        sql: `INSERT INTO ${businessTable("work_order")}
            (id, workspace_id, title, description, status, priority,
             company_id, contact_id, service_site_id, asset_id,
             source_type, source_id, source_snapshot_hash,
             work_order_number, aggregate_version,
             requested_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'new', 'medium',
             ?, ?, NULL, NULL,
             'quote', ?, ?,
             ?, 1,
             ?, ?, ?)`,
      args: [
        input.workOrderId, envelope.workspaceId, input.title, input.description,
        input.companyId, input.contactId, envelope.aggregateId, input.snapshotHash,
        input.workOrderNumber, ts, ts, ts,
      ],
        expectedRowsAffected: 1,
      }],
    };
  },
});
