// ── v0.5 Commercial FSM Journey & Contract/Concurrency Tests ──
//
// End-to-end test suite covering:
// 1. The full v0.5 Commercial FSM journey (quote → approval → work order → visit → completion)
// 2. Contract and concurrency guarantees (self-approval, permissions, version conflicts, idempotency)
//
// Testing patterns:
// - resetDatabase() from fsm-pack.test.ts (NOT createWorkspace/deleteWorkspace)
// - installPack from ./installer
// - Assignment/schedule/forms functions take `string` (userId), not CommandActor
// - returnForChanges 5th param: comment: string | null
// - completeWorkOrder 5th param: completionReason?: string
// - getMyWork takes actorId: string, returns { items, total }
// - Permission groups created manually via syncPackPermissionGroups
// - ConflictError has no .code → use rejects.toThrow(/pattern/)
// - BusinessError has .code → use rejects.toMatchObject({ code })
// - createRecord does NOT enforce governed field checks (only updateRecord does)
// - Work order planned -> in_progress transition has no FSM command → use direct SQL
// - Form must be accepted before completeVisit (which checks for pending submissions)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryOne, queryAll } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installPack } from "./installer";
import {
  createRecord,
  getRecords,
  updateRecord,
  _clearSoftDeleteColumnCache,
} from "./metadata";
import {
  submitForApproval,
  approveQuote,
  rejectQuote,
  returnForChanges,
  markSent,
  acceptQuote,
  recalculateQuoteCommand,
  convertToWorkOrder,
} from "./quote-commands";
import {
  triageWorkOrder,
  createVisit,
  completeWorkOrder,
  startTravel,
  arriveOnSite,
  submitWork,
  completeVisit,
} from "./fsm-commands";
import {
  proposeAssignment,
  assignAssignment,
  acceptAssignment,
  getCurrentAssignment,
} from "./assignment";
import {
  planSchedule,
  confirmSchedule,
  detectConflicts,
  getScheduleEntries,
} from "./schedule";
import {
  submitForm,
  acceptFormSubmission,
  publishFormDefinition,
  createFormBinding,
} from "./forms-v2";
import {
  getWorkflowHistory,
  publishWorkflowDefinition,
  startWorkflowV2,
  approvalDecide,
} from "./workflow-v2";
import { getCommandHistory, type CommandActor } from "./command-runtime";
import { requireBusinessPermission } from "./authorization";
import { createRequestContext } from "./context";
import {
  syncPackPermissionGroups,
  getPackPermissionGroups,
  assignPackPermissionGroup,
} from "./permission-groups";

// Ensure the data directory exists for SQLite
const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Database helpers (from fsm-pack.test.ts pattern) ──

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

async function createTestWorkspace(name = "v0.5 Test WS"): Promise<string> {
  const ts = now();
  const wsId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [wsId, name, `ws-${wsId}`, ts, ts],
  );
  return wsId;
}

async function setupPermissionGroups(wsId: string): Promise<void> {
  await syncPackPermissionGroups(wsId, "sales-quote-pack", [
    {
      key: "sales_manager",
      label: "Sales Manager",
      description: "Sales managers who can approve quotes",
      permissions: [
        "quote.read",
        "quote.approve",
        "quote.reject",
        "quote.return_for_changes",
      ],
    },
  ]);

  const groups = await getPackPermissionGroups(wsId, "sales-quote-pack");
  const managerGroup = groups.find((g) => g.groupKey === "sales_manager");
  if (managerGroup) {
    await assignPackPermissionGroup(
      wsId,
      managerGroup.id,
      "user_sales_manager",
      "system",
    );
  }
}

// ════════════════════════════════════════════════════════════════════
// v0.5 Commercial FSM Journey
// ════════════════════════════════════════════════════════════════════

