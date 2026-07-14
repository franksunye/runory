// ── v0.5 SMB Dependency Closure Tests ──
//
// These tests lock the product decision that SMB default execution depends on
// the command kernel, not on Workflow, Automation, MCP, Outbox, Entitlements,
// or Extension. Workflow may be installed and available as an optional overlay,
// but a core FSM pack lifecycle must run without starting a workflow instance.

import { describe, expect, it, beforeEach } from "vitest";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installPack } from "./installer";
import { createRecord, _clearSoftDeleteColumnCache } from "./metadata";
import {
  triageWorkOrder,
  createVisit,
  startWorkOrder,
  startTravel,
  arriveOnSite,
  submitWork,
  completeVisit,
  completeWorkOrder,
  type CommandActor,
} from "./fsm-commands";
import { getCommandHistory } from "./command-runtime";
import {
  createFormBinding,
  acceptFormSubmission,
  getFormDefinition,
  publishFormDefinition,
  reviseFormSubmission,
  returnFormSubmission,
  submitForm,
} from "./forms";
import { completeWorkItem } from "./workflow";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

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

async function createTestWorkspace(): Promise<string> {
  const ts = now();
  const wsId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [wsId, "v0.5 SMB Closure WS", `v05-smb-${wsId}`, ts, ts],
  );
  return wsId;
}

async function countWorkflowInstances(workspaceId: string): Promise<number> {
  const v1 = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.workflowInstances} WHERE workspace_id = ?`,
    [workspaceId],
  );
  const v2 = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.workflowInstances} WHERE workspace_id = ?`,
    [workspaceId],
  );
  return (v1?.count ?? 0) + (v2?.count ?? 0);
}

