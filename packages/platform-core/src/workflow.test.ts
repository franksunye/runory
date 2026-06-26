import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, execute, genId, now, queryAll } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import {
  createWorkflowDefinition,
  getWorkflowDefinitions,
  getWorkflowDefinition,
  updateWorkflowDefinition,
  deleteWorkflowDefinition,
  startWorkflow,
  getWorkflowInstance,
  getWorkflowInstances,
  transitionWorkflow,
  getAvailableTransitions,
  evaluateConditions,
  getPendingApprovals,
  getRecordWorkflow,
  getAutoStartWorkflowDefinitions,
  isTerminalState,
  type WorkflowActor,
} from "./workflow";
import { createRecord, getRecord } from "./metadata";
import type { WorkflowDefinition } from "@runory/contracts";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Test fixture ──

let workspaceId: string;
let workspaceId2: string;

const adminActor: WorkflowActor = {
  id: "usr_admin",
  type: "user",
  role: "admin",
};

const memberActor: WorkflowActor = {
  id: "usr_member",
  type: "user",
  role: "member",
};

const viewerActor: WorkflowActor = {
  id: "usr_viewer",
  type: "user",
  role: "viewer",
};

// A canonical approval workflow: draft → pending_approval → approved/rejected
const APPROVAL_WORKFLOW: WorkflowDefinition = {
  id: "quote-approval",
  name: "报价审批流",
  targetObject: "quote",
  initialState: "draft",
  states: [
    { name: "draft", label: "草稿", type: "initial" },
    { name: "pending_approval", label: "待审批", type: "intermediate" },
    { name: "approved", label: "已批准", type: "approved" },
    { name: "rejected", label: "已拒绝", type: "rejected" },
  ],
  transitions: [
    {
      fromStatus: "draft",
      toStatus: "pending_approval",
      label: "提交审批",
      requiresApproval: false,
      requiredRole: "member",
    },
    {
      fromStatus: "pending_approval",
      toStatus: "approved",
      label: "批准",
      requiresApproval: true,
      requiredRole: "admin",
    },
    {
      fromStatus: "pending_approval",
      toStatus: "rejected",
      label: "拒绝",
      requiresApproval: true,
      requiredRole: "admin",
    },
  ],
  autoStart: false,
};

beforeAll(async () => {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;

  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DROP TABLE IF EXISTS "${name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
});