describe("v0.5 Commercial FSM Journey", () => {
  let workspaceId: string;

  const salesRep: CommandActor = { type: "user", id: "user_sales_rep" };
  const salesManager: CommandActor = { type: "user", id: "user_sales_manager" };
  const dispatcher: CommandActor = { type: "user", id: "user_dispatcher" };
  const technician: CommandActor = { type: "user", id: "user_technician" };
  const supervisor: CommandActor = { type: "user", id: "user_supervisor" };

  let companyId: string;
  let contactId: string;
  let quoteId: string;
  let workOrderId: string;
  let visitId: string;
  let assignmentId: string;
  let scheduleEntryId: string;
  let formSubmissionId: string;
  let workflowInstanceId: string;

  let quoteVersion = 1;
  let woVersion = 1;

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "fsm-pack");
    await setupPermissionGroups(workspaceId);
  });

  afterAll(async () => {
    await resetDatabase();
  });

  // ── Test 1: Create customer, contact, quote, and quote lines ──
  it("creates customer, contact, quote, and quote lines", async () => {
    const company = await createRecord(workspaceId, "company", {
      name: "Acme HVAC Corp",
      domain: "acme-hvac.example",
      phone: "555-0100",
      industry: "services",
      lifecycle_stage: "customer",
    });
    companyId = company.id;

    const contact = await createRecord(workspaceId, "contact", {
      primary_company_id: companyId,
      name: "John Customer",
      email: "john@acme-hvac.example",
      phone: "555-0101",
      role: "Facility Manager",
    });
    contactId = contact.id;

    const quote = await createRecord(workspaceId, "quote", {
      quote_number: "Q-V05-001",
      title: "Commercial HVAC Service Quote",
      status: "draft",
      version: 1,
      currency: "USD",
      company_id: companyId,
      contact_id: contactId,
      valid_until: "2026-12-31",
      owner: "Sarah Rep",
      terms: "Net 30",
      notes: "v0.5 journey test quote",
    });
    quoteId = quote.id;

    // Create two quote lines
    // Line 1: qty=4, unit_price=1000, discount=400, tax=560 → line_total=4160
    await createRecord(workspaceId, "quote_line", {
      quote_id: quoteId,
      description: "HVAC inspection service",
      quantity: 4,
      unit: "each",
      unit_price: 1000,
      discount_amount: 400,
      tax_amount: 560,
      line_total: 4160,
      sort_order: 1,
    });

    // Line 2: qty=2, unit_price=2000, discount=200, tax=280 → line_total=4080
    await createRecord(workspaceId, "quote_line", {
      quote_id: quoteId,
      description: "Compressor replacement",
      quantity: 2,
      unit: "each",
      unit_price: 2000,
      discount_amount: 200,
      tax_amount: 280,
      line_total: 4080,
      sort_order: 2,
    });

    // Verify quote and lines exist
    const quoteRow = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, quoteId],
    );
    expect(quoteRow).toBeDefined();
    expect(quoteRow!.status).toBe("draft");

    const lines = await queryAll<{ description: string; quantity: number }>(
      `SELECT description, quantity FROM ${businessTable("quote_line")} WHERE workspace_id = ? AND quote_id = ? ORDER BY sort_order`,
      [workspaceId, quoteId],
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].description).toBe("HVAC inspection service");
    expect(lines[1].description).toBe("Compressor replacement");
  });

  // ── Test 2: Recalculate quote totals from line items ──
  it("recalculates quote totals from line items", async () => {
    // Expected: subtotal=8000, discount=600, tax=840, total=8240
    const result = await recalculateQuoteCommand(
      workspaceId,
      quoteId,
      salesRep,
      quoteVersion,
    );
    quoteVersion = result.newVersion;
    expect(quoteVersion).toBe(2);

    const updatedQuote = await queryOne<{
      subtotal: number | null;
      discount_total: number | null;
      tax_total: number | null;
      grand_total: number | null;
    }>(
      `SELECT subtotal, discount_total, tax_total, grand_total
       FROM ${businessTable("quote")}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, quoteId],
    );
    expect(updatedQuote!.subtotal).toBe(8000);
    expect(updatedQuote!.discount_total).toBe(600);
    expect(updatedQuote!.tax_total).toBe(840);
    expect(updatedQuote!.grand_total).toBe(8240);
  });

  // ── Test 3: Submit quote for approval ──
  it("submits quote for approval and creates workflow instance", async () => {
    const result = await submitForApproval(
      workspaceId,
      quoteId,
      salesRep,
      quoteVersion,
    );
    quoteVersion = result.newVersion;
    expect(quoteVersion).toBe(3);
    expect(result.aggregate.status).toBe("in_review");

    // Query workflowInstancesV2 by record_id
    const wfInstance = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.workflowInstancesV2} WHERE workspace_id = ? AND record_id = ?`,
      [workspaceId, quoteId],
    );
    expect(wfInstance).toBeDefined();
    workflowInstanceId = wfInstance!.id;
  });

  // ── Test 4: Return quote for changes ──
  it("returns quote for changes", async () => {
    const result = await returnForChanges(
      workspaceId,
      quoteId,
      salesManager,
      quoteVersion,
      "Please revise pricing",
    );
    quoteVersion = result.newVersion;
    expect(quoteVersion).toBe(4);
    expect(result.aggregate.status).toBe("draft");
  });

  // ── Test 5: Re-submit and approve quote ──
  it("re-submits and approves the quote", async () => {
    const submitResult = await submitForApproval(
      workspaceId,
      quoteId,
      salesRep,
      quoteVersion,
    );
    quoteVersion = submitResult.newVersion;
    expect(quoteVersion).toBe(5);
    expect(submitResult.aggregate.status).toBe("in_review");

    const approveResult = await approveQuote(
      workspaceId,
      quoteId,
      salesManager,
      quoteVersion,
    );
    quoteVersion = approveResult.newVersion;
    expect(quoteVersion).toBe(6);
    expect(approveResult.aggregate.status).toBe("approved");
  });

  // ── Test 6: Mark quote as sent ──
  it("marks the approved quote as sent", async () => {
    const result = await markSent(
      workspaceId,
      quoteId,
      salesRep,
      quoteVersion,
    );
    quoteVersion = result.newVersion;
    expect(quoteVersion).toBe(7);
    expect(result.aggregate.status).toBe("sent");
  });

  // ── Test 7: Customer accepts quote ──
  it("accepts the quote on behalf of the customer", async () => {
    const result = await acceptQuote(
      workspaceId,
      quoteId,
      salesRep,
      quoteVersion,
    );
    quoteVersion = result.newVersion;
    expect(quoteVersion).toBe(8);
    expect(result.aggregate.status).toBe("accepted");
  });

  // ── Test 8: Convert quote to work order ──
  it("converts the accepted quote to a work order", async () => {
    const result = await convertToWorkOrder(
      workspaceId,
      quoteId,
      salesRep,
      quoteVersion,
    );
    quoteVersion = result.newVersion;
    expect(quoteVersion).toBe(9);
    workOrderId = result.aggregate.work_order_id!;
    expect(workOrderId).toBeDefined();

    const wo = await queryOne<{
      id: string;
      source_type: string;
      source_id: string;
      status: string;
    }>(
      `SELECT id, source_type, source_id, status
       FROM ${businessTable("work_order")}
       WHERE workspace_id = ? AND source_type = 'quote' AND source_id = ?`,
      [workspaceId, quoteId],
    );
    expect(wo).toBeDefined();
    expect(wo!.id).toBe(workOrderId);
    expect(wo!.source_type).toBe("quote");
    expect(wo!.source_id).toBe(quoteId);
    expect(wo!.status).toBe("new");

    woVersion = 1;
  });

  // ── Test 9: Triage work order ──
  it("triages the work order", async () => {
    const result = await triageWorkOrder(
      workspaceId,
      workOrderId,
      dispatcher,
      woVersion,
    );
    woVersion = result.newVersion;
    expect(woVersion).toBe(2);
    expect(result.aggregate.status).toBe("triaged");
  });

  // ── Test 10: Create visit and assign technician ──
  it("creates a visit and assigns a technician", async () => {
    const visitResult = await createVisit(
      workspaceId,
      workOrderId,
      dispatcher,
      woVersion,
    );
    woVersion = visitResult.newVersion;
    expect(woVersion).toBe(3);

    // createVisit returns the work order as aggregate, not the visit.
    // Query the service_visit table to get the visit ID.
    const visit = await queryOne<{ id: string }>(
      `SELECT id FROM ${businessTable("service_visit")} WHERE workspace_id = ? AND work_order_id = ?`,
      [workspaceId, workOrderId],
    );
    expect(visit).toBeDefined();
    visitId = visit!.id;
    expect(visitResult.aggregate.status).toBe("planned");

    // Propose assignment
    const proposeResult = await proposeAssignment(workspaceId, {
      subjectType: "service_visit",
      subjectId: visitId,
      resourceId: technician.id,
      proposedBy: dispatcher.id,
    });
    assignmentId = proposeResult.assignmentId;
    expect(assignmentId).toBeDefined();

    // Assign
    await assignAssignment(workspaceId, assignmentId, dispatcher.id);

    // Accept
    await acceptAssignment(workspaceId, assignmentId, technician.id);

    // Verify current assignment
    const current = await getCurrentAssignment(
      workspaceId,
      "service_visit",
      visitId,
    );
    expect(current).toBeDefined();
    expect(current!.resourceId).toBe(technician.id);
    expect(current!.status).toBe("accepted");
  });

  // ── Test 11: Schedule the visit ──
  it("schedules the visit for the technician", async () => {
    const planResult = await planSchedule(workspaceId, {
      subjectType: "service_visit",
      subjectId: visitId,
      resourceId: technician.id,
      startAt: "2026-07-15T09:00:00Z",
      endAt: "2026-07-15T11:00:00Z",
    });
    scheduleEntryId = planResult.scheduleEntryId;
    expect(scheduleEntryId).toBeDefined();
    expect(planResult.conflicts).toHaveLength(0);

    await confirmSchedule(workspaceId, scheduleEntryId, dispatcher.id);

    const entries = await getScheduleEntries(workspaceId, {
      resourceId: technician.id,
    });
    expect(entries.length).toBeGreaterThan(0);
    const entry = entries.find((e) => e.id === scheduleEntryId);
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("confirmed");
  });

  // ── Test 12: Execute visit lifecycle (travel → arrive → submit work) ──
  it("executes the visit lifecycle through to work submission", async () => {
    // Start travel
    const travelResult = await startTravel(
      workspaceId,
      visitId,
      technician,
      1,
    );
    expect(travelResult.newVersion).toBe(2);
    expect(travelResult.aggregate.status).toBe("en_route");

    // Arrive on site
    const arriveResult = await arriveOnSite(
      workspaceId,
      visitId,
      technician,
      2,
    );
    expect(arriveResult.newVersion).toBe(3);
    expect(arriveResult.aggregate.status).toBe("on_site");

    // Submit work
    const submitResult = await submitWork(
      workspaceId,
      visitId,
      technician,
      3,
    );
    expect(submitResult.newVersion).toBe(3);
    expect(submitResult.aggregate.status).toBe("on_site");
  });

  // ── Test 13: Submit and accept a service report form ──
  it("submits and accepts a service report form", async () => {
    // Publish form definition
    const formDef = await publishFormDefinition(
      workspaceId,
      {
        formKey: "service-report-form",
        name: "Service Report Form",
        schema: {
          blocks: [
            {
              block_type: "field",
              id: "summary_field",
              field_key: "summary",
              field_type: "text",
              label: "Summary",
              required: true,
            },
            {
              block_type: "field",
              id: "resolution_field",
              field_key: "resolution",
              field_type: "text",
              label: "Resolution",
              required: true,
            },
            {
              block_type: "checklist",
              id: "safety_checklist",
              label: "Safety Checklist",
              items: [
                { id: "item1", label: "PPE worn", required: true, pass_fail_na: true },
                { id: "item2", label: "Area secured", required: true, pass_fail_na: true },
              ],
            },
            {
              block_type: "evidence",
              id: "photo_evidence",
              label: "Photo Evidence",
              required: true,
              required_count: 1,
              accepted_types: ["image/jpeg", "image/png"],
            },
            {
              block_type: "signature",
              id: "customer_sig",
              label: "Customer Signature",
              required: true,
              acknowledgment_text: "I acknowledge the work was completed",
            },
          ],
        },
      },
      technician.id,
    );
    expect(formDef.definitionId).toBeDefined();

    // Create form binding
    const binding = await createFormBinding(workspaceId, formDef.definitionId, {
      usageType: "service_deliverable",
      requirementPolicy: "required",
    });
    expect(binding.bindingId).toBeDefined();

    // Submit form (subjectType=work_order so service_report projection has work_order_id)
    const submission = await submitForm(workspaceId, {
      formDefinitionId: formDef.definitionId,
      subjectType: "work_order",
      subjectId: workOrderId,
      bindingId: binding.bindingId,
      answers: {
        summary: "HVAC system repaired and tested",
        resolution: "Replaced faulty compressor and cleaned condenser coils",
        safety_checklist: { item1: "pass", item2: "pass" },
        photo_evidence: { attachments: ["photo-001", "photo-002"] },
        customer_sig: { acknowledged: true, signedBy: "John Customer" },
      },
      submittedBy: technician.id,
    });
    formSubmissionId = submission.submissionId;
    expect(formSubmissionId).toBeDefined();

    // Accept form submission
    const acceptResult = await acceptFormSubmission(
      workspaceId,
      formSubmissionId,
      supervisor.id,
    );
    expect(acceptResult.accepted).toBe(true);
    expect(acceptResult.serviceReportId).toBeDefined();

    // Verify service_report projection exists
    const reports = await getRecords(workspaceId, "service_report");
    expect(reports.length).toBeGreaterThan(0);
    const report = reports.find((r: Record<string, unknown>) => r.work_order_id === workOrderId);
    expect(report).toBeDefined();
    expect(report!.summary).toBe("HVAC system repaired and tested");
    expect(report!.resolution).toBe("Replaced faulty compressor and cleaned condenser coils");
    expect(report!.customer_signature).toBe("John Customer");
  });

  // ── Test 14: Complete visit and work order ──
  it("completes the visit and work order", async () => {
    // Complete the visit (requires accepted form, no pending submissions)
    const visitResult = await completeVisit(
      workspaceId,
      visitId,
      technician,
      3,
    );
    expect(visitResult.newVersion).toBe(4);
    expect(visitResult.aggregate.status).toBe("completed");

    // Work order planned -> in_progress has no FSM command; use direct SQL
    await execute(
      `UPDATE ${businessTable("work_order")} SET status = 'in_progress', updated_at = ? WHERE workspace_id = ? AND id = ?`,
      [now(), workspaceId, workOrderId],
    );

    // Complete work order (expectedVersion=3 since createVisit set woVersion to 3)
    const woResult = await completeWorkOrder(
      workspaceId,
      workOrderId,
      supervisor,
      woVersion,
      "All work completed successfully",
    );
    expect(woResult.newVersion).toBe(4);
    expect(woResult.aggregate.status).toBe("completed");
  });

  // ── Test 15: Verify command history and workflow events ──
  it("verifies command history and workflow events", async () => {
    // Verify command history for the quote aggregate
    const history = await getCommandHistory(workspaceId, "quote", quoteId);
    expect(history.length).toBeGreaterThanOrEqual(8);

    const commandTypes = history.map((h) => h.commandType);
    expect(commandTypes).toContain("quote.recalculate");
    expect(commandTypes).toContain("quote.submit_for_approval");
    expect(commandTypes).toContain("quote.return_for_changes");
    expect(commandTypes).toContain("quote.approve");
    expect(commandTypes).toContain("quote.mark_sent");
    expect(commandTypes).toContain("quote.accept");
    expect(commandTypes).toContain("quote.convert_to_work_order");

    // Verify workflow events
    const wfEvents = await getWorkflowHistory(
      workspaceId,
      workflowInstanceId,
    );
    expect(wfEvents.length).toBeGreaterThan(0);
    expect(wfEvents[0].event_type).toBe("workflow.started");

    // Verify events are in sequence order
    for (let i = 1; i < wfEvents.length; i++) {
      expect(wfEvents[i].sequence).toBeGreaterThan(wfEvents[i - 1].sequence);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// v0.5 Contract and Concurrency
// ════════════════════════════════════════════════════════════════════

describe("v0.5 Contract and Concurrency", () => {
  let workspaceId: string;

  const salesRep: CommandActor = { type: "user", id: "user_sales_rep" };
  const salesManager: CommandActor = { type: "user", id: "user_sales_manager" };
  const dispatcher: CommandActor = { type: "user", id: "user_dispatcher" };

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "fsm-pack");
    await setupPermissionGroups(workspaceId);
  });

  // ── Test 1: Rejects self-approval ──
  it("rejects self-approval when the assignee attempts to approve", async () => {
    // Create a quote
    const quote = await createRecord(workspaceId, "quote", {
      quote_number: "Q-SELF-001",
      title: "Self-approval test quote",
      status: "draft",
      version: 1,
      currency: "USD",
    });
    const qId = quote.id;

    // Publish a custom workflow definition with assigneeRule = userId
    await publishWorkflowDefinition(
      workspaceId,
      {
        workflowKey: "self-approval-test-wf",
        name: "Self Approval Test Workflow",
        targetObject: "quote",
        initialState: "draft",
        steps: [
          { id: "start", kind: "start", next: "approval" },
          {
            id: "approval",
            kind: "approval",
            assigneeRule: { userId: salesRep.id },
            policy: { allowSelfApproval: false },
            next: "end",
          },
          { id: "end", kind: "end" },
        ],
      },
      salesRep.id,
    );

    // Start workflow instance
    const { instanceId } = await startWorkflowV2(
      workspaceId,
      "self-approval-test-wf",
      "quote",
      qId,
      salesRep,
    );
    expect(instanceId).toBeDefined();

    // Query the pending work item
    const workItem = await queryOne<{ id: string; version: number }>(
      `SELECT id, version FROM ${TABLES.workItems}
       WHERE workspace_id = ? AND instance_id = ? AND status = 'ready'`,
      [workspaceId, instanceId],
    );
    expect(workItem).toBeDefined();

    // Attempt self-approval → should be rejected
    await expect(
      approvalDecide(
        workspaceId,
        workItem!.id,
        salesRep,
        "approved",
        null,
        workItem!.version,
      ),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL_NOT_ALLOWED" });
  });

  // ── Test 2: Rejects unauthorized actor ──
  it("rejects unauthorized actor without required permission", async () => {
    // Create a permission group with only quote.read (not quote.approve)
    await syncPackPermissionGroups(workspaceId, "test-pack", [
      {
        key: "read_only",
        label: "Read Only",
        description: "Users with read-only access",
        permissions: ["quote.read"],
      },
    ]);

    const groups = await getPackPermissionGroups(workspaceId, "test-pack");
    const readOnlyGroup = groups.find((g) => g.groupKey === "read_only");
    expect(readOnlyGroup).toBeDefined();

    const userId = "user_no_approve";
    await assignPackPermissionGroup(
      workspaceId,
      readOnlyGroup!.id,
      userId,
      "system",
    );

    const ctx = createRequestContext({
      principal: {
        userId,
        email: null,
        displayName: "No Approve User",
        authMethod: "dev_bootstrap",
      },
      workspaceId,
      workspaceRole: "member",
    });

    await expect(requireBusinessPermission(ctx, "quote.approve")).rejects.toMatchObject(
      { code: "PERMISSION_DENIED" },
    );
  });

  // ── Test 3: Version conflict on stale expectedVersion ──
  it("rejects commands with stale expectedVersion (version conflict)", async () => {
    const quote = await createRecord(workspaceId, "quote", {
      quote_number: "Q-VC-001",
      title: "Version conflict test quote",
      status: "draft",
      version: 1,
      currency: "USD",
    });
    const qId = quote.id;

    // Submit for approval (v1 → v2)
    await submitForApproval(workspaceId, qId, salesRep, 1);

    // Approve (v2 → v3)
    await approveQuote(workspaceId, qId, salesManager, 2);

    // Try approve again with stale version → VERSION_CONFLICT
    await expect(approveQuote(workspaceId, qId, salesManager, 2)).rejects.toMatchObject(
      { code: "VERSION_CONFLICT" },
    );
  });

  // ── Test 4: Idempotent command returns same result on retry ──
  it("returns the same result when an idempotent command is retried", async () => {
    const quote = await createRecord(workspaceId, "quote", {
      quote_number: "Q-IDEM-001",
      title: "Idempotency test quote",
      status: "draft",
      version: 1,
      currency: "USD",
    });
    const qId = quote.id;

    // Move quote through to accepted status (v1 → v5)
    await submitForApproval(workspaceId, qId, salesRep, 1);
    await approveQuote(workspaceId, qId, salesManager, 2);
    await markSent(workspaceId, qId, salesRep, 3);
    await acceptQuote(workspaceId, qId, salesRep, 4);

    // Convert to work order with explicit commandId
    const result1 = await convertToWorkOrder(
      workspaceId,
      qId,
      salesRep,
      5,
      "cmd-idem-001",
    );
    expect(result1.aggregate.work_order_id).toBeDefined();

    // Retry with same commandId → should return same result
    const result2 = await convertToWorkOrder(
      workspaceId,
      qId,
      salesRep,
      5,
      "cmd-idem-001",
    );
    expect(result2.aggregate.work_order_id).toBe(result1.aggregate.work_order_id);
  });

  // ── Test 5: Different input with same commandId is rejected ──
  it("rejects different input with the same commandId (idempotency key reused)", async () => {
    const quote = await createRecord(workspaceId, "quote", {
      quote_number: "Q-REUSE-001",
      title: "Idempotency key reuse test quote",
      status: "draft",
      version: 1,
      currency: "USD",
    });
    const qId = quote.id;

    // Submit for approval (v1 → v2)
    await submitForApproval(workspaceId, qId, salesRep, 1);

    // Reject with commandId "cmd-reuse-001" and reason1
    await rejectQuote(
      workspaceId,
      qId,
      salesManager,
      2,
      "reason1",
      "cmd-reuse-001",
    );

    // Retry with same commandId but different reason → IDEMPOTENCY_KEY_REUSED
    await expect(
      rejectQuote(
        workspaceId,
        qId,
        salesManager,
        2,
        "reason2",
        "cmd-reuse-001",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  // ── Test 6: Governed field cannot be updated directly ──
  it("prevents direct update of governed fields via updateRecord", async () => {
    const quote = await createRecord(workspaceId, "quote", {
      quote_number: "Q-GOV-001",
      title: "Governed field test quote",
      status: "draft",
      version: 1,
      currency: "USD",
    });
    const qId = quote.id;

    // Attempt to update a governed field directly → ConflictError (no .code)
    // Use toThrow because ConflictError does not have a .code property
    await expect(
      updateRecord(workspaceId, "quote", qId, { status: "approved" }),
    ).rejects.toThrow(/GOVERNED_FIELD_REQUIRES_COMMAND/);
  });

  // ── Test 7: Schedule conflict detection ──
  it("detects scheduling conflicts for overlapping time windows", async () => {
    const resourceId = "user_technician_conflict";

    // Plan and confirm a schedule entry for 10:00–11:00
    const planResult = await planSchedule(workspaceId, {
      subjectType: "service_visit",
      subjectId: genId("visit"),
      resourceId,
      startAt: "2026-07-20T10:00:00Z",
      endAt: "2026-07-20T11:00:00Z",
    });
    expect(planResult.scheduleEntryId).toBeDefined();

    await confirmSchedule(workspaceId, planResult.scheduleEntryId, dispatcher.id);

    // Detect conflicts for an overlapping window 10:30–11:30
    const conflicts = await detectConflicts(
      workspaceId,
      resourceId,
      "2026-07-20T10:30:00Z",
      "2026-07-20T11:30:00Z",
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].id).toBe(planResult.scheduleEntryId);
  });
});