describe("v0.5 SMB dependency closure", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("runs the core FSM lifecycle through commands without starting workflow", async () => {
    const workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    expect(await countWorkflowInstances(workspaceId)).toBe(0);

    const actor: CommandActor = { type: "user", id: "user_dispatcher" };
    const technicianActor: CommandActor = { type: "user", id: "user_technician" };
    const supervisorActor: CommandActor = { type: "user", id: "user_supervisor" };
    const ownerActor: CommandActor = { type: "user", id: "owner-e2e" };
    const ownerUserId = genId("usr");
    const ts = now();
    await execute(
      `INSERT INTO ${TABLES.users}
       (id, external_id, display_name, status, created_at, updated_at)
       VALUES (?, ?, 'E2E Workspace Owner', 'active', ?, ?)`,
      [ownerUserId, ownerActor.id, ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaceMemberships}
       (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      [genId("wsmem"), workspaceId, ownerUserId, ts, ts],
    );

    const technician = await queryOne<{ id: string }>(
      `SELECT id FROM ${businessTable("technician")} WHERE workspace_id = ? AND resource_id IS NOT NULL LIMIT 1`,
      [workspaceId],
    );
    expect(technician).toBeDefined();

    const workOrder = await createRecord(workspaceId, "work_order", {
      title: "Command-only service call",
      description: "SMB closure fixture",
      status: "new",
      priority: "medium",
      source: "manual",
      notes: "No workflow instance should be required.",
      requested_at: "2026-07-07T09:00:00Z",
    });

    const triage = await triageWorkOrder(workspaceId, workOrder.id, actor, 1, {
      priority: "high",
    });
    expect(triage.status).toBe("succeeded");
    expect(triage.newVersion).toBe(2);

    const visitCreation = await createVisit(
      workspaceId,
      workOrder.id,
      actor,
      2,
      {
        title: "Command-only visit",
        technicianId: technician!.id,
        scheduledStart: "2026-07-07T10:00:00Z",
        scheduledEnd: "2026-07-07T12:00:00Z",
        notes: "Scheduled without workflow.",
      },
    );
    expect(visitCreation.status).toBe("succeeded");
    expect(visitCreation.newVersion).toBe(3);
    expect(visitCreation.aggregate.status).toBe("planned");

    const start = await startWorkOrder(workspaceId, workOrder.id, actor, 3);
    expect(start.status).toBe("succeeded");
    expect(start.newVersion).toBe(4);
    expect(start.aggregate.status).toBe("in_progress");

    const visit = await queryOne<{ id: string; aggregate_version: number }>(
      `SELECT id, aggregate_version FROM ${businessTable("service_visit")}
       WHERE workspace_id = ? AND work_order_id = ?`,
      [workspaceId, workOrder.id],
    );
    expect(visit).toBeDefined();

    const travel = await startTravel(workspaceId, visit!.id, technicianActor, 1);
    expect(travel.aggregate.status).toBe("en_route");

    const arrival = await arriveOnSite(workspaceId, visit!.id, technicianActor, 2);
    expect(arrival.aggregate.status).toBe("on_site");

    const submission = await submitWork(workspaceId, visit!.id, technicianActor, 3);
    expect(submission.status).toBe("succeeded");

    const requirement = await queryOne<{ form_definition_id: string; form_version_id: string; binding_id: string; work_item_id: string }>(
      `SELECT requirement.form_definition_id, requirement.form_version_id,
              requirement.binding_id, work_item.id AS work_item_id
       FROM ${TABLES.visitExecutionRequirements} requirement
       JOIN ${TABLES.workItems} work_item
         ON work_item.workspace_id = requirement.workspace_id
        AND work_item.step_id = requirement.id
       WHERE requirement.workspace_id = ? AND requirement.visit_id = ?`,
      [workspaceId, visit!.id],
    );
    expect(requirement).toBeDefined();
    await submitForm(workspaceId, {
      formDefinitionId: requirement!.form_definition_id,
      formVersionId: requirement!.form_version_id,
      bindingId: requirement!.binding_id,
      workItemId: requirement!.work_item_id,
      subjectType: "service_visit",
      subjectId: visit!.id,
      answers: {
        work_performed: "Command-only closure verification",
        system_status_after_service: "operational",
        "cl-pre-service": { "cl-1": "pass", "cl-2": "pass", "cl-3": "pass", "cl-4": "pass" },
        "evi-photos": { attachments: ["before", "after"] },
        "sig-customer": { acknowledged: true, signedBy: "Test customer" },
      },
      submittedBy: technicianActor.id,
    });

    // Workspace administrators can supervise a technician-owned Visit
    // deliverable without weakening candidate rules for generic workflow work.
    const deliverableCompletion = await completeWorkItem(
      workspaceId,
      requirement!.work_item_id,
      ownerActor,
      1,
    );
    expect(deliverableCompletion.aggregate.status).toBe("completed");

    const visitCompletion = await completeVisit(workspaceId, visit!.id, technicianActor, 3);
    expect(visitCompletion.aggregate.status).toBe("completed");

    const workOrderCompletion = await completeWorkOrder(
      workspaceId,
      workOrder.id,
      supervisorActor,
      4,
      "Command-only closure path completed.",
    );
    expect(workOrderCompletion.aggregate.status).toBe("completed");
    expect(workOrderCompletion.newVersion).toBe(5);

    expect(await countWorkflowInstances(workspaceId)).toBe(0);

    const workOrderHistory = await getCommandHistory(workspaceId, "work_order", workOrder.id);
    expect(workOrderHistory.map((h) => h.commandType).reverse()).toEqual([
      "work_order.triage",
      "work_order.create_visit",
      "work_order.start",
      "work_order.complete",
    ]);

    const visitHistory = await getCommandHistory(workspaceId, "service_visit", visit!.id);
    const visitCommands = visitHistory.map((h) => h.commandType);
    expect(visitCommands).toEqual(expect.arrayContaining([
      "visit.start_travel",
      "visit.arrive",
      "visit.submit_work",
      "visit.complete",
    ]));
    expect(visitCommands).toHaveLength(4);
  });

  it("keeps v0.5 journey fixtures from directly SQL-mutating work order lifecycle", () => {
    const checkedFiles = [
      "src/fsm-pack.test.ts",
      "src/v05-journey.test.ts",
      "src/v05-smb-closure.test.ts",
    ];

    for (const file of checkedFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/UPDATE\s+\$\{businessTable\("work_order"\)\}[\s\S]*SET\s+status\s*=\s*'in_progress'/);
    }
  });

  it("keeps usage policies idempotent and renders the dispatched form version", async () => {
    const workspaceId = await createTestWorkspace();
    const versionOne = await publishFormDefinition(workspaceId, {
      formKey: "versioned-service-checklist",
      name: "Versioned service checklist",
      schema: {
        blocks: [{
          block_type: "field",
          id: "result-v1",
          field_key: "result_v1",
          field_type: "text",
          label: "Original dispatched question",
          required: true,
        }],
      },
    }, "owner");

    const firstBinding = await createFormBinding(workspaceId, versionOne.definitionId, {
      usageType: "service_deliverable",
      usageKey: "service_visit_completion",
      requirementPolicy: "required",
    });
    const repeatedBinding = await createFormBinding(workspaceId, versionOne.definitionId, {
      usageType: "service_deliverable",
      usageKey: "service_visit_completion",
      requirementPolicy: "required",
    });
    expect(repeatedBinding.bindingId).toBe(firstBinding.bindingId);

    await publishFormDefinition(workspaceId, {
      formKey: "versioned-service-checklist",
      name: "Versioned service checklist",
      schema: {
        blocks: [{
          block_type: "field",
          id: "result-v2",
          field_key: "result_v2",
          field_type: "text",
          label: "Later edited question",
          required: true,
        }],
      },
    }, "owner");

    const active = await getFormDefinition(workspaceId, "versioned-service-checklist");
    const dispatched = await getFormDefinition(
      workspaceId,
      "versioned-service-checklist",
      versionOne.versionId,
    );
    expect(active?.schema.blocks[0]?.id).toBe("result-v2");
    expect(dispatched?.schema.blocks[0]?.id).toBe("result-v1");
  });

  it("creates auditable post-submission revisions under the usage policy", async () => {
    const workspaceId = await createTestWorkspace();
    const definition = await publishFormDefinition(workspaceId, {
      formKey: "correctable-service-form",
      name: "Correctable service form",
      schema: {
        blocks: [
          {
            block_type: "field",
            id: "result",
            field_key: "result",
            field_type: "text",
            label: "Result",
            required: true,
          },
          {
            block_type: "signature",
            id: "customer-signature",
            label: "Customer signature",
            required: true,
          },
        ],
      },
    }, "owner");
    const binding = await createFormBinding(workspaceId, definition.definitionId, {
      usageType: "service_deliverable",
      usageKey: "service_visit_completion",
      requirementPolicy: "required",
      timing: { postSubmissionPolicy: "reason_required" },
    });
    const original = await submitForm(workspaceId, {
      formDefinitionId: definition.definitionId,
      formVersionId: definition.versionId,
      bindingId: binding.bindingId,
      subjectType: "service_visit",
      subjectId: "visit-correction",
      answers: { result: "Original", "customer-signature": { acknowledged: true, signedBy: "Customer A" } },
      submittedBy: "technician",
    });

    await expect(
      reviseFormSubmission(workspaceId, original.submissionId, "owner")
    ).rejects.toThrow(/correction reason is required/i);

    const revision = await reviseFormSubmission(
      workspaceId,
      original.submissionId,
      "owner",
      "Correct the recorded result"
    );
    expect(revision).toMatchObject({ revisionNumber: 2, policy: "reason_required", reused: false });
    const draftAnswers = await queryOne<{ answers_json: string }>(
      `SELECT answers_json FROM ${TABLES.formSubmissions} WHERE id = ?`,
      [revision.draftSubmissionId]
    );
    expect(JSON.parse(draftAnswers!.answers_json)).toEqual({ result: "Original" });
    const repeated = await reviseFormSubmission(
      workspaceId,
      original.submissionId,
      "owner",
      "Repeated click"
    );
    expect(repeated).toMatchObject({ draftSubmissionId: revision.draftSubmissionId, reused: true });

    const promoted = await submitForm(workspaceId, {
      formDefinitionId: definition.definitionId,
      formVersionId: definition.versionId,
      bindingId: binding.bindingId,
      subjectType: "service_visit",
      subjectId: "visit-correction",
      answers: { result: "Corrected", "customer-signature": { acknowledged: true, signedBy: "Customer B" } },
      submittedBy: "owner",
      draftSubmissionId: revision.draftSubmissionId,
    });
    expect(promoted).toEqual({ submissionId: revision.draftSubmissionId, revisionNumber: 2 });
    const stored = await queryOne<{
      status: string;
      answers_json: string;
      supersedes_submission_id: string;
      return_reason: string;
    }>(
      `SELECT status, answers_json, supersedes_submission_id, return_reason
       FROM ${TABLES.formSubmissions} WHERE id = ?`,
      [revision.draftSubmissionId]
    );
    expect(stored).toMatchObject({
      status: "submitted",
      supersedes_submission_id: original.submissionId,
      return_reason: "Correct the recorded result",
    });
    expect(JSON.parse(stored!.answers_json)).toEqual({
      result: "Corrected",
      "customer-signature": { acknowledged: true, signedBy: "Customer B" },
    });
    await expect(
      acceptFormSubmission(workspaceId, original.submissionId, "reviewer")
    ).rejects.toThrow(/only the current revision/i);
    await expect(
      returnFormSubmission(workspaceId, original.submissionId, "reviewer", "Outdated review")
    ).rejects.toThrow(/only the current revision/i);
    await expect(
      reviseFormSubmission(workspaceId, original.submissionId, "owner", "Branch from old revision")
    ).rejects.toThrow(/only the current revision/i);
  });
});
