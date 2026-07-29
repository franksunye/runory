/**
 * v0.9.2 PWA Notification — push-hooks unit tests (Slice D).
 *
 * Tests triggerPushForCommand for:
 *   - System user P0 events (Slice B): assignment, schedule, work_returned, approval
 *   - External customer P0 events (Slice C): quote, invoice, visit
 *   - Privacy compliance: no sensitive data in titles/bodies
 *   - Error resilience: dispatch failures don't propagate
 *   - Edge cases: unknown commands, missing aggregateId, missing recipients
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock db module ──
vi.mock("../db", () => ({
  queryOne: vi.fn(),
  queryAll: vi.fn(),
  execute: vi.fn(),
  genId: vi.fn((prefix: string) => `${prefix}_mock`),
  now: vi.fn(() => "2026-07-29T00:00:00.000Z"),
  // contracts.businessTable() calls validateIdentifier at runtime
  validateIdentifier: vi.fn((s: string) => s),
}));

// ── Mock push-dispatch ──
//
// dispatchPushNotification is the terminal call in push-hooks.
// We mock it to capture call arguments and control return values.
vi.mock("../push-dispatch", () => ({
  dispatchPushNotification: vi.fn(),
}));

// ── Mock push-preferences (used transitively by push-dispatch) ──
vi.mock("../push-preferences", () => ({
  getPushPreferences: vi.fn(),
  updatePushPreferences: vi.fn(),
  isCategoryEnabled: vi.fn(() => true),
}));

// ── Mock push-subscriptions (used transitively by push-dispatch) ──
vi.mock("../push-subscriptions", () => ({
  getActiveSubscriptionsForPrincipal: vi.fn(() => []),
  hashEndpoint: vi.fn(() => "mock_hash"),
  toSafeSubscription: vi.fn(),
}));

// ── Mock outbox (used transitively by push-dispatch) ──
vi.mock("../outbox", () => ({
  enqueueOutboxMessage: vi.fn(),
}));

import { queryOne, queryAll } from "../db";
import { dispatchPushNotification } from "../push-dispatch";
import { triggerPushForCommand } from "../push-hooks";

const mockedQueryOne = vi.mocked(queryOne);
const mockedQueryAll = vi.mocked(queryAll);
const mockedDispatch = vi.mocked(dispatchPushNotification);

// ── Fixtures ──

const WS_ID = "ws-test-1";

const assignmentRow = {
  resource_id: "res-1",
  subject_type: "service_visit",
  subject_id: "sv-1",
};

const workItemRow = {
  resource_id: "res-2",
  subject_type: "work_order",
  subject_id: "wo-1",
};

const scheduleRow = {
  resource_id: "res-3",
  subject_type: "service_visit",
  subject_id: "sv-2",
};

const membershipRow = { membership_id: "mem-1" };

const grantRow = { id: "cag-1" };

beforeEach(() => {
  // Reset only the mocks we control — avoids side-effects on vi.mock factory defaults
  mockedQueryOne.mockReset();
  mockedQueryAll.mockReset();
  mockedDispatch.mockReset();
  // Set safe defaults so code paths that call .map() on queryAll results don't throw
  mockedQueryOne.mockResolvedValue(null);
  mockedQueryAll.mockResolvedValue([]);
  mockedDispatch.mockResolvedValue({ dispatched: 1, skipped: 0, notificationId: "ntf_mock" });
});

// ──────────────────────────────────────────────────────────────
//  Slice B — System user P0 events
// ──────────────────────────────────────────────────────────────

describe("triggerPushForCommand — assignment.assign", () => {
  it("dispatches push to the assigned resource's membership", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(assignmentRow)   // assignment lookup
      .mockResolvedValueOnce(membershipRow);  // membership lookup

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.assign",
      aggregateId: "asg-1",
    });

    expect(result.dispatched).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockedDispatch).toHaveBeenCalledTimes(1);

    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("work_assignment");
    expect(call.principalType).toBe("workspace_membership");
    expect(call.principalId).toBe("mem-1");
    expect(call.sourceType).toBe("assignment");
    expect(call.sourceId).toBe("asg-1");
    expect(call.route).toBe(`/m/w/${WS_ID}/visits/sv-1`);
  });

  it("skips when aggregateId is missing", async () => {
    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.assign",
    });

    expect(result.dispatched).toBe(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  it("skips when assignment not found", async () => {
    mockedQueryOne.mockResolvedValueOnce(null);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.assign",
      aggregateId: "asg-missing",
    });

    expect(result.dispatched).toBe(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  it("skips when membership cannot be resolved", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(assignmentRow)
      .mockResolvedValueOnce(null);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.assign",
      aggregateId: "asg-1",
    });

    expect(result.dispatched).toBe(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });
});

describe("triggerPushForCommand — assignment.reassign", () => {
  it("dispatches push for the new assignment", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(assignmentRow)
      .mockResolvedValueOnce(membershipRow);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.reassign",
      aggregateId: "asg-old",
      result: { newAssignmentId: "asg-new" },
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.principalId).toBe("mem-1");
    expect(call.sourceId).toBe("asg-new");
    expect(call.tag).toBe("assignment:asg-new");
  });

  it("skips when newAssignmentId is missing from result", async () => {
    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.reassign",
      aggregateId: "asg-old",
      result: {},
    });

    expect(result.dispatched).toBe(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });
});

describe("triggerPushForCommand — schedule.reschedule", () => {
  it("dispatches push with schedule_change category", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(scheduleRow)
      .mockResolvedValueOnce(membershipRow);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "schedule.reschedule",
      aggregateId: "sch-1",
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("schedule_change");
    expect(call.sourceType).toBe("schedule_entry");
    expect(call.route).toBe(`/m/w/${WS_ID}/visits/sv-2`);
  });
});

describe("triggerPushForCommand — schedule.cancel", () => {
  it("dispatches push with schedule_change category", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(scheduleRow)
      .mockResolvedValueOnce(membershipRow);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "schedule.cancel",
      aggregateId: "sch-1",
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("schedule_change");
    // Cancel always uses scheduleRoute, not visitRoute
    expect(call.route).toBe(`/m/w/${WS_ID}/schedule`);
  });
});

describe("triggerPushForCommand — work_item.return", () => {
  it("dispatches push with work_returned category", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(workItemRow)
      .mockResolvedValueOnce(membershipRow);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "work_item.return",
      aggregateId: "wi-1",
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("work_returned");
    expect(call.sourceType).toBe("work_item");
    expect(call.route).toBe(`/m/w/${WS_ID}/work/wi-1`);
  });

  it("skips when work item has no resource_id", async () => {
    mockedQueryOne.mockResolvedValueOnce({
      resource_id: null,
      subject_type: "work_order",
      subject_id: "wo-1",
    });

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "work_item.return",
      aggregateId: "wi-1",
    });

    expect(result.dispatched).toBe(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });
});

describe("triggerPushForCommand — approval.decide", () => {
  it("dispatches work_returned push when outcome is 'returned'", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(workItemRow)
      .mockResolvedValueOnce(membershipRow);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "approval.decide",
      aggregateId: "wi-1",
      input: { outcome: "returned" },
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("work_returned");
    expect(call.sourceType).toBe("approval");
  });

  it("skips when outcome is not 'returned'", async () => {
    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "approval.decide",
      aggregateId: "wi-1",
      input: { outcome: "approved" },
    });

    expect(result.dispatched).toBe(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  it("skips when outcome is missing", async () => {
    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "approval.decide",
      aggregateId: "wi-1",
      input: {},
    });

    expect(result.dispatched).toBe(0);
  });
});

describe("triggerPushForCommand — work_item.claim", () => {
  it("dispatches push with approval_ready category", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(workItemRow)
      .mockResolvedValueOnce(membershipRow);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "work_item.claim",
      aggregateId: "wi-1",
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("approval_ready");
    expect(call.sourceType).toBe("work_item");
  });
});

// ──────────────────────────────────────────────────────────────
//  Slice C — External customer P0 events
// ──────────────────────────────────────────────────────────────

describe("triggerPushForCommand — quote.mark_sent", () => {
  it("dispatches push to grants on the quote", async () => {
    // queryAll: resolveActiveGrantsForRoot (quote)
    mockedQueryAll.mockResolvedValueOnce([grantRow]);
    // queryOne: resolveWorkOrderFromQuote → null (no linked work order)
    mockedQueryOne.mockResolvedValueOnce(null);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "quote.mark_sent",
      aggregateId: "qt-1",
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("customer_document");
    expect(call.principalType).toBe("customer_access_grant");
    expect(call.principalId).toBe("cag-1");
    expect(call.route).toBe("/access");
  });

  it("also dispatches to grants on linked work order", async () => {
    // First resolveActiveGrantsForRoot for quote → 1 grant
    mockedQueryAll.mockResolvedValueOnce([grantRow]);
    // resolveWorkOrderFromQuote → linked work order exists
    mockedQueryOne.mockResolvedValueOnce({ work_order_id: "wo-1" });
    // Second resolveActiveGrantsForRoot for work_order → 1 grant
    mockedQueryAll.mockResolvedValueOnce([grantRow]);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "quote.mark_sent",
      aggregateId: "qt-1",
    });

    // 1 from quote grants + 1 from work_order grants
    expect(result.dispatched).toBe(2);
    expect(mockedDispatch).toHaveBeenCalledTimes(2);
  });

  it("skips when no active grants exist", async () => {
    mockedQueryAll.mockResolvedValueOnce([]);
    mockedQueryOne.mockResolvedValueOnce(null);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "quote.mark_sent",
      aggregateId: "qt-1",
    });

    expect(result.dispatched).toBe(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });
});

describe("triggerPushForCommand — quote.accept", () => {
  it("dispatches push to grants on the quote", async () => {
    mockedQueryAll.mockResolvedValueOnce([grantRow]);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "quote.accept",
      aggregateId: "qt-1",
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("customer_document");
    expect(call.principalId).toBe("cag-1");
    expect(call.tag).toContain("quote-accept");
  });
});

describe("triggerPushForCommand — invoice.issue_from_work_order", () => {
  it("dispatches push to grants on the work order", async () => {
    mockedQueryAll.mockResolvedValueOnce([grantRow]);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "invoice.issue_from_work_order",
      input: { workOrderId: "wo-1" },
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("payment_status");
    expect(call.principalType).toBe("customer_access_grant");
    expect(call.sourceType).toBe("invoice");
  });

  it("skips when workOrderId is missing from input", async () => {
    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "invoice.issue_from_work_order",
      input: {},
    });

    expect(result.dispatched).toBe(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });
});

describe("triggerPushForCommand — visit.complete", () => {
  it("dispatches push after resolving work order from visit", async () => {
    // queryOne: resolveWorkOrderFromVisit
    mockedQueryOne.mockResolvedValueOnce({ work_order_id: "wo-1" });
    // queryAll: resolveActiveGrantsForRoot for work_order
    mockedQueryAll.mockResolvedValueOnce([grantRow]);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "visit.complete",
      aggregateId: "sv-1",
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("service_status");
    expect(call.sourceType).toBe("visit");
    expect(call.sourceId).toBe("sv-1");
  });

  it("skips when work order cannot be resolved from visit", async () => {
    mockedQueryOne.mockResolvedValueOnce(null);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "visit.complete",
      aggregateId: "sv-1",
    });

    expect(result.dispatched).toBe(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });
});

describe("triggerPushForCommand — visit.cancel", () => {
  it("dispatches push with service_status category", async () => {
    mockedQueryOne.mockResolvedValueOnce({ work_order_id: "wo-1" });
    mockedQueryAll.mockResolvedValueOnce([grantRow]);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "visit.cancel",
      aggregateId: "sv-1",
    });

    expect(result.dispatched).toBe(1);
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.category).toBe("service_status");
    expect(call.tag).toContain("visit-cancel");
  });
});

// ──────────────────────────────────────────────────────────────
//  Privacy compliance (Spec §8)
// ──────────────────────────────────────────────────────────────

describe("Privacy compliance — notification content", () => {
  const SENSITIVE_PATTERNS = [
    /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/,  // credit card numbers
    /\$\d+/,                                 // dollar amounts
    /¥\d+/,                                  // yen amounts
    /\bCNY\b.*\d/,                           // CNY followed by number
    /\baddress\b/i,                          // address references
    /\bphone\b/i,                            // phone references
  ];

  it("assignment.assign notification has no sensitive data", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(assignmentRow)
      .mockResolvedValueOnce(membershipRow);

    await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.assign",
      aggregateId: "asg-1",
    });

    expect(mockedDispatch).toHaveBeenCalled();
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.title).toBe("Work assigned");
    expect(call.body).toBe("You have been assigned new work. Open to review.");
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(call.title).not.toMatch(pattern);
      expect(call.body).not.toMatch(pattern);
    }
  });

  it("schedule.reschedule notification has no sensitive data", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(scheduleRow)
      .mockResolvedValueOnce(membershipRow);

    await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "schedule.reschedule",
      aggregateId: "sch-1",
    });

    expect(mockedDispatch).toHaveBeenCalled();
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.title).toBe("Schedule updated");
    expect(call.body).toBe("A visit time has been changed. Open to view.");
  });

  it("quote.mark_sent notification has no sensitive data", async () => {
    mockedQueryAll.mockResolvedValueOnce([grantRow]);
    mockedQueryOne.mockResolvedValueOnce(null);

    await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "quote.mark_sent",
      aggregateId: "qt-1",
    });

    expect(mockedDispatch).toHaveBeenCalled();
    const call = mockedDispatch.mock.calls[0][0];
    // External notifications use generic language
    expect(call.title).toBe("Document ready");
    expect(call.body).toBe("A document is ready for your review. Open to view.");
  });

  it("invoice.issue_from_work_order notification has no sensitive data", async () => {
    mockedQueryAll.mockResolvedValueOnce([grantRow]);

    await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "invoice.issue_from_work_order",
      input: { workOrderId: "wo-1" },
    });

    expect(mockedDispatch).toHaveBeenCalled();
    const call = mockedDispatch.mock.calls[0][0];
    // Must not contain amounts or invoice numbers
    expect(call.title).toBe("Invoice ready");
    expect(call.body).toBe("An invoice is available. Open to view details.");
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(call.title).not.toMatch(pattern);
      expect(call.body).not.toMatch(pattern);
    }
  });

  it("visit.complete notification has no sensitive data", async () => {
    mockedQueryOne.mockResolvedValueOnce({ work_order_id: "wo-1" });
    mockedQueryAll.mockResolvedValueOnce([grantRow]);

    await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "visit.complete",
      aggregateId: "sv-1",
    });

    expect(mockedDispatch).toHaveBeenCalled();
    const call = mockedDispatch.mock.calls[0][0];
    expect(call.title).toBe("Service update");
    expect(call.body).toBe("A service visit has been completed. Open to view.");
  });
});

// ──────────────────────────────────────────────────────────────
//  Error resilience
// ──────────────────────────────────────────────────────────────

describe("Error resilience", () => {
  it("catches database errors and returns them in errors array", async () => {
    mockedQueryOne.mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.assign",
      aggregateId: "asg-1",
    });

    expect(result.dispatched).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe("DB connection lost");
  });

  it("catches dispatch failures and returns them in errors array", async () => {
    mockedQueryOne
      .mockResolvedValueOnce(assignmentRow)
      .mockResolvedValueOnce(membershipRow);
    mockedDispatch.mockRejectedValueOnce(new Error("Push service unavailable"));

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.assign",
      aggregateId: "asg-1",
    });

    expect(result.dispatched).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe("Push service unavailable");
  });

  it("handles non-Error throwables in error path", async () => {
    mockedQueryOne.mockRejectedValueOnce("string error" as never);

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "assignment.assign",
      aggregateId: "asg-1",
    });

    expect(result.dispatched).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe("string error");
  });
});

// ──────────────────────────────────────────────────────────────
//  Edge cases
// ──────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("returns zeros for unknown command type", async () => {
    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "unknown.command",
      aggregateId: "x-1",
    });

    expect(result.dispatched).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  it("returns zeros for empty command type", async () => {
    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "",
    });

    expect(result.dispatched).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("dispatches to multiple grants for a single event", async () => {
    // Three active grants on the quote
    mockedQueryAll.mockResolvedValueOnce([
      { id: "cag-1" },
      { id: "cag-2" },
      { id: "cag-3" },
    ]);
    mockedQueryOne.mockResolvedValueOnce(null); // no linked work order

    const result = await triggerPushForCommand({
      workspaceId: WS_ID,
      commandType: "quote.mark_sent",
      aggregateId: "qt-1",
    });

    expect(result.dispatched).toBe(3);
    expect(mockedDispatch).toHaveBeenCalledTimes(3);

    // Each dispatch should have a unique tag (includes grantId)
    const tags = mockedDispatch.mock.calls.map((c) => c[0].tag);
    expect(new Set(tags).size).toBe(3);
  });
});
