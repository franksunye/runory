import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TABLES, businessTable } from "./contracts";
import { db, execute, genId, now, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { installPack } from "./installer";
import { createRecord, _clearSoftDeleteColumnCache } from "./metadata";
import { arriveOnSite, cancelVisit, completeVisit, createVisit, startTravel, triageWorkOrder, type CommandActor } from "./fsm-commands";
import { submitForm } from "./forms";
import { getUserPermissionGroups } from "./permission-groups";
import { completeWorkItem, completeWorkItemHandler } from "./workflow";
import { executeCommand, type CommandEnvelope } from "./command-runtime";
import { reassignAssignment, releaseAssignment } from "./assignment";

const workspaceId = "ws_visit_deliverable_auth";
const otherWorkspaceId = "ws_visit_deliverable_other";
let technician: CommandActor;
let dispatcher: CommandActor;
let dispatchNumber = 0;

interface Deliverable {
  id: string;
  subject_id: string;
  form_definition_id: string;
  form_version_id: string;
  binding_id: string;
}

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  _clearSoftDeleteColumnCache();
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows as unknown as Array<{ name: string }>) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${row.name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createDeliverable(wsId = workspaceId): Promise<Deliverable> {
  const resource = await queryOne<{ id: string }>(
    `SELECT id FROM ${businessTable("technician")} WHERE workspace_id = ? AND user_id = ?`,
    [wsId, technician.id],
  );
  expect(resource).toBeDefined();
  const order = await createRecord(wsId, "work_order", {
    title: `Synthetic authorization visit ${++dispatchNumber}`,
    status: "new", priority: "medium", source: "manual",
  });
  await triageWorkOrder(wsId, order.id, dispatcher, 1, { priority: "medium" });
  const start = new Date(Date.UTC(2095, 0, dispatchNumber, 9));
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  await createVisit(wsId, order.id, dispatcher, 2, {
    title: "Synthetic deliverable",
    technicianId: resource!.id,
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
  });
  const item = await queryOne<Deliverable>(
    `SELECT item.id, item.subject_id, requirement.form_definition_id,
            requirement.form_version_id, requirement.binding_id
     FROM ${TABLES.workItems} item
     JOIN ${TABLES.visitExecutionRequirements} requirement
       ON requirement.workspace_id = item.workspace_id AND requirement.id = item.step_id
     JOIN ${businessTable("service_visit")} visit
       ON visit.workspace_id = item.workspace_id AND visit.id = item.subject_id
     WHERE item.workspace_id = ? AND visit.work_order_id = ?`,
    [wsId, order.id],
  );
  expect(item).toBeDefined();
  return item!;
}

async function submitDeliverable(item: Deliverable, wsId = workspaceId, submittedBy = technician.id) {
  return submitForm(wsId, {
    formDefinitionId: item.form_definition_id,
    formVersionId: item.form_version_id,
    bindingId: item.binding_id,
    workItemId: item.id,
    subjectType: "service_visit",
    subjectId: item.subject_id,
    answers: {
      work_performed: "Synthetic permission regression",
      system_status_after_service: "operational",
      "cl-pre-service": { "cl-1": "pass", "cl-2": "pass", "cl-3": "pass", "cl-4": "pass" },
      "evi-photos": { attachments: ["synthetic-before", "synthetic-after"] },
      "sig-customer": { acknowledged: true, signedBy: "Synthetic customer" },
    },
    submittedBy,
  });
}

async function expectReady(item: Deliverable, wsId = workspaceId): Promise<void> {
  expect(await queryOne(
    `SELECT status, version FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [wsId, item.id],
  )).toMatchObject({ status: "ready", version: 1 });
}

async function assignmentIdFor(item: Deliverable): Promise<string> {
  return (await queryOne<{ assignment_id: string }>(
    `SELECT assignment_id FROM ${TABLES.visitExecutionItems} WHERE workspace_id = ? AND visit_id = ?`,
    [workspaceId, item.subject_id],
  ))!.assignment_id;
}

async function replacementTechnician(): Promise<{ resource_id: string; user_id: string }> {
  return (await queryOne<{ resource_id: string; user_id: string }>(
    `SELECT resource_id, user_id FROM ${businessTable("technician")}
     WHERE workspace_id = ? AND user_id IS NOT NULL AND user_id != ? LIMIT 1`,
    [workspaceId, technician.id],
  ))!;
}

function completionEnvelope(item: Deliverable): CommandEnvelope {
  return {
    commandId: genId("cmd"), workspaceId, commandType: "work_item.complete",
    aggregateType: "work_item", aggregateId: item.id, expectedVersion: 1,
    actor: technician, input: { workItemId: item.id, formData: null, expectedVersion: 1 },
    occurredAt: now(),
  };
}

async function expectCompletionFacts(item: Deliverable, count: number): Promise<void> {
  for (const [table, where, id] of [
    [TABLES.domainEvents, "aggregate_id = ? AND event_type = 'work_item.completed'", item.id],
    [TABLES.auditLogs, "entity_id = ? AND action = 'visit_execution.deliverable_complete'", item.subject_id],
    [TABLES.commandExecutions, "aggregate_id = ? AND command_type = 'work_item.complete'", item.id],
  ]) {
    const facts = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table} WHERE workspace_id = ? AND ${where}`,
      [workspaceId, id],
    );
    expect(Number(facts?.count)).toBe(count);
  }
}

describe("assigned visit deliverable completion authorization", () => {
  beforeAll(async () => {
    await resetDatabase();
    for (const id of [workspaceId, otherWorkspaceId]) {
      const ts = now();
      await execute(
        `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [id, id, id, ts, ts],
      );
      await installPack(id, "fsm-pack", { includeDemoData: true });
    }
    const techUser = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.users} WHERE external_id = 'persona:technician'`,
    );
    const dispatcherUser = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.users} WHERE external_id = 'persona:dispatcher'`,
    );
    technician = { type: "user", id: techUser!.id };
    dispatcher = { type: "user", id: dispatcherUser!.id };
  });
  afterAll(resetDatabase);

  it("lets the installed member technician submit and complete their own deliverable without generic workflow authority", async () => {
    const groups = await getUserPermissionGroups(workspaceId, technician.id);
    expect(groups.flatMap((group) => group.permissions)).toEqual(expect.arrayContaining([
      "visit.execute", "forms.submission.submit",
    ]));
    expect(groups.flatMap((group) => group.permissions)).not.toContain("workflow.work_item.act");
    const item = await createDeliverable();
    const submission = await submitDeliverable(item);
    expect(submission.submissionId).toBeTruthy();
    const commandId = genId("cmd");
    const completion = await completeWorkItem(workspaceId, item.id, technician, 1, undefined, commandId);
    expect(completion.aggregate).toMatchObject({ id: item.id, status: "completed", version: 2 });
    await startTravel(workspaceId, item.subject_id, technician, 1);
    await arriveOnSite(workspaceId, item.subject_id, technician, 2);
    await completeVisit(workspaceId, item.subject_id, technician, 3);
    // Completion remains replayable after the enclosing Visit completes.
    expect(await completeWorkItem(workspaceId, item.id, technician, 1, undefined, commandId)).toEqual(completion);
    await expectCompletionFacts(item, 1);
  });

  it.each(["another_user", "unassigned", "generic_workflow", "missing_requirement"])(
    "rejects a technician's completion of %s work",
    async (scenario) => {
      const item = await createDeliverable();
      await submitDeliverable(item);
      if (scenario === "another_user") {
        await execute(`UPDATE ${TABLES.workItems} SET assignee_id = ? WHERE id = ?`, [dispatcher.id, item.id]);
      } else if (scenario === "unassigned") {
        await execute(`UPDATE ${TABLES.workItems} SET assignee_type = NULL, assignee_id = NULL WHERE id = ?`, [item.id]);
      } else if (scenario === "generic_workflow") {
        await execute(`UPDATE ${TABLES.workItems} SET instance_id = 'workflow:synthetic' WHERE id = ?`, [item.id]);
      } else {
        await execute(`DELETE FROM ${TABLES.visitExecutionRequirements} WHERE workspace_id = ? AND visit_id = ?`, [workspaceId, item.subject_id]);
      }
      await expect(completeWorkItem(workspaceId, item.id, technician, 1))
        .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      await expectReady(item);
    },
  );

  it("retains the required evidence gate and optimistic version check", async () => {
    const item = await createDeliverable();
    await expect(completeWorkItem(workspaceId, item.id, technician, 1))
      .rejects.toMatchObject({ code: "REQUIRED_INPUT_MISSING" });
    await submitDeliverable(item);
    await expect(completeWorkItem(workspaceId, item.id, technician, 9))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expectReady(item);
  });

  it("does not extend a technician's API key authority to this human-user resource policy", async () => {
    const item = await createDeliverable();
    await submitDeliverable(item);
    await expect(completeWorkItem(workspaceId, item.id, { ...technician, type: "api_key" }, 1))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expectReady(item);
  });

  it("moves pending deliverables to the new technician atomically and rejects stale ownership and versions", async () => {
    const item = await createDeliverable();
    const replacement = await replacementTechnician();
    await reassignAssignment(workspaceId, await assignmentIdFor(item), replacement.resource_id, dispatcher.id);
    expect(await queryOne(
      `SELECT assignee_type, assignee_id, status, version FROM ${TABLES.workItems} WHERE id = ?`, [item.id],
    )).toMatchObject({ assignee_type: "user", assignee_id: replacement.user_id, status: "ready", version: 2 });
    await expect(completeWorkItem(workspaceId, item.id, technician, 2))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const newTechnician: CommandActor = { type: "user", id: replacement.user_id };
    await submitDeliverable(item, workspaceId, replacement.user_id);
    await expect(completeWorkItem(workspaceId, item.id, newTechnician, 1))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const completed = await completeWorkItem(workspaceId, item.id, newTechnician, 2);
    expect(completed.aggregate).toMatchObject({ status: "completed", assignee_id: replacement.user_id, version: 3 });
    // A later dispatch change must not rewrite who completed an earlier task.
    const originalResource = (await queryOne<{ resource_id: string }>(
      `SELECT resource_id FROM ${businessTable("technician")} WHERE workspace_id = ? AND user_id = ?`,
      [workspaceId, technician.id],
    ))!;
    await reassignAssignment(workspaceId, await assignmentIdFor(item), originalResource.resource_id, dispatcher.id);
    expect(await queryOne(
      `SELECT assignee_id, status, version FROM ${TABLES.workItems} WHERE id = ?`, [item.id],
    )).toMatchObject({ assignee_id: replacement.user_id, status: "completed", version: 3 });
    await expectCompletionFacts(item, 1);
  });

  it.each(["cancelled", "released"])("rejects a %s execution assignment before completion", async (scenario) => {
    const item = await createDeliverable();
    await submitDeliverable(item);
    if (scenario === "cancelled") {
      await cancelVisit(workspaceId, item.subject_id, technician, 1, "Synthetic cancelled visit");
    } else {
      await releaseAssignment(workspaceId, await assignmentIdFor(item), dispatcher.id);
    }
    await expect(completeWorkItem(workspaceId, item.id, technician, 1))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expectReady(item);
    await expectCompletionFacts(item, 0);
  });

  it.each(["cancelled", "released", "reassigned"])("rolls back all completion facts if authorization races with %s work", async (scenario) => {
    const item = await createDeliverable();
    await submitDeliverable(item);
    const prepared = await completeWorkItemHandler(workspaceId, item.id, technician, 1);
    const envelope = completionEnvelope(item);
    await expect(executeCommand(envelope, async () => {
      // executeCommand authorizes before entering this handler. Interleave the
      // competing real domain operation deterministically before its commit.
      if (scenario === "cancelled") {
        await cancelVisit(workspaceId, item.subject_id, technician, 1, "Synthetic cancellation race");
      } else if (scenario === "released") {
        await releaseAssignment(workspaceId, await assignmentIdFor(item), dispatcher.id);
      } else {
        const replacement = await replacementTechnician();
        await reassignAssignment(workspaceId, await assignmentIdFor(item), replacement.resource_id, dispatcher.id);
      }
      return prepared;
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await queryOne(`SELECT status FROM ${TABLES.workItems} WHERE id = ?`, [item.id]))
      .toMatchObject({ status: "ready" });
    await expectCompletionFacts(item, 0);
    await expect(completeWorkItem(workspaceId, item.id, technician, 1, undefined, envelope.commandId))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expectCompletionFacts(item, 0);
  });

  it("commits only one completion when two handlers observed the same work-item version", async () => {
    const item = await createDeliverable();
    await submitDeliverable(item);
    const first = await completeWorkItemHandler(workspaceId, item.id, technician, 1);
    const stale = await completeWorkItemHandler(workspaceId, item.id, technician, 1);
    await executeCommand(completionEnvelope(item), async () => first);
    await expect(executeCommand(completionEnvelope(item), async () => stale))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expectCompletionFacts(item, 1);
    expect(await queryOne(`SELECT status, version FROM ${TABLES.workItems} WHERE id = ?`, [item.id]))
      .toMatchObject({ status: "completed", version: 2 });
  });

  it("rejects a viewer even when their installed business role grants the visit permissions", async () => {
    const item = await createDeliverable();
    await submitDeliverable(item);
    await execute(`UPDATE ${TABLES.workspaceMemberships} SET role = 'viewer' WHERE workspace_id = ? AND user_id = ?`, [workspaceId, technician.id]);
    try {
      await expect(completeWorkItem(workspaceId, item.id, technician, 1))
        .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    } finally {
      await execute(`UPDATE ${TABLES.workspaceMemberships} SET role = 'member' WHERE workspace_id = ? AND user_id = ?`, [workspaceId, technician.id]);
    }
    await expectReady(item);
  });

  it("rejects another tenant's task both through the wrong workspace and after membership removal", async () => {
    const item = await createDeliverable(otherWorkspaceId);
    await submitDeliverable(item, otherWorkspaceId);
    await expect(completeWorkItem(workspaceId, item.id, technician, 1))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await execute(`DELETE FROM ${TABLES.workspaceMemberships} WHERE workspace_id = ? AND user_id = ?`, [otherWorkspaceId, technician.id]);
    await expect(completeWorkItem(otherWorkspaceId, item.id, technician, 1))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expectReady(item, otherWorkspaceId);
  });

  it.each(["permission", "source", "actor", "version"])("honors a changed persisted contract %s", async (changedField) => {
    const item = await createDeliverable();
    await submitDeliverable(item);
    const row = await queryOne<{ contract_json: string; source_id: string }>(
      `SELECT contract_json, source_id FROM ${TABLES.workspaceCommandContracts} WHERE workspace_id = ? AND command_key = 'work_item.complete'`,
      [workspaceId],
    );
    const contract = JSON.parse(row!.contract_json);
    if (changedField === "permission") contract.permission = "custom.restricted.complete";
    if (changedField === "actor") contract.allowedActorTypes = ["system"];
    if (changedField === "version") contract.contractVersion = "2.0.0";
    await execute(
      `UPDATE ${TABLES.workspaceCommandContracts} SET contract_json = ?, source_id = ? WHERE workspace_id = ? AND command_key = 'work_item.complete'`,
      [JSON.stringify(contract), changedField === "source" ? "custom.workflow" : row!.source_id, workspaceId],
    );
    try {
      await expect(completeWorkItem(workspaceId, item.id, technician, 1))
        .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    } finally {
      await execute(
        `UPDATE ${TABLES.workspaceCommandContracts} SET contract_json = ?, source_id = ? WHERE workspace_id = ? AND command_key = 'work_item.complete'`,
        [row!.contract_json, row!.source_id, workspaceId],
      );
    }
    await expectReady(item);
  });

  it.each(["visit.execute", "forms.submission.submit"])("requires the existing %s business permission", async (permission) => {
    const item = await createDeliverable();
    await submitDeliverable(item);
    const group = await queryOne<{ id: string; permissions_json: string }>(
      `SELECT id, permissions_json FROM ${TABLES.packPermissionGroups}
       WHERE workspace_id = ? AND pack_id = 'fsm-pack' AND group_key = 'field_technician'`,
      [workspaceId],
    );
    await execute(`UPDATE ${TABLES.packPermissionGroups} SET permissions_json = ? WHERE id = ?`, [
      JSON.stringify((JSON.parse(group!.permissions_json) as string[]).filter((value) => value !== permission)),
      group!.id,
    ]);
    try {
      await expect(completeWorkItem(workspaceId, item.id, technician, 1))
        .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    } finally {
      await execute(`UPDATE ${TABLES.packPermissionGroups} SET permissions_json = ? WHERE id = ?`, [group!.permissions_json, group!.id]);
    }
    await expectReady(item);
  });
});