beforeEach(async () => {
  const tables = [
    TABLES.automationRuns,
    TABLES.automationDefinitions,
    TABLES.workflowInstances,
    TABLES.workflowDefinitions,
    TABLES.extensionFieldValues,
    TABLES.auditLogs,
    TABLES.navigationItems,
    TABLES.viewDefinitions,
    TABLES.fieldDefinitions,
    TABLES.objectDefinitions,
    TABLES.installations,
    TABLES.extensionVersions,
    TABLES.extensionDefinitions,
    TABLES.workspaceMemberships,
    TABLES.organizationMemberships,
    TABLES.workspaceTenants,
    TABLES.workspaces,
    TABLES.organizations,
    TABLES.users,
  ];
  for (const t of tables) {
    try { await db.execute({ sql: `DELETE FROM ${t}` }); } catch {}
  }

  // Clear business tables
  const bizTables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'runory_business_%' ORDER BY name DESC",
  });
  for (const row of bizTables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DELETE FROM "${name}"` });
  }

  // Create workspaces
  const ts = now();
  workspaceId = genId("ws");
  workspaceId2 = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, "Test WS", "test-ws", ts, ts]
  );
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId2, "Test WS 2", "test-ws-2", ts, ts]
  );
});

// ── Workflow Definition Tests ──

describe("createWorkflowDefinition", () => {
  it("creates a workflow definition", async () => {
    const def = await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    expect(def.id).toBe("quote-approval");
    expect(def.name).toBe("报价审批流");
    expect(def.targetObject).toBe("quote");
    expect(def.initialState).toBe("draft");
    expect(def.states).toHaveLength(4);
    expect(def.transitions).toHaveLength(3);
  });

  it("rejects invalid workflow (initialState not in states)", async () => {
    const bad: WorkflowDefinition = {
      ...APPROVAL_WORKFLOW,
      initialState: "nonexistent",
    };
    await expect(createWorkflowDefinition(workspaceId, bad)).rejects.toThrow();
  });

  it("rejects transition referencing undeclared state", async () => {
    const bad: WorkflowDefinition = {
      ...APPROVAL_WORKFLOW,
      transitions: [
        {
          fromStatus: "draft",
          toStatus: "nonexistent_state",
          label: "Bad",
          requiresApproval: false,
          requiredRole: "member",
        },
      ],
    };
    await expect(createWorkflowDefinition(workspaceId, bad)).rejects.toThrow();
  });

  it("isolates definitions by workspace", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    await createWorkflowDefinition(workspaceId2, APPROVAL_WORKFLOW);

    const ws1 = await getWorkflowDefinitions(workspaceId);
    const ws2 = await getWorkflowDefinitions(workspaceId2);
    expect(ws1).toHaveLength(1);
    expect(ws2).toHaveLength(1);
    expect(ws1[0].id).toBe("quote-approval");
    expect(ws2[0].id).toBe("quote-approval");
  });
});

describe("getWorkflowDefinition", () => {
  it("returns the definition by workflow_id", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const def = await getWorkflowDefinition(workspaceId, "quote-approval");
    expect(def).toBeDefined();
    expect(def!.name).toBe("报价审批流");
  });

  it("returns undefined for unknown workflow_id", async () => {
    const def = await getWorkflowDefinition(workspaceId, "nonexistent");
    expect(def).toBeUndefined();
  });

  it("does not leak across workspaces", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const def = await getWorkflowDefinition(workspaceId2, "quote-approval");
    expect(def).toBeUndefined();
  });
});

describe("deleteWorkflowDefinition", () => {
  it("deletes an existing definition", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const deleted = await deleteWorkflowDefinition(workspaceId, "quote-approval");
    expect(deleted).toBe(true);
    const def = await getWorkflowDefinition(workspaceId, "quote-approval");
    expect(def).toBeUndefined();
  });

  it("returns false for unknown definition", async () => {
    const deleted = await deleteWorkflowDefinition(workspaceId, "nonexistent");
    expect(deleted).toBe(false);
  });
});

// ── Workflow Instance Tests ──

describe("startWorkflow", () => {
  it("creates an instance with the initial state", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const instance = await startWorkflow(
      workspaceId,
      "quote-approval",
      "quote",
      "rec_123",
      memberActor
    );
    expect(instance.id).toBeDefined();
    expect(instance.currentState).toBe("draft");
    expect(instance.workflowId).toBe("quote-approval");
    expect(instance.objectType).toBe("quote");
    expect(instance.recordId).toBe("rec_123");
    expect(instance.history).toEqual([]);
  });

  it("throws NotFoundError for unknown workflow", async () => {
    await expect(
      startWorkflow(workspaceId, "nonexistent", "quote", "rec_1", memberActor)
    ).rejects.toThrow();
  });

  it("rejects mismatched object type", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    await expect(
      startWorkflow(workspaceId, "quote-approval", "customer", "rec_1", memberActor)
    ).rejects.toThrow();
  });
});

describe("getWorkflowInstance", () => {
  it("returns the instance", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const created = await startWorkflow(
      workspaceId,
      "quote-approval",
      "quote",
      "rec_1",
      memberActor
    );
    const fetched = await getWorkflowInstance(workspaceId, created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.currentState).toBe("draft");
  });

  it("returns undefined for unknown instance", async () => {
    const fetched = await getWorkflowInstance(workspaceId, "nonexistent");
    expect(fetched).toBeUndefined();
  });
});

describe("getWorkflowInstances", () => {
  it("filters by objectType and recordId", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    await startWorkflow(workspaceId, "quote-approval", "quote", "rec_a", memberActor);
    await startWorkflow(workspaceId, "quote-approval", "quote", "rec_b", memberActor);

    const all = await getWorkflowInstances(workspaceId);
    expect(all).toHaveLength(2);

    const forA = await getWorkflowInstances(workspaceId, "quote", "rec_a");
    expect(forA).toHaveLength(1);
    expect(forA[0].recordId).toBe("rec_a");
  });

  it("filters by status", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_a", memberActor);
    await transitionWorkflow(workspaceId, inst.id, "draft->pending_approval", memberActor);

    const drafts = await getWorkflowInstances(workspaceId, undefined, undefined, "draft");
    const pending = await getWorkflowInstances(workspaceId, undefined, undefined, "pending_approval");
    expect(drafts).toHaveLength(0);
    expect(pending).toHaveLength(1);
  });
});

// ── Transition Tests ──

describe("transitionWorkflow", () => {
  it("executes a valid transition", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);

    const updated = await transitionWorkflow(
      workspaceId,
      inst.id,
      "draft->pending_approval",
      memberActor,
      "提交审批"
    );
    expect(updated.currentState).toBe("pending_approval");
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0].fromStatus).toBe("draft");
    expect(updated.history[0].toStatus).toBe("pending_approval");
    expect(updated.history[0].actorId).toBe("usr_member");
    expect(updated.history[0].comment).toBe("提交审批");
  });

  it("rejects transition with wrong fromStatus", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);

    // Try to approve from draft (should fail; needs to go through pending_approval first)
    await expect(
      transitionWorkflow(workspaceId, inst.id, "pending_approval->approved", adminActor)
    ).rejects.toThrow();
  });

  it("rejects transition when actor role is insufficient", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);

    // Move to pending_approval
    await transitionWorkflow(workspaceId, inst.id, "draft->pending_approval", memberActor);

    // Try to approve as viewer (should fail; requires admin)
    await expect(
      transitionWorkflow(workspaceId, inst.id, "pending_approval->approved", viewerActor)
    ).rejects.toThrow();
  });

  it("rejects transition when actor role is insufficient (member trying admin action)", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);

    await transitionWorkflow(workspaceId, inst.id, "draft->pending_approval", memberActor);

    // Member cannot approve (requires admin)
    await expect(
      transitionWorkflow(workspaceId, inst.id, "pending_approval->approved", memberActor)
    ).rejects.toThrow();
  });

  it("allows admin to execute member-level transitions", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);

    // Admin can submit (role hierarchy: admin > member)
    const updated = await transitionWorkflow(
      workspaceId,
      inst.id,
      "draft->pending_approval",
      adminActor
    );
    expect(updated.currentState).toBe("pending_approval");
  });

  it("appends to history correctly across multiple transitions", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);

    const afterSubmit = await transitionWorkflow(
      workspaceId,
      inst.id,
      "draft->pending_approval",
      memberActor,
      "提交"
    );
    expect(afterSubmit.history).toHaveLength(1);

    const afterApprove = await transitionWorkflow(
      workspaceId,
      inst.id,
      "pending_approval->approved",
      adminActor,
      "批准"
    );
    expect(afterApprove.currentState).toBe("approved");
    expect(afterApprove.history).toHaveLength(2);
    expect(afterApprove.history[0].toStatus).toBe("pending_approval");
    expect(afterApprove.history[1].toStatus).toBe("approved");
    expect(afterApprove.history[1].actorId).toBe("usr_admin");
  });

  it("supports transitionId by label", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);

    const updated = await transitionWorkflow(workspaceId, inst.id, "提交审批", memberActor);
    expect(updated.currentState).toBe("pending_approval");
  });

  it("throws NotFoundError for unknown instance", async () => {
    await expect(
      transitionWorkflow(workspaceId, "nonexistent", "draft->pending_approval", memberActor)
    ).rejects.toThrow();
  });
});

// ── Available Transitions Tests ──

describe("getAvailableTransitions", () => {
  it("returns transitions for the current state", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);

    const transitions = await getAvailableTransitions(workspaceId, inst.id, "member");
    expect(transitions).toHaveLength(1);
    expect(transitions[0].label).toBe("提交审批");
  });

  it("filters by actor role", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);

    // Move to pending_approval
    await transitionWorkflow(workspaceId, inst.id, "draft->pending_approval", memberActor);

    // Admin sees approve + reject
    const adminTransitions = await getAvailableTransitions(workspaceId, inst.id, "admin");
    expect(adminTransitions).toHaveLength(2);
    const labels = adminTransitions.map(t => t.label);
    expect(labels).toContain("批准");
    expect(labels).toContain("拒绝");

    // Viewer sees none (requires admin)
    const viewerTransitions = await getAvailableTransitions(workspaceId, inst.id, "viewer");
    expect(viewerTransitions).toHaveLength(0);

    // Member sees none (requires admin)
    const memberTransitions = await getAvailableTransitions(workspaceId, inst.id, "member");
    expect(memberTransitions).toHaveLength(0);
  });

  it("returns empty array in terminal states", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const inst = await startWorkflow(workspaceId, "quote-approval", "quote", "rec_1", memberActor);
    await transitionWorkflow(workspaceId, inst.id, "draft->pending_approval", memberActor);
    await transitionWorkflow(workspaceId, inst.id, "pending_approval->approved", adminActor);

    const transitions = await getAvailableTransitions(workspaceId, inst.id, "admin");
    expect(transitions).toHaveLength(0);
  });
});

// ── Condition Evaluation Tests ──

describe("evaluateConditions", () => {
  it("returns true when no conditions", () => {
    expect(evaluateConditions({ a: 1 }, [])).toBe(true);
  });

  it("evaluates eq operator", () => {
    expect(evaluateConditions({ status: "draft" }, [
      { field: "status", operator: "eq", value: "draft" },
    ])).toBe(true);
    expect(evaluateConditions({ status: "approved" }, [
      { field: "status", operator: "eq", value: "draft" },
    ])).toBe(false);
  });

  it("evaluates neq operator", () => {
    expect(evaluateConditions({ status: "approved" }, [
      { field: "status", operator: "neq", value: "draft" },
    ])).toBe(true);
  });

  it("evaluates gt/lt/gte/lte operators", () => {
    const record = { amount: 150000 };
    expect(evaluateConditions(record, [
      { field: "amount", operator: "gt", value: 100000 },
    ])).toBe(true);
    expect(evaluateConditions(record, [
      { field: "amount", operator: "lt", value: 100000 },
    ])).toBe(false);
    expect(evaluateConditions(record, [
      { field: "amount", operator: "gte", value: 150000 },
    ])).toBe(true);
    expect(evaluateConditions(record, [
      { field: "amount", operator: "lte", value: 150000 },
    ])).toBe(true);
  });

  it("evaluates contains operator (string)", () => {
    expect(evaluateConditions({ name: "Alice Smith" }, [
      { field: "name", operator: "contains", value: "Smith" },
    ])).toBe(true);
    expect(evaluateConditions({ name: "Alice" }, [
      { field: "name", operator: "contains", value: "Smith" },
    ])).toBe(false);
  });

  it("evaluates contains operator (array)", () => {
    expect(evaluateConditions({ tags: ["a", "b"] }, [
      { field: "tags", operator: "contains", value: "a" },
    ])).toBe(true);
  });

  it("evaluates in operator", () => {
    expect(evaluateConditions({ status: "approved" }, [
      { field: "status", operator: "in", value: ["approved", "rejected"] },
    ])).toBe(true);
    expect(evaluateConditions({ status: "draft" }, [
      { field: "status", operator: "in", value: ["approved", "rejected"] },
    ])).toBe(false);
  });

  it("combines multiple conditions with AND", () => {
    const record = { amount: 150000, status: "draft" };
    expect(evaluateConditions(record, [
      { field: "amount", operator: "gt", value: 100000 },
      { field: "status", operator: "eq", value: "draft" },
    ])).toBe(true);
    expect(evaluateConditions(record, [
      { field: "amount", operator: "gt", value: 100000 },
      { field: "status", operator: "eq", value: "approved" },
    ])).toBe(false);
  });

  it("returns false for missing field", () => {
    expect(evaluateConditions({ a: 1 }, [
      { field: "missing", operator: "eq", value: "x" },
    ])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v0.3.5 — Condition enforcement during transition + system action steps
// ─────────────────────────────────────────────────────────────────────────────

describe("transitionWorkflow condition enforcement (v0.3.5)", () => {
  it("enforces conditions by fetching the bound record", async () => {
    // Create a workflow with a conditional transition
    const def: WorkflowDefinition = {
      id: "conditional-workflow",
      name: "条件工作流",
      targetObject: "quote",
      initialState: "draft",
      states: [
        { name: "draft", label: "草稿", type: "initial" },
        { name: "approved", label: "已批准", type: "approved" },
      ],
      transitions: [
        {
          fromStatus: "draft",
          toStatus: "approved",
          label: "批准",
          requiresApproval: false,
          requiredRole: "member",
          conditions: [
            { field: "amount", operator: "gt", value: 1000 },
          ],
        },
      ],
      autoStart: false,
    };
    await createWorkflowDefinition(workspaceId, def);
    const instance = await startWorkflow(workspaceId, "conditional-workflow", "quote", "rec1", adminActor);

    // The transition should fail because conditions require fetching the record,
    // and the record/table doesn't exist (no pack installed). This proves that
    // conditions are now enforced — previously they were silently ignored.
    await expect(
      transitionWorkflow(workspaceId, instance.id, "draft->approved", adminActor)
    ).rejects.toThrow();
  });

  it("allows transition without conditions (backward compatible)", async () => {
    // The APPROVAL_WORKFLOW has no conditions on its transitions
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const instance = await startWorkflow(workspaceId, "quote-approval", "quote", "rec1", memberActor);

    // Should succeed without fetching a record (no conditions to evaluate)
    const result = await transitionWorkflow(workspaceId, instance.id, "draft->pending_approval", memberActor);
    expect(result.currentState).toBe("pending_approval");
  });
});

describe("transitionWorkflow system action (v0.3.5)", () => {
  it("accepts systemAction in workflow definition schema", async () => {
    const def: WorkflowDefinition = {
      id: "system-action-workflow",
      name: "系统动作工作流",
      targetObject: "quote",
      initialState: "draft",
      states: [
        { name: "draft", label: "草稿", type: "initial" },
        { name: "submitted", label: "已提交", type: "intermediate" },
      ],
      transitions: [
        {
          fromStatus: "draft",
          toStatus: "submitted",
          label: "提交",
          requiresApproval: false,
          requiredRole: "member",
          systemAction: {
            type: "send_notification",
            message: "报价单 {{record.name}} 已提交",
          },
        },
      ],
      autoStart: false,
    };
    const created = await createWorkflowDefinition(workspaceId, def);
    expect(created.transitions[0].systemAction).toBeDefined();
    expect(created.transitions[0].systemAction!.type).toBe("send_notification");
  });

  it("executes system action after transition (best-effort)", async () => {
    const def: WorkflowDefinition = {
      id: "notification-workflow",
      name: "通知工作流",
      targetObject: "quote",
      initialState: "draft",
      states: [
        { name: "draft", label: "草稿", type: "initial" },
        { name: "notified", label: "已通知", type: "intermediate" },
      ],
      transitions: [
        {
          fromStatus: "draft",
          toStatus: "notified",
          label: "发送通知",
          requiresApproval: false,
          requiredRole: "member",
          systemAction: {
            type: "send_notification",
            message: "通知: {{record.name}}",
          },
        },
      ],
      autoStart: false,
    };
    await createWorkflowDefinition(workspaceId, def);
    const instance = await startWorkflow(workspaceId, "notification-workflow", "quote", "rec1", memberActor);

    // The transition should succeed even if the system action fails
    // (best-effort semantics). Since there's no real record, the system
    // action will fail silently, but the state change persists.
    const result = await transitionWorkflow(workspaceId, instance.id, "draft->notified", memberActor);
    expect(result.currentState).toBe("notified");
    expect(result.history).toHaveLength(1);
    expect(result.history[0].toStatus).toBe("notified");
  });
});

describe("workflow audit actions (v0.3.5)", () => {
  it("writes workflow.start audit event", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    await startWorkflow(workspaceId, "quote-approval", "quote", "rec1", memberActor);

    const auditEvents = await queryAll<{ action: string }>(
      `SELECT action FROM ${TABLES.auditLogs} WHERE action LIKE 'workflow.%'`,
      []
    );
    const startEvents = auditEvents.filter(e => e.action === "workflow.start");
    expect(startEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("writes workflow.transition audit event", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const instance = await startWorkflow(workspaceId, "quote-approval", "quote", "rec1", memberActor);
    await transitionWorkflow(workspaceId, instance.id, "draft->pending_approval", memberActor);

    const auditEvents = await queryAll<{ action: string }>(
      `SELECT action FROM ${TABLES.auditLogs} WHERE action LIKE 'workflow.%'`,
      []
    );
    const transitionEvents = auditEvents.filter(e => e.action === "workflow.transition");
    expect(transitionEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("writes workflow.approve audit event for approval transitions", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const instance = await startWorkflow(workspaceId, "quote-approval", "quote", "rec1", memberActor);
    await transitionWorkflow(workspaceId, instance.id, "draft->pending_approval", memberActor);
    await transitionWorkflow(workspaceId, instance.id, "pending_approval->approved", adminActor);

    const auditEvents = await queryAll<{ action: string }>(
      `SELECT action FROM ${TABLES.auditLogs} WHERE action = 'workflow.approve'`,
      []
    );
    expect(auditEvents).toHaveLength(1);
  });
});

// ── stateField Auto-Sync Tests (v0.4) ──

/** Helper: set up a deal business table + object/field definitions for stateField tests */
async function setupDealObject(wsId: string) {
  const ts = now();
  const tbl = businessTable("deal");

  // Create business table
  await execute(
    `CREATE TABLE IF NOT EXISTS ${tbl} (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT,
      stage TEXT DEFAULT 'new',
      amount REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, id)
    )`,
    []
  );

  // Object definition
  await execute(
    `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at)
     VALUES (?, ?, 'deal', 'Deal', 'test', 'module_owned', ?)`,
    [genId("obj"), wsId, ts]
  );

  // Field definitions
  const fields = [
    { key: "name", label: "Name", type: "text" },
    { key: "stage", label: "Stage", type: "select" },
    { key: "amount", label: "Amount", type: "number" },
  ];
  for (const f of fields) {
    await execute(
      `INSERT INTO ${TABLES.fieldDefinitions}
       (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, created_at)
       VALUES (?, ?, 'deal', ?, ?, ?, 'module_owned', 0, ?, ?, 'test', ?)`,
      [
        genId("fld"),
        wsId,
        f.key,
        f.label,
        f.type,
        f.key === "stage" ? "new" : null,
        f.key === "stage" ? JSON.stringify({ options: ["new", "qualified", "won", "lost"] }) : null,
        ts,
      ]
    );
  }
}

const STATE_FIELD_WORKFLOW: WorkflowDefinition = {
  id: "deal-stage-flow",
  name: "Deal Stage Flow",
  targetObject: "deal",
  initialState: "new",
  stateField: "stage",
  autoStart: false,
  states: [
    { name: "new", label: "New", type: "initial" },
    { name: "qualified", label: "Qualified", type: "intermediate" },
    { name: "won", label: "Won", type: "final" },
    { name: "lost", label: "Lost", type: "rejected" },
  ],
  transitions: [
    { fromStatus: "new", toStatus: "qualified", label: "Qualify", requiresApproval: false, requiredRole: "member" },
    { fromStatus: "qualified", toStatus: "won", label: "Close Won", requiresApproval: true, requiredRole: "admin" },
    { fromStatus: "qualified", toStatus: "lost", label: "Close Lost", requiresApproval: false, requiredRole: "member" },
  ],
};

describe("stateField auto-sync", () => {
  it("syncs initialState to record on startWorkflow", async () => {
    await setupDealObject(workspaceId);
    await createWorkflowDefinition(workspaceId, STATE_FIELD_WORKFLOW);

    // Create a deal record
    const record = await createRecord(workspaceId, "deal", { name: "Test Deal", stage: "new" });

    // Start workflow — should sync initialState ("new") to stage
    const instance = await startWorkflow(workspaceId, "deal-stage-flow", "deal", record.id, memberActor);

    // Verify the record's stage was synced
    const updated = await getRecord(workspaceId, "deal", record.id);
    expect(updated?.stage).toBe("new");

    // Verify instance was created with correct initial state
    expect(instance.currentState).toBe("new");
  });

  it("syncs new state to record field on transition", async () => {
    await setupDealObject(workspaceId);
    await createWorkflowDefinition(workspaceId, STATE_FIELD_WORKFLOW);

    const record = await createRecord(workspaceId, "deal", { name: "Sync Test Deal", stage: "new" });
    const instance = await startWorkflow(workspaceId, "deal-stage-flow", "deal", record.id, memberActor);

    // Transition: new → qualified
    await transitionWorkflow(workspaceId, instance.id, "new->qualified", memberActor);

    // Verify the record's stage was synced to "qualified"
    const updated = await getRecord(workspaceId, "deal", record.id);
    expect(updated?.stage).toBe("qualified");
  });

  it("syncs state on approval transition", async () => {
    await setupDealObject(workspaceId);
    await createWorkflowDefinition(workspaceId, STATE_FIELD_WORKFLOW);

    const record = await createRecord(workspaceId, "deal", { name: "Approval Sync Deal", stage: "new" });
    const instance = await startWorkflow(workspaceId, "deal-stage-flow", "deal", record.id, memberActor);

    // new → qualified
    await transitionWorkflow(workspaceId, instance.id, "new->qualified", memberActor);

    // qualified → won (requires admin)
    await transitionWorkflow(workspaceId, instance.id, "qualified->won", adminActor);

    // Verify the record's stage was synced to "won"
    const updated = await getRecord(workspaceId, "deal", record.id);
    expect(updated?.stage).toBe("won");
  });

  it("does not block transition when sync fails (best-effort)", async () => {
    // Create workflow without setting up the deal table
    await createWorkflowDefinition(workspaceId, STATE_FIELD_WORKFLOW);

    // Use a non-existent record — sync will fail but transition should succeed
    const instance = await startWorkflow(workspaceId, "deal-stage-flow", "deal", "nonexistent-rec", memberActor);

    // Transition should succeed even though sync fails
    await transitionWorkflow(workspaceId, instance.id, "new->qualified", memberActor);

    const updated = await getWorkflowInstance(workspaceId, instance.id);
    expect(updated?.currentState).toBe("qualified");
  });
});

describe("updateWorkflowDefinition", () => {
  it("updates workflow name and transitions", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);

    const updated = await updateWorkflowDefinition(workspaceId, "quote-approval", {
      name: "Updated Approval Flow",
      transitions: [
        ...APPROVAL_WORKFLOW.transitions,
        { fromStatus: "approved", toStatus: "archived", label: "Archive", requiresApproval: false, requiredRole: "admin" },
      ],
      states: [
        ...APPROVAL_WORKFLOW.states,
        { name: "archived", label: "Archived", type: "final" },
      ],
    });

    expect(updated.name).toBe("Updated Approval Flow");
    expect(updated.transitions).toHaveLength(4);
    expect(updated.states.some(s => s.name === "archived")).toBe(true);
  });

  it("rejects update when existing instance is in a removed state", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const instance = await startWorkflow(workspaceId, "quote-approval", "quote", "rec1", memberActor);
    await transitionWorkflow(workspaceId, instance.id, "draft->pending_approval", memberActor);

    // Try to remove "pending_approval" state — should fail
    await expect(
      updateWorkflowDefinition(workspaceId, "quote-approval", {
        states: APPROVAL_WORKFLOW.states.filter(s => s.name !== "pending_approval"),
        transitions: APPROVAL_WORKFLOW.transitions.filter(t => t.fromStatus !== "pending_approval" && t.toStatus !== "pending_approval"),
      })
    ).rejects.toThrow(/pending_approval/);
  });

  it("updates stateField and autoStart", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);

    const updated = await updateWorkflowDefinition(workspaceId, "quote-approval", {
      stateField: "status",
      autoStart: true,
    });

    expect(updated.stateField).toBe("status");
    expect(updated.autoStart).toBe(true);
  });
});

describe("getRecordWorkflow", () => {
  it("returns undefined when no workflow instance is bound", async () => {
    const result = await getRecordWorkflow(workspaceId, "deal", "nonexistent-rec");
    expect(result).toBeUndefined();
  });

  it("returns instance and definition for a bound record", async () => {
    await createWorkflowDefinition(workspaceId, APPROVAL_WORKFLOW);
    const instance = await startWorkflow(workspaceId, "quote-approval", "quote", "rec-bound", memberActor);

    const result = await getRecordWorkflow(workspaceId, "quote", "rec-bound");
    expect(result).toBeDefined();
    expect(result?.instance.id).toBe(instance.id);
    expect(result?.definition.id).toBe("quote-approval");
  });
});

describe("getAutoStartWorkflowDefinitions", () => {
  it("returns only auto-start workflows for the given object", async () => {
    await createWorkflowDefinition(workspaceId, { ...APPROVAL_WORKFLOW, autoStart: true });
    await createWorkflowDefinition(workspaceId, { ...STATE_FIELD_WORKFLOW, autoStart: false });

    const result = await getAutoStartWorkflowDefinitions(workspaceId, "quote");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("quote-approval");
  });

  it("returns empty array when no auto-start workflows exist", async () => {
    await createWorkflowDefinition(workspaceId, { ...APPROVAL_WORKFLOW, autoStart: false });

    const result = await getAutoStartWorkflowDefinitions(workspaceId, "quote");
    expect(result).toHaveLength(0);
  });
});

describe("isTerminalState", () => {
  const def: WorkflowDefinition = {
    id: "test",
    name: "Test",
    targetObject: "test",
    initialState: "draft",
    autoStart: false,
    states: [
      { name: "draft", label: "Draft", type: "initial" },
      { name: "review", label: "Review", type: "intermediate" },
      { name: "approved", label: "Approved", type: "approved" },
      { name: "rejected", label: "Rejected", type: "rejected" },
      { name: "done", label: "Done", type: "final" },
    ],
    transitions: [],
  };

  it("returns false for initial and intermediate states", () => {
    expect(isTerminalState(def, "draft")).toBe(false);
    expect(isTerminalState(def, "review")).toBe(false);
  });

  it("returns true for approved, rejected, and final states", () => {
    expect(isTerminalState(def, "approved")).toBe(true);
    expect(isTerminalState(def, "rejected")).toBe(true);
    expect(isTerminalState(def, "done")).toBe(true);
  });

  it("returns false for unknown state", () => {
    expect(isTerminalState(def, "unknown")).toBe(false);
  });
});
