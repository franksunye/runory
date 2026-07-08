import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the db module ──
//
// All handlers in workflow.ts call queryOne / genId / now from "./db".
// We mock the entire module so no real database connection is needed.
// genId uses a closure-scoped counter so every call returns a unique id.
vi.mock("../db", () => {
  let idCounter = 0;
  return {
    queryOne: vi.fn(),
    queryAll: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    genId: vi.fn((prefix: string) => `${prefix}_mock_${++idCounter}`),
    now: vi.fn(() => "2026-07-08T00:00:00.000Z"),
  };
});

// ── Mock permission-groups ──
//
// checkCandidateEligibility() calls getUserPermissionGroups() when the work
// item has a permission-group assignment.  Mocking this module prevents any
// database round-trip and returns an empty group list.
vi.mock("../permission-groups", () => ({
  getUserPermissionGroups: vi.fn().mockResolvedValue([]),
}));

import { queryOne } from "../db";
import {
  claimWorkItemHandler,
  cancelWorkItemHandler,
  approvalDecideHandler,
  returnWorkItemHandler,
  type WorkItemRow,
  type WorkflowInstanceRow,
  type WorkflowDefinitionVersionRow,
} from "../workflow";
import type { CommandActor } from "../command-runtime";

// ── Test Fixtures ──

const actor: CommandActor = { type: "user", id: "user-1" };

const baseWorkItem: WorkItemRow = {
  id: "wi-1",
  workspace_id: "ws-1",
  instance_id: "wfi-1",
  step_id: "step-1",
  kind: "human_task",
  status: "ready",
  subject_type: "record",
  subject_id: "rec-1",
  assignee_type: null,
  assignee_id: null,
  candidate_rule_json: null,
  due_at: null,
  claimed_by: null,
  claimed_at: null,
  completed_at: null,
  form_binding_id: null,
  input_snapshot_json: null,
  input_snapshot_hash: null,
  version: 1,
  created_at: "2026-07-08T00:00:00.000Z",
  updated_at: "2026-07-08T00:00:00.000Z",
};

const approvalWorkItem: WorkItemRow = {
  ...baseWorkItem,
  id: "wi-approval-1",
  step_id: "approval-1",
  kind: "approval",
  status: "ready",
};

const mockInstance: WorkflowInstanceRow = {
  id: "wfi-1",
  workspace_id: "ws-1",
  workflow_definition_id: "wfd-1",
  definition_version_id: "wfv-1",
  object_type: "record",
  record_id: "rec-1",
  status: "running",
  current_step_id: "step-1",
  version: 1,
  started_by: "user-1",
  started_at: "2026-07-08T00:00:00.000Z",
  completed_at: null,
  created_at: "2026-07-08T00:00:00.000Z",
  updated_at: "2026-07-08T00:00:00.000Z",
};

const workflowDefinitionJson = JSON.stringify({
  workflowKey: "test-workflow",
  name: "Test Workflow",
  targetObject: "record",
  initialState: "draft",
  steps: [
    { id: "start", kind: "start", next: "step-1" },
    { id: "step-1", kind: "human_task", next: "approval-1" },
    { id: "approval-1", kind: "approval", onApprove: "end" },
    { id: "end", kind: "end" },
  ],
});

const mockDefVersionRow: WorkflowDefinitionVersionRow = {
  id: "wfv-1",
  workspace_id: "ws-1",
  workflow_definition_id: "wfd-1",
  version_number: 1,
  definition_json: workflowDefinitionJson,
  schema_version: "2.0",
  published_by: "user-1",
  published_at: "2026-07-08T00:00:00.000Z",
  created_at: "2026-07-08T00:00:00.000Z",
};

const mockedQueryOne = vi.mocked(queryOne);

beforeEach(() => {
  mockedQueryOne.mockReset();
});

// ── Tests ──

describe("claimWorkItemHandler", () => {
  it("returns CommandHandlerResult with correct structure", async () => {
    // queryOne is called twice:
    //   1. SELECT * FROM work_items  →  the work item
    //   2. SELECT MAX(sequence)       →  last event sequence
    mockedQueryOne
      .mockResolvedValueOnce(baseWorkItem)
      .mockResolvedValueOnce({ max_seq: 0 } as unknown as Record<string, unknown>);

    const result = await claimWorkItemHandler("ws-1", "wi-1", actor, 1);

    // Structure: returns { statements, audit, aggregate, newVersion }
    expect(result).toHaveProperty("statements");
    expect(result).toHaveProperty("audit");
    expect(result).toHaveProperty("aggregate");
    expect(result).toHaveProperty("newVersion");

    // audit.action is "work_item.claim"
    expect(result.audit?.action).toBe("work_item.claim");
    expect(result.audit?.entityType).toBe("work_item");
    expect(result.audit?.entityId).toBe("wi-1");

    // newVersion is expectedVersion + 1
    expect(result.newVersion).toBe(2);

    // statements: UPDATE work item + INSERT workflow event
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0].sql).toMatch(/UPDATE/i);
    expect(result.statements[1].sql).toMatch(/INSERT/i);

    // aggregate reflects the claimed state
    expect(result.aggregate).toMatchObject({
      id: "wi-1",
      status: "active",
      claimed_by: "user-1",
    });
  });
});

