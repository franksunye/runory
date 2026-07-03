// ── Architecture Tests (v0.5 Slice 0) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.7:
// These tests enforce structural invariants that guard the runtime model.
// Some assertions are forward-looking and will become enforceable
// after later slices are implemented.

import { describe, it, expect } from "vitest";
import {
  isGovernedField,
  getGovernedFields,
  getCommandsForAggregate,
} from "./governed-fields";
import { ERROR_CODES } from "./errors";
import { BusinessError, ConflictError } from "./context";

describe("Architecture: Governed Fields", () => {
  it("quote.status is governed", () => {
    expect(isGovernedField("quote", "status")).toBe(true);
  });

  it("quote.aggregate_version is governed", () => {
    expect(isGovernedField("quote", "aggregate_version")).toBe(true);
  });

  it("quote.subtotal_amount is governed (old field name)", () => {
    expect(isGovernedField("quote", "subtotal_amount")).toBe(true);
  });

  it("quote.grand_total is governed", () => {
    expect(isGovernedField("quote", "grand_total")).toBe(true);
  });

  it("quote.snapshot_hash is governed", () => {
    expect(isGovernedField("quote", "snapshot_hash")).toBe(true);
  });

  it("quote.locked_at is governed", () => {
    expect(isGovernedField("quote", "locked_at")).toBe(true);
  });

  it("quote.root_quote_id is governed", () => {
    expect(isGovernedField("quote", "root_quote_id")).toBe(true);
  });

  it("quote.title is NOT governed (editable)", () => {
    expect(isGovernedField("quote", "title")).toBe(false);
  });

  it("quote.notes is NOT governed (editable)", () => {
    expect(isGovernedField("quote", "notes")).toBe(false);
  });

  it("work_order.status is governed", () => {
    expect(isGovernedField("work_order", "status")).toBe(true);
  });

  it("work_order.source_id is governed", () => {
    expect(isGovernedField("work_order", "source_id")).toBe(true);
  });

  it("work_order.completed_at is governed", () => {
    expect(isGovernedField("work_order", "completed_at")).toBe(true);
  });

  it("work_order.title is NOT governed (editable)", () => {
    expect(isGovernedField("work_order", "title")).toBe(false);
  });

  it("service_visit.status is governed", () => {
    expect(isGovernedField("service_visit", "status")).toBe(true);
  });

  it("service_visit.assignment_id is governed", () => {
    expect(isGovernedField("service_visit", "assignment_id")).toBe(true);
  });

  it("unknown aggregate type has no governed fields", () => {
    expect(isGovernedField("unknown_type", "status")).toBe(false);
  });
});

describe("Architecture: Command Registry", () => {
  it("quote has registered commands", () => {
    const commands = getCommandsForAggregate("quote");
    expect(commands).toContain("quote.submit_for_approval");
    expect(commands).toContain("quote.approve");
    expect(commands).toContain("quote.reject");
    expect(commands).toContain("quote.accept");
    expect(commands).toContain("quote.create_revision");
    expect(commands).toContain("quote.convert_to_work_order");
  });

  it("work_order has registered commands", () => {
    const commands = getCommandsForAggregate("work_order");
    expect(commands).toContain("work_order.complete");
    expect(commands).toContain("work_order.cancel");
    expect(commands).toContain("work_order.reopen");
  });

  it("service_visit has registered commands", () => {
    const commands = getCommandsForAggregate("service_visit");
    expect(commands).toContain("visit.start_travel");
    expect(commands).toContain("visit.complete");
  });
});

describe("Architecture: Error Codes", () => {
  it("has v0.5 business error codes", () => {
    expect(ERROR_CODES.VERSION_CONFLICT).toBe("VERSION_CONFLICT");
    expect(ERROR_CODES.GOVERNED_FIELD_REQUIRES_COMMAND).toBe("GOVERNED_FIELD_REQUIRES_COMMAND");
    expect(ERROR_CODES.IDEMPOTENCY_KEY_REUSED).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(ERROR_CODES.SUBJECT_SNAPSHOT_CHANGED).toBe("SUBJECT_SNAPSHOT_CHANGED");
    expect(ERROR_CODES.IMMUTABLE_REVISION).toBe("IMMUTABLE_REVISION");
    expect(ERROR_CODES.ALREADY_CONVERTED).toBe("ALREADY_CONVERTED");
    expect(ERROR_CODES.SCHEDULE_CONFLICT).toBe("SCHEDULE_CONFLICT");
    expect(ERROR_CODES.PERMISSION_DENIED).toBe("PERMISSION_DENIED");
    expect(ERROR_CODES.SELF_APPROVAL_NOT_ALLOWED).toBe("SELF_APPROVAL_NOT_ALLOWED");
    expect(ERROR_CODES.ASSIGNEE_NOT_ELIGIBLE).toBe("ASSIGNEE_NOT_ELIGIBLE");
    expect(ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE).toBe("WORK_ITEM_NOT_ACTIONABLE");
    expect(ERROR_CODES.REQUIRED_INPUT_MISSING).toBe("REQUIRED_INPUT_MISSING");
    expect(ERROR_CODES.INVALID_TRANSITION).toBe("INVALID_TRANSITION");
  });

  it("BusinessError carries code and httpStatus", () => {
    const err = new BusinessError("VERSION_CONFLICT", "test", 409);
    expect(err.code).toBe("VERSION_CONFLICT");
    expect(err.httpStatus).toBe(409);
    expect(err.message).toBe("test");
    expect(err.name).toBe("BusinessError");
  });

  it("BusinessError defaults to 409", () => {
    const err = new BusinessError("SOME_CODE", "test");
    expect(err.httpStatus).toBe(409);
  });
});

// Forward-looking architecture tests (will pass after later slices)
describe("Architecture: Forward-Looking Invariants (future slices)", () => {
  it.skip("no active pack declares quote_approval module", async () => {
    // Slice 1: verify sales-quote-pack no longer includes quote-approval
  });

  it.skip("no active pack declares /quote-approvals navigation", async () => {
    // Slice 1: verify no navigation item points to /quote-approvals
  });

  it.skip("every workflow instance references an immutable definition version", async () => {
    // Slice 1: verify workflow_instances.definition_version_id is non-null
  });

  it.skip("every approval decision references exactly one work_item", async () => {
    // Slice 1: verify approval_decisions.work_item_id is unique
  });

  it.skip("all planning views use the same schedule query contract", async () => {
    // Slice 4: verify calendar/timeline/map share the same data source
  });
});
