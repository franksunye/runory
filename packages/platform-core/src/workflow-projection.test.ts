import { describe, expect, it } from "vitest";
import {
  resolveWorkflowOverview,
  resolveWorkflowRunProjection,
} from "./workflow-projection";
import type {
  WorkflowDefinition,
  WorkflowInstanceRow,
  WorkItemRow,
  WorkflowEventRow,
} from "./workflow";
import type { WorkflowOverview, WorkflowRunProjection } from "@runory/contracts";

// ── Test Fixtures ──

const linearDefinition: WorkflowDefinition = {
  workflowKey: "linear-flow",
  name: "Linear Flow",
  targetObject: "quote",
  initialState: "draft",
  steps: [
    { id: "start", kind: "start", next: "review" },
    { id: "review", kind: "human_task", next: "end" },
    { id: "end", kind: "end" },
  ],
};

const approvalDefinition: WorkflowDefinition = {
  workflowKey: "approval-flow",
  name: "Approval Flow",
  targetObject: "quote",
  initialState: "draft",
  steps: [
    { id: "start", kind: "start", next: "manager_approval" },
    {
      id: "manager_approval",
      kind: "approval",
      onApprove: "end",
      onReject: "revise",
      assigneeRule: { permissionGroup: "managers" },
    },
    { id: "revise", kind: "human_task", next: "manager_approval" },
    { id: "end", kind: "end" },
  ],
};

const multiStepDefinition: WorkflowDefinition = {
  workflowKey: "multi-step-flow",
  name: "Multi-Step Flow",
  targetObject: "work_order",
  initialState: "pending",
  steps: [
    { id: "start", kind: "start", next: "intake" },
    { id: "intake", kind: "human_task", next: "qa_approval" },
    {
      id: "qa_approval",
      kind: "approval",
      onApprove: "dispatch",
      onReject: "intake",
    },
    { id: "dispatch", kind: "system_command", next: "complete" },
    { id: "complete", kind: "human_task", next: "end" },
    { id: "end", kind: "end" },
  ],
};