describe("cancelWorkItemHandler", () => {
  it("returns CommandHandlerResult with correct structure", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(baseWorkItem)
      .mockResolvedValueOnce({ max_seq: 0 } as unknown as Record<string, unknown>);

    const result = await cancelWorkItemHandler(
      "ws-1",
      "wi-1",
      actor,
      1,
      "Not needed",
    );

    // audit.action is "work_item.cancel"
    expect(result.audit?.action).toBe("work_item.cancel");
    expect(result.audit?.entityType).toBe("work_item");
    expect(result.audit?.entityId).toBe("wi-1");

    // newVersion is expectedVersion + 1
    expect(result.newVersion).toBe(2);

    // statements: UPDATE work item + INSERT workflow event
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0].sql).toMatch(/UPDATE/i);
    expect(result.statements[1].sql).toMatch(/INSERT/i);

    // aggregate reflects the cancelled state
    expect(result.aggregate).toMatchObject({
      id: "wi-1",
      status: "cancelled",
    });
  });
});

describe("approvalDecideHandler", () => {
  it("returns CommandHandlerResult with correct structure", async () => {
    // queryOne is called four times in order:
    //   1. SELECT * FROM work_items            →  approval work item
    //   2. SELECT * FROM workflow_instances →  instance
    //   3. SELECT definition_json ...          →  definition version
    //   4. SELECT MAX(sequence) ...            →  last event sequence
    mockedQueryOne
      .mockResolvedValueOnce(approvalWorkItem)
      .mockResolvedValueOnce(mockInstance)
      .mockResolvedValueOnce({ definition_json: workflowDefinitionJson } as unknown as Record<string, unknown>)
      .mockResolvedValueOnce({ max_seq: 0 } as unknown as Record<string, unknown>);

    const result = await approvalDecideHandler(
      "ws-1",
      "wi-approval-1",
      actor,
      "approved",
      "Looks good",
      1,
    );

    // audit.action is "work_item.approval_decide"
    expect(result.audit?.action).toBe("work_item.approval_decide");
    expect(result.audit?.entityType).toBe("work_item");
    expect(result.audit?.entityId).toBe("wi-approval-1");

    // aggregate includes instanceId and nextStepId
    expect(result.aggregate).toHaveProperty("instanceId");
    expect(result.aggregate).toHaveProperty("nextStepId");
    expect(result.aggregate.instanceId).toBe("wfi-1");
    // outcome "approved" → currentStep.onApprove → "end"
    expect(result.aggregate.nextStepId).toBe("end");

    // newVersion is expectedVersion + 1
    expect(result.newVersion).toBe(2);
  });
});

describe("returnWorkItemHandler", () => {
  it("creates a new work item (INSERT, not just UPDATE)", async () => {
    // queryOne is called four times in order:
    //   1. SELECT * FROM work_items            →  work item
    //   2. SELECT * FROM workflow_instances →  instance
    //   3. SELECT * FROM workflow_definition_versions →  definition version
    //   4. SELECT MAX(sequence) ...            →  last event sequence
    mockedQueryOne
      .mockResolvedValueOnce(baseWorkItem)
      .mockResolvedValueOnce(mockInstance)
      .mockResolvedValueOnce(mockDefVersionRow)
      .mockResolvedValueOnce({ max_seq: 0 } as unknown as Record<string, unknown>);

    const result = await returnWorkItemHandler(
      "ws-1",
      "wi-1",
      actor,
      "Needs revision",
      1,
    );

    // The statements array must contain an INSERT for a new work item
    // (not just an UPDATE of the existing one).
    const insertStatements = result.statements.filter(
      (s) => s.sql.includes("INSERT") && s.sql.includes("work_items"),
    );
    expect(insertStatements.length).toBe(1);

    // There should also be an UPDATE for the existing work item
    const updateStatements = result.statements.filter(
      (s) => s.sql.includes("UPDATE") && s.sql.includes("work_items"),
    );
    expect(updateStatements.length).toBe(1);

    // Total statements: UPDATE existing + INSERT event + INSERT new work item
    expect(result.statements).toHaveLength(3);

    // workItemIds should contain the new work item ID
    expect(result.workItemIds).toHaveLength(1);

    // audit.action is "work_item.return"
    expect(result.audit?.action).toBe("work_item.return");
    expect(result.newVersion).toBe(2);
  });
});