function makeInstance(overrides: Partial<WorkflowInstanceRow> = {}): WorkflowInstanceRow {
  return {
    id: "wfi_test",
    workspace_id: "ws_test",
    workflow_definition_id: "wfd_test",
    definition_version_id: "wfv_test",
    object_type: "quote",
    record_id: "rec_test",
    status: "running",
    current_step_id: "review",
    version: 1,
    next_event_sequence: 1,
    started_by: "user_1",
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeWorkItem(overrides: Partial<WorkItemRow> = {}): WorkItemRow {
  return {
    id: "wi_test",
    workspace_id: "ws_test",
    instance_id: "wfi_test",
    step_id: "review",
    kind: "human_task",
    status: "ready",
    subject_type: "quote",
    subject_id: "rec_test",
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
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<WorkflowEventRow> = {}): WorkflowEventRow {
  return {
    id: "wfe_test",
    instance_id: "wfi_test",
    sequence: 1,
    event_type: "workflow.started",
    step_id: "start",
    actor_type: "user",
    actor_id: "user_1",
    payload_json: "{}",
    occurred_at: "2026-01-01T00:00:00.000Z",
    dedupe_key: null,
    ...overrides,
  };
}

// ── §14.4: Overview Projection Tests ──

describe("§14.4 Workflow Projection — Overview", () => {
  it("projects a linear definition with correct step sequence", () => {
    const overview = resolveWorkflowOverview(linearDefinition, 1);

    expect(overview.workflowKey).toBe("linear-flow");
    expect(overview.name).toBe("Linear Flow");
    expect(overview.targetObject).toBe("quote");
    expect(overview.versionNumber).toBe(1);
    expect(overview.steps).toHaveLength(3);

    // Start step
    expect(overview.steps[0]).toEqual({
      id: "start",
      kind: "start",
      label: "Start",
      next: ["review"],
    });

    // Human task step
    expect(overview.steps[1]).toEqual({
      id: "review",
      kind: "human_task",
      label: "Review",
      next: ["end"],
    });

    // End step
    expect(overview.steps[2]).toEqual({
      id: "end",
      kind: "end",
      label: "End",
      next: [],
    });
  });

  it("projects approval branches into the next array", () => {
    const overview = resolveWorkflowOverview(approvalDefinition, 2);

    // The approval step should have both onApprove and onReject in next
    const approvalStep = overview.steps.find((s) => s.id === "manager_approval");
    expect(approvalStep).toBeDefined();
    expect(approvalStep!.next).toEqual(["end", "revise"]);

    // The revise step should point back to the approval step
    const reviseStep = overview.steps.find((s) => s.id === "revise");
    expect(reviseStep).toBeDefined();
    expect(reviseStep!.next).toEqual(["manager_approval"]);
  });

  it("derives human-readable labels from step ids", () => {
    const overview = resolveWorkflowOverview(multiStepDefinition, 1);

    expect(overview.steps[1].label).toBe("Intake");
    expect(overview.steps[2].label).toBe("Qa Approval");
    expect(overview.steps[3].label).toBe("Dispatch");
  });

  it("deduplicates next targets when next and onApprove/onReject overlap", () => {
    const def: WorkflowDefinition = {
      workflowKey: "dedup",
      name: "Dedup",
      targetObject: "quote",
      initialState: "draft",
      steps: [
        { id: "start", kind: "start", next: "approve" },
        {
          id: "approve",
          kind: "approval",
          next: "end",
          onApprove: "end",
          onReject: "revise",
        },
        { id: "revise", kind: "human_task", next: "approve" },
        { id: "end", kind: "end" },
      ],
    };

    const overview = resolveWorkflowOverview(def, 1);
    const approveStep = overview.steps.find((s) => s.id === "approve");
    // "end" should appear only once even though both next and onApprove point to it
    expect(approveStep!.next).toEqual(["end", "revise"]);
  });

  it("preserves the versionNumber from the pinned definition version", () => {
    const overview = resolveWorkflowOverview(linearDefinition, 5);
    expect(overview.versionNumber).toBe(5);
  });
});

// ── §14.4: Run Projection — Linear Flow ──

describe("§14.4 Workflow Projection — Linear Run", () => {
  it("projects a running instance with current step and pending steps", () => {
    const instance = makeInstance({ current_step_id: "review" });
    const events = [makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" })];
    const workItems = [
      makeWorkItem({ id: "wi_1", step_id: "review", status: "ready" }),
    ];

    const projection = resolveWorkflowRunProjection(linearDefinition, instance, workItems, events);

    expect(projection.instanceId).toBe("wfi_test");
    expect(projection.status).toBe("running");
    expect(projection.currentStepId).toBe("review");
    expect(projection.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(projection.completedAt).toBeNull();

    // Start should be completed (it's before the current step)
    expect(projection.steps[0]).toEqual({
      id: "start",
      state: "completed",
    });

    // Review should be current
    expect(projection.steps[1].state).toBe("current");
    expect(projection.steps[1].workItemStatus).toBe("ready");

    // End should be pending
    expect(projection.steps[2].state).toBe("pending");

    // Next action should point to the human task work item
    expect(projection.nextAction).toEqual({
      kind: "human_task",
      workItemId: "wi_1",
    });
  });

  it("projects a completed instance", () => {
    const instance = makeInstance({
      status: "completed",
      current_step_id: "end",
      completed_at: "2026-01-02T00:00:00.000Z",
    });
    const events = [
      makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" }),
      makeEvent({
        id: "wfe_2",
        sequence: 2,
        event_type: "workflow.work_completed",
        step_id: "review",
        occurred_at: "2026-01-01T12:00:00.000Z",
      }),
    ];
    const workItems = [
      makeWorkItem({
        id: "wi_1",
        step_id: "review",
        status: "completed",
        completed_at: "2026-01-01T12:00:00.000Z",
      }),
    ];

    const projection = resolveWorkflowRunProjection(linearDefinition, instance, workItems, events);

    expect(projection.status).toBe("completed");
    expect(projection.completedAt).toBe("2026-01-02T00:00:00.000Z");

    // All steps should be completed
    expect(projection.steps.every((s) => s.state === "completed")).toBe(true);

    // No next action for completed instance
    expect(projection.nextAction).toBeUndefined();
  });
});

// ── §14.4: Run Projection — Approval Approve/Reject ──

describe("§14.4 Workflow Projection — Approval Outcomes", () => {
  it("projects an approved approval step with outcome", () => {
    const instance = makeInstance({
      current_step_id: "end",
      status: "completed",
      completed_at: "2026-01-02T00:00:00.000Z",
    });
    const events = [
      makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" }),
      makeEvent({
        id: "wfe_2",
        sequence: 2,
        event_type: "workflow.approval_decided",
        step_id: "manager_approval",
        payload_json: JSON.stringify({ outcome: "approved", comment: "Looks good" }),
        occurred_at: "2026-01-01T12:00:00.000Z",
      }),
    ];
    const workItems = [
      makeWorkItem({
        id: "wi_1",
        step_id: "manager_approval",
        status: "completed",
        kind: "approval",
        completed_at: "2026-01-01T12:00:00.000Z",
      }),
    ];

    const projection = resolveWorkflowRunProjection(approvalDefinition, instance, workItems, events);

    const approvalStep = projection.steps.find((s) => s.id === "manager_approval");
    expect(approvalStep).toBeDefined();
    expect(approvalStep!.state).toBe("completed");
    expect(approvalStep!.outcome).toBe("approved");
    expect(approvalStep!.occurredAt).toBe("2026-01-01T12:00:00.000Z");
    expect(approvalStep!.workItemStatus).toBe("completed");
  });

  it("projects a rejected approval step with outcome", () => {
    const instance = makeInstance({
      current_step_id: "revise",
    });
    const events = [
      makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" }),
      makeEvent({
        id: "wfe_2",
        sequence: 2,
        event_type: "workflow.approval_decided",
        step_id: "manager_approval",
        payload_json: JSON.stringify({ outcome: "rejected", comment: "Needs work" }),
        occurred_at: "2026-01-01T12:00:00.000Z",
      }),
    ];
    const workItems = [
      makeWorkItem({
        id: "wi_1",
        step_id: "manager_approval",
        status: "completed",
        kind: "approval",
        completed_at: "2026-01-01T12:00:00.000Z",
      }),
      makeWorkItem({
        id: "wi_2",
        step_id: "revise",
        status: "ready",
        kind: "human_task",
        created_at: "2026-01-01T12:00:01.000Z",
      }),
    ];

    const projection = resolveWorkflowRunProjection(approvalDefinition, instance, workItems, events);

    const approvalStep = projection.steps.find((s) => s.id === "manager_approval");
    expect(approvalStep!.state).toBe("completed");
    expect(approvalStep!.outcome).toBe("rejected");

    // Revise step should be current
    const reviseStep = projection.steps.find((s) => s.id === "revise");
    expect(reviseStep!.state).toBe("current");
    expect(reviseStep!.workItemStatus).toBe("ready");

    // Next action should point to the human task
    expect(projection.nextAction).toEqual({
      kind: "human_task",
      workItemId: "wi_2",
    });
  });
});

// ── §14.4: Run Projection — Active Work Item ──

describe("§14.4 Workflow Projection — Active Work Item", () => {
  it("projects a claimed work item as current with active status", () => {
    const instance = makeInstance({ current_step_id: "review" });
    const events = [makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" })];
    const workItems = [
      makeWorkItem({
        id: "wi_1",
        step_id: "review",
        status: "active",
        claimed_by: "user_2",
        claimed_at: "2026-01-01T01:00:00.000Z",
      }),
    ];

    const projection = resolveWorkflowRunProjection(linearDefinition, instance, workItems, events);

    expect(projection.steps[1].state).toBe("current");
    expect(projection.steps[1].workItemStatus).toBe("active");
    expect(projection.nextAction).toEqual({
      kind: "human_task",
      workItemId: "wi_1",
    });
  });

  it("projects nextAction with undefined workItemId when no work item exists", () => {
    const def: WorkflowDefinition = {
      workflowKey: "sys-cmd",
      name: "System Command Flow",
      targetObject: "quote",
      initialState: "draft",
      steps: [
        { id: "start", kind: "start", next: "execute" },
        { id: "execute", kind: "system_command", command: "auto.process", next: "end" },
        { id: "end", kind: "end" },
      ],
    };

    const instance = makeInstance({ current_step_id: "execute" });
    const events = [makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" })];

    const projection = resolveWorkflowRunProjection(def, instance, [], events);

    expect(projection.nextAction).toEqual({ kind: "system_command" });
  });
});

// ── §14.4: Run Projection — Returned ──

describe("§14.4 Workflow Projection — Returned Run", () => {
  it("projects a returned work item as 'returned' status", () => {
    const instance = makeInstance({ current_step_id: "intake" });
    const events = [
      makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" }),
      makeEvent({
        id: "wfe_2",
        sequence: 2,
        event_type: "workflow.work_completed",
        step_id: "intake",
        occurred_at: "2026-01-01T10:00:00.000Z",
      }),
      makeEvent({
        id: "wfe_3",
        sequence: 3,
        event_type: "workflow.approval_decided",
        step_id: "qa_approval",
        payload_json: JSON.stringify({ outcome: "rejected" }),
        occurred_at: "2026-01-01T11:00:00.000Z",
      }),
      makeEvent({
        id: "wfe_4",
        sequence: 4,
        event_type: "workflow.work_returned",
        step_id: "intake",
        payload_json: JSON.stringify({ comment: "Redo intake" }),
        occurred_at: "2026-01-01T12:00:00.000Z",
      }),
    ];
    const workItems = [
      makeWorkItem({
        id: "wi_1",
        step_id: "intake",
        status: "returned",
        kind: "human_task",
        completed_at: "2026-01-01T10:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      makeWorkItem({
        id: "wi_2",
        step_id: "qa_approval",
        status: "completed",
        kind: "approval",
        completed_at: "2026-01-01T11:00:00.000Z",
        created_at: "2026-01-01T10:00:01.000Z",
      }),
      makeWorkItem({
        id: "wi_3",
        step_id: "intake",
        status: "ready",
        kind: "human_task",
        created_at: "2026-01-01T12:00:01.000Z",
      }),
    ];

    const projection = resolveWorkflowRunProjection(multiStepDefinition, instance, workItems, events);

    // Status should be "returned" because the latest event is work_returned
    expect(projection.status).toBe("returned");

    // Current step is intake (re-created work item)
    const intakeStep = projection.steps.find((s) => s.id === "intake");
    expect(intakeStep!.state).toBe("current");
    // Latest work item for intake is the re-created one (wi_3, ready)
    expect(intakeStep!.workItemStatus).toBe("ready");

    // QA approval step should be completed with rejected outcome
    const qaStep = projection.steps.find((s) => s.id === "qa_approval");
    expect(qaStep!.state).toBe("completed");
    expect(qaStep!.outcome).toBe("rejected");

    // Next action should point to the re-created work item
    expect(projection.nextAction).toEqual({
      kind: "human_task",
      workItemId: "wi_3",
    });
  });
});

// ── §14.4: Run Projection — Cancelled ──

describe("§14.4 Workflow Projection — Cancelled Run", () => {
  it("projects a cancelled instance with cancelled steps", () => {
    const instance = makeInstance({
      status: "cancelled",
      current_step_id: "qa_approval",
      completed_at: "2026-01-02T00:00:00.000Z",
    });
    const events = [
      makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" }),
      makeEvent({
        id: "wfe_2",
        sequence: 2,
        event_type: "workflow.work_completed",
        step_id: "intake",
        occurred_at: "2026-01-01T10:00:00.000Z",
      }),
      makeEvent({
        id: "wfe_3",
        sequence: 3,
        event_type: "workflow.cancelled",
        step_id: null,
        payload_json: JSON.stringify({ reason: "Customer cancelled" }),
        occurred_at: "2026-01-02T00:00:00.000Z",
      }),
    ];
    const workItems = [
      makeWorkItem({
        id: "wi_1",
        step_id: "intake",
        status: "completed",
        kind: "human_task",
        completed_at: "2026-01-01T10:00:00.000Z",
      }),
      makeWorkItem({
        id: "wi_2",
        step_id: "qa_approval",
        status: "cancelled",
        kind: "approval",
      }),
    ];

    const projection = resolveWorkflowRunProjection(multiStepDefinition, instance, workItems, events);

    expect(projection.status).toBe("cancelled");
    expect(projection.completedAt).toBe("2026-01-02T00:00:00.000Z");

    // Start and intake should be completed
    expect(projection.steps[0].state).toBe("completed");
    expect(projection.steps[1].state).toBe("completed");

    // QA approval should be cancelled (it was the current step)
    const qaStep = projection.steps.find((s) => s.id === "qa_approval");
    expect(qaStep!.state).toBe("cancelled");

    // Steps after current should also be cancelled
    const dispatchStep = projection.steps.find((s) => s.id === "dispatch");
    expect(dispatchStep!.state).toBe("cancelled");

    // No next action for cancelled instance
    expect(projection.nextAction).toBeUndefined();
  });
});

// ── §14.4: No Fabricated State ──

describe("§14.4 Workflow Projection — No Fabricated State", () => {
  it("does not fabricate failed/retry/attempt/log state", () => {
    const instance = makeInstance({ current_step_id: "review" });
    const events = [makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" })];
    const workItems = [makeWorkItem({ id: "wi_1", step_id: "review", status: "ready" })];

    const projection = resolveWorkflowRunProjection(linearDefinition, instance, workItems, events);

    // Projection status must be one of the four allowed values
    expect(["running", "completed", "returned", "cancelled"]).toContain(projection.status);

    // Each step state must be one of the four allowed values
    for (const step of projection.steps) {
      expect(["pending", "current", "completed", "cancelled"]).toContain(step.state);
    }

    // No step should have a fabricated outcome
    const reviewStep = projection.steps.find((s) => s.id === "review");
    expect(reviewStep!.outcome).toBeUndefined();
    expect(reviewStep!.occurredAt).toBeUndefined();
  });

  it("does not infer failure from a returned work item without a return event", () => {
    // Work item has status "returned" but there's no workflow.work_returned event.
    // Per Tech Spec §11.1: do not infer failure/retry from returned Work Items.
    const instance = makeInstance({ current_step_id: "review" });
    const events = [makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" })];
    const workItems = [
      makeWorkItem({ id: "wi_1", step_id: "review", status: "returned" }),
    ];

    const projection = resolveWorkflowRunProjection(linearDefinition, instance, workItems, events);

    // Status should still be "running" because there's no work_returned event
    expect(projection.status).toBe("running");
  });

  it("does not expose raw event payloads beyond the projection contract", () => {
    const instance = makeInstance({
      status: "completed",
      current_step_id: "end",
      completed_at: "2026-01-02T00:00:00.000Z",
    });
    const events = [
      makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" }),
      makeEvent({
        id: "wfe_2",
        sequence: 2,
        event_type: "workflow.approval_decided",
        step_id: "review",
        payload_json: JSON.stringify({
          outcome: "approved",
          comment: "Secret internal comment with sensitive data",
          internal_metadata: { retry_count: 3, failure_reason: "db_error" },
        }),
        occurred_at: "2026-01-01T12:00:00.000Z",
      }),
    ];

    const projection = resolveWorkflowRunProjection(linearDefinition, instance, [], events);

    // The projection should only expose the outcome, not the raw payload
    const reviewStep = projection.steps.find((s) => s.id === "review");
    expect(reviewStep!.outcome).toBe("approved");
    expect(reviewStep!.occurredAt).toBe("2026-01-01T12:00:00.000Z");

    // The projection object should not contain raw payload fields
    const projectionJson = JSON.stringify(projection);
    expect(projectionJson).not.toContain("Secret internal comment");
    expect(projectionJson).not.toContain("internal_metadata");
    expect(projectionJson).not.toContain("retry_count");
    expect(projectionJson).not.toContain("failure_reason");
  });
});

// ── §14.4: Pinned Definition Version ──

describe("§14.4 Workflow Projection — Pinned Definition Version", () => {
  it("uses the provided definition, not a re-fetched latest version", () => {
    // Simulate: instance was pinned to version 1, but version 2 has different steps.
    // The projection must use the pinned definition passed to it.
    const v1Definition: WorkflowDefinition = {
      workflowKey: "versioned-flow",
      name: "Versioned Flow v1",
      targetObject: "quote",
      initialState: "draft",
      steps: [
        { id: "start", kind: "start", next: "review" },
        { id: "review", kind: "human_task", next: "end" },
        { id: "end", kind: "end" },
      ],
    };

    const instance = makeInstance({
      current_step_id: "review",
      definition_version_id: "wfv_v1",
    });
    const events = [makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" })];
    const workItems = [makeWorkItem({ id: "wi_1", step_id: "review", status: "ready" })];

    const projection = resolveWorkflowRunProjection(v1Definition, instance, workItems, events);

    // Should have 3 steps from v1, not whatever v2 might have
    expect(projection.steps).toHaveLength(3);
    expect(projection.steps.map((s) => s.id)).toEqual(["start", "review", "end"]);
  });

  it("overview reflects the versionNumber of the pinned definition", () => {
    const overview = resolveWorkflowOverview(linearDefinition, 3);
    expect(overview.versionNumber).toBe(3);
  });
});

// ── §14.4: No Writes / Pure Function ──

describe("§14.4 Workflow Projection — Pure Function (No Writes)", () => {
  it("resolveWorkflowOverview returns a new object without mutating the definition", () => {
    const defCopy = JSON.parse(JSON.stringify(linearDefinition)) as WorkflowDefinition;
    const overview = resolveWorkflowOverview(linearDefinition, 1);

    // The original definition should be unchanged
    expect(linearDefinition).toEqual(defCopy);

    // The overview should be a new object
    expect(overview).not.toBe(linearDefinition);
    expect(overview.steps).not.toBe(linearDefinition.steps);
  });

  it("resolveWorkflowRunProjection returns a new object without mutating inputs", () => {
    const defCopy = JSON.parse(JSON.stringify(linearDefinition)) as WorkflowDefinition;
    const instance = makeInstance({ current_step_id: "review" });
    const events = [makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" })];
    const workItems = [makeWorkItem({ id: "wi_1", step_id: "review", status: "ready" })];

    const instanceCopy = JSON.parse(JSON.stringify(instance)) as WorkflowInstanceRow;
    const workItemsCopy = JSON.parse(JSON.stringify(workItems)) as WorkItemRow[];
    const eventsCopy = JSON.parse(JSON.stringify(events)) as WorkflowEventRow[];

    resolveWorkflowRunProjection(linearDefinition, instance, workItems, events);

    // Inputs should be unchanged
    expect(linearDefinition).toEqual(defCopy);
    expect(instance).toEqual(instanceCopy);
    expect(workItems).toEqual(workItemsCopy);
    expect(events).toEqual(eventsCopy);
  });

  it("projection does not expose unauthorized payload fields", () => {
    const instance = makeInstance({ current_step_id: "review" });
    const events = [
      makeEvent({
        sequence: 1,
        event_type: "workflow.started",
        step_id: "start",
        payload_json: JSON.stringify({
          workflowKey: "linear-flow",
          objectType: "quote",
          recordId: "rec_test",
          // Sensitive fields that should NOT appear in the projection
          internalUserId: "user_123",
          sessionToken: "abc-secret-token",
        }),
      }),
    ];
    const workItems = [makeWorkItem({ id: "wi_1", step_id: "review", status: "ready" })];

    const projection = resolveWorkflowRunProjection(linearDefinition, instance, workItems, events);

    const projectionJson = JSON.stringify(projection);
    expect(projectionJson).not.toContain("internalUserId");
    expect(projectionJson).not.toContain("sessionToken");
    expect(projectionJson).not.toContain("abc-secret-token");
  });
});

// ── §14.4: Deterministic Projection ──

describe("§14.4 Workflow Projection — Deterministic", () => {
  it("produces identical output for identical inputs", () => {
    const instance = makeInstance({ current_step_id: "review" });
    const events = [makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" })];
    const workItems = [makeWorkItem({ id: "wi_1", step_id: "review", status: "ready" })];

    const projection1 = resolveWorkflowRunProjection(linearDefinition, instance, workItems, events);
    const projection2 = resolveWorkflowRunProjection(linearDefinition, instance, workItems, events);

    expect(projection1).toEqual(projection2);
  });

  it("produces identical overview for identical definitions", () => {
    const overview1 = resolveWorkflowOverview(approvalDefinition, 1);
    const overview2 = resolveWorkflowOverview(approvalDefinition, 1);

    expect(overview1).toEqual(overview2);
  });

  it("produces different projections for different instance states", () => {
    const events = [makeEvent({ sequence: 1, event_type: "workflow.started", step_id: "start" })];

    const runningInstance = makeInstance({ current_step_id: "review", status: "running" });
    const cancelledInstance = makeInstance({ current_step_id: "review", status: "cancelled", completed_at: "2026-01-02T00:00:00.000Z" });

    const workItems = [makeWorkItem({ id: "wi_1", step_id: "review", status: "ready" })];
    const cancelledWorkItems = [makeWorkItem({ id: "wi_1", step_id: "review", status: "cancelled" })];

    const runningProjection = resolveWorkflowRunProjection(linearDefinition, runningInstance, workItems, events);
    const cancelledProjection = resolveWorkflowRunProjection(linearDefinition, cancelledInstance, cancelledWorkItems, events);

    expect(runningProjection.status).toBe("running");
    expect(cancelledProjection.status).toBe("cancelled");
    expect(runningProjection).not.toEqual(cancelledProjection);
  });
});
