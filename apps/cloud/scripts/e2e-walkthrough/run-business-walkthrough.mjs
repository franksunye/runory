#!/usr/bin/env node
/**
 * Business E2E Walkthrough — Multi-Role Functional Flow Validation
 *
 * Validates the core business flows that will be delivered to commercial
 * users, covering the complete lifecycle from quote creation through field
 * service execution. Uses the dev persona system to simulate multiple roles.
 *
 * Prerequisites:
 *   1. Dev server running: pnpm reset  (or pnpm dev + pnpm bootstrap:demo)
 *   2. PLATFORM_DEV_BOOTSTRAP=true in .env.local
 *   3. Demo Workspace exists with CRM Lite + FSM + Sales Quote packs installed
 *
 * Usage:
 *   node scripts/e2e-walkthrough/run-business-walkthrough.mjs
 *
 * Scenarios:
 *   1. Owner Workspace Verification — packs, objects, demo data, navigation
 *   2. Quote Lifecycle — Sales Rep creates → Sales Manager approves → convert to work order
 *   3. Dispatch Flow — Dispatcher triages, creates visit, assigns technician, schedules
 *   4. Field Execution — Technician executes visit, Supervisor completes
 *   5. Cross-Surface Consistency — timeline, audit, planning, my-work, forms
 *
 * Excludes: Retell/phone integrations, payment/billing flows
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  BASE_URL,
  assert,
  section,
  step,
  personaHeader,
  printSummary,
  resetCounters,
  printGrandSummary,
  getPassCount,
  getFailCount,
  getFailures,
  checkServer,
  checkDevMode,
  switchPersona,
  getCurrentPersona,
  getWorkspaceContext,
  executeCommand,
  listRecords,
  getRecord,
  createRecord,
  listObjects,
  listPacks,
  getNavigation,
  listWorkflowInstances,
  getRecordWorkflow,
  getMyWork,
  getTimeline,
  getPlanningEntries,
  listFormDefinitions,
  listFormSubmissions,
  getAuditEvents,
  getPermissionGroups,
  getVisitExecution,
  PERSONAS,
  PERSONA_LABELS,
  sleep,
  isoOffset,
} from "./_helpers.mjs";

// ── Run identity ──
// One Run ID is generated per walkthrough execution. Every downstream
// aggregate (quote → work order → visit → form submission) must trace back to
// a record created by this run, never to seeded/demo data (V09-REV-E2E-01).
const RUN_ID = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const RUN_STARTED_AT = new Date().toISOString();

function resolveCommit() {
  if (process.env.RUNORY_COMMIT_SHA) return process.env.RUNORY_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const COMMIT_SHA = resolveCommit();

function resolveWorkingTreeDirty() {
  try {
    return execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=no"],
      { encoding: "utf8" },
    ).trim().length > 0;
  } catch {
    return true;
  }
}

const WORKING_TREE_DIRTY = resolveWorkingTreeDirty();

// ── Shared state across scenarios ──
const state = {
  runId: RUN_ID,
  workspaceId: null,
  workspaceSlug: null,
  // Scenario 2: Quote lifecycle
  quoteId: null,
  quoteVersion: 1,
  quoteNumber: null,
  // Scenario 3: Dispatch
  workOrderId: null,
  workOrderVersion: 1,
  visitId: null,
  visitVersion: 1,
  assignmentId: null,
  resourceId: null,
  technicianId: null,
  scheduleEntryId: null,
  // Scenario 4: Field execution
  workItemId: null,
  formDefinitionId: null,
  formSubmissionId: null,
  formBindingId: null,
  formVersionId: null,
  // Cross-scenario lookups
  companyId: null,
  contactId: null,
  priceBookId: null,
};

const scenarioResults = [];
const REQUIRED_SCENARIOS = [
  "Owner Workspace Verification",
  "Quote Lifecycle",
  "Dispatch Flow",
  "Field Execution",
  "Cross-Surface Consistency",
];

// Register a scenario result with an explicit status. Every scenario MUST
// call this from a `finally` block so its result is recorded even when the
// scenario returns early or throws. `forcedStatus` is set when a required
// prerequisite was missing (SKIPPED/BLOCKED); otherwise the status is derived
// from the failure counter. Per V09-REV-E2E-01, a non-PASS status (including
// SKIPPED/BLOCKED) must never let the process exit 0.
function registerScenarioResult(name, forcedStatus = null, startedAt = null) {
  const pass = getPassCount();
  const fail = getFailCount();
  let status = forcedStatus;
  if (!status) {
    status = fail > 0 ? "FAIL" : "PASS";
  }
  scenarioResults.push({
    name,
    status,
    pass,
    fail,
    failures: [...getFailures()],
    durationMs: startedAt === null ? null : Date.now() - startedAt,
  });
  return status;
}

function writeRunArtifact(finalDecision, fatalError = null) {
  const artifactScenarios = REQUIRED_SCENARIOS.map((name) =>
    scenarioResults.find((scenario) => scenario.name === name) ?? {
      name,
      status: "BLOCKED",
      pass: 0,
      fail: 1,
      failures: [fatalError ?? "Scenario did not complete"],
      durationMs: null,
    }
  );
  const artifact = {
    schemaVersion: "runory.e2e-result/v1",
    runId: RUN_ID,
    commit: COMMIT_SHA,
    workingTreeDirty: WORKING_TREE_DIRTY,
    environment: process.env.RUNORY_E2E_ENVIRONMENT ?? "dev",
    evidenceLayer: "api_business_walkthrough",
    browser: null,
    viewport: null,
    baseUrl: BASE_URL,
    startedAt: RUN_STARTED_AT,
    completedAt: new Date().toISOString(),
    principals: Object.entries(PERSONA_LABELS).map(([id, label]) => ({ id, label })),
    records: {
      workspaceId: state.workspaceId,
      workspaceSlug: state.workspaceSlug,
      quoteId: state.quoteId,
      workOrderId: state.workOrderId,
      visitId: state.visitId,
      formSubmissionId: state.formSubmissionId,
    },
    scenarios: artifactScenarios,
    artifacts: { screenshots: [], traces: [], console: [], network: [] },
    fatalError,
    finalDecision,
  };
  const defaultPath = resolve(
    import.meta.dirname,
    `../../test-results/e2e/business-walkthrough-${RUN_ID}.json`,
  );
  const artifactPath = resolve(process.env.RUNORY_E2E_RESULT_PATH ?? defaultPath);
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`  Machine result: ${artifactPath}`);
  console.log(`RUNORY_E2E_RESULT=${JSON.stringify(artifact)}`);
  return artifactPath;
}

// ── Preflight checks ──

async function preflight() {
  section("PREFLIGHT — Environment Verification");

  step(1, "Check dev server is running");
  const serverOk = await checkServer();
  assert(serverOk, `Dev server reachable at ${BASE_URL}`);
  if (!serverOk) {
    throw new Error("Server not running. Start with: pnpm reset");
  }

  step(2, "Check dev mode (persona switching)");
  const devMode = await checkDevMode();
  assert(devMode, "PLATFORM_DEV_BOOTSTRAP is enabled (persona API accessible)");
  if (!devMode) {
    throw new Error("Dev mode not active. Set PLATFORM_DEV_BOOTSTRAP=true in .env.local");
  }

  step(3, "Switch to Owner persona and discover workspace");
  await switchPersona(PERSONAS.OWNER);
  const ctx = await getWorkspaceContext();
  state.workspaceId = ctx.workspaceId;
  state.workspaceSlug = ctx.workspaceSlug;
  assert(ctx.workspaceId != null, `Workspace discovered: ${ctx.workspaceName} (${ctx.workspaceId})`);
  console.log(`     Slug: ${ctx.workspaceSlug}`);
  console.log(`     URL:  ${BASE_URL}/w/${ctx.workspaceSlug}`);
}

// ── Scenario 1: Owner Workspace Verification ──

async function scenario1() {
  const scenarioStartedAt = Date.now();
  section("SCENARIO 1 — Owner: Workspace Setup & Demo Data Verification");
  personaHeader(PERSONAS.OWNER, PERSONA_LABELS[PERSONAS.OWNER]);
  resetCounters();
  let forcedStatus = null;
  try {
  const ws = state.workspaceId;

  // 1.1 Verify packs installed
  step("1.1", "Verify packs installed (CRM Lite, FSM, Sales Quote)");
  {
    const packs = await listPacks(ws);
    const installed = packs.filter((p) => p.installed === true || p.status === "installed");
    assert(installed.length >= 3, `At least 3 packs installed (got ${installed.length})`);
    const packIds = installed.map((p) => p.id ?? p.packId);
    assert(packIds.includes("crm-lite-pack"), "CRM Lite Pack installed");
    assert(packIds.includes("fsm-pack"), "FSM Pack installed");
    assert(packIds.includes("sales-quote-pack"), "Sales Quote Pack installed");
  }

  // 1.2 Verify business objects exist
  step("1.2", "Verify business objects are available");
  {
    const objects = await listObjects(ws);
    const objectKeys = objects.map((o) => o.objectKey ?? o.object_key);
    const expectedObjects = [
      "company", "contact", "deal", "task",
      "work_order", "service_visit", "service_site", "asset", "technician", "service_report",
      "quote", "quote_line", "product_service", "price_book", "price_book_item",
    ];
    for (const key of expectedObjects) {
      assert(objectKeys.includes(key), `Object "${key}" exists`);
    }
  }

  // 1.3 Verify demo data — companies
  step("1.3", "Verify demo companies loaded");
  {
    const { records } = await listRecords(ws, "company", { limit: 50 });
    assert(records.length >= 6, `At least 6 companies (got ${records.length})`);
    const acme = records.find((r) => r.domain === "acme.example");
    assert(acme != null, "Acme Operations company exists");
    if (acme) {
      state.companyId = acme.id;
      console.log(`     Acme ID: ${acme.id}`);
    }
  }

  // 1.4 Verify demo data — contacts
  step("1.4", "Verify demo contacts loaded");
  {
    const { records } = await listRecords(ws, "contact", { limit: 50 });
    assert(records.length >= 7, `At least 7 contacts (got ${records.length})`);
    const maya = records.find((r) => r.email === "maya@acme.example");
    assert(maya != null, "Maya Chen contact exists");
    if (maya) {
      state.contactId = maya.id;
      console.log(`     Maya ID: ${maya.id}`);
    }
  }

  // 1.5 Verify demo data — work orders
  step("1.5", "Verify demo work orders loaded");
  {
    const { records } = await listRecords(ws, "work_order", { limit: 50 });
    assert(records.length >= 5, `At least 5 work orders (got ${records.length})`);
    const statuses = [...new Set(records.map((r) => r.status))];
    console.log(`     Work order statuses present: ${statuses.join(", ")}`);
    assert(statuses.includes("new") || statuses.includes("planned") || statuses.includes("triaged"), "Work order with initial status (new/planned/triaged) exists");
    assert(statuses.includes("planned"), "Work order with 'planned' status exists");
  }

  // 1.6 Verify demo data — quotes
  step("1.6", "Verify demo quotes loaded");
  {
    const { records } = await listRecords(ws, "quote", { limit: 50 });
    assert(records.length >= 8, `At least 8 quotes (got ${records.length})`);
    const statuses = [...new Set(records.map((r) => r.status))];
    console.log(`     Quote statuses present: ${statuses.join(", ")}`);
    assert(statuses.includes("draft"), "Quote with 'draft' status exists");
    assert(statuses.includes("accepted"), "Quote with 'accepted' status exists");
  }

  // 1.7 Verify demo data — technicians
  step("1.7", "Verify demo technicians loaded");
  {
    const { records } = await listRecords(ws, "technician", { limit: 20 });
    assert(records.length >= 3, `At least 3 technicians (got ${records.length})`);
    const david = records.find((r) => r.email === "david@runory.fsm");
    assert(david != null, "David Park technician exists");
    if (david) {
      state.technicianId = david.id;
      console.log(`     David Park ID: ${david.id}`);
    }
  }

  // 1.8 Verify navigation
  step("1.8", "Verify navigation items configured");
  {
    const nav = await getNavigation(ws);
    assert(Array.isArray(nav) && nav.length > 0, `Navigation has items (got ${nav.length})`);
    console.log(`     Navigation groups: ${nav.length}`);
  }

  // 1.9 Verify permission groups
  step("1.9", "Verify permission groups configured");
  {
    const groups = await getPermissionGroups(ws);
    assert(groups.length >= 5, `At least 5 permission groups (got ${groups.length})`);
    console.log(`     Permission groups: ${groups.length}`);
  }

  // 1.10 Verify price books for quote flow
  step("1.10", "Verify price books loaded for quote flow");
  {
    const { records } = await listRecords(ws, "price_book", { limit: 10 });
    assert(records.length >= 1, `At least 1 price book (got ${records.length})`);
    const standard = records.find((r) => r.name?.includes("Standard"));
    assert(standard != null, "Standard Price Book exists");
    if (standard) {
      state.priceBookId = standard.id;
      console.log(`     Standard Price Book ID: ${standard.id}`);
    }
  }

  // 1.11 Verify form definitions
  step("1.11", "Verify form definitions loaded");
  {
    const forms = await listFormDefinitions(ws);
    assert(forms.length >= 1, `At least 1 form definition (got ${forms.length})`);
    const deliverableForm = forms.find((f) => f.form_key === "service-deliverable-checklist");
    assert(deliverableForm != null, "Service Deliverable Checklist form exists");
    if (deliverableForm) {
      state.formDefinitionId = deliverableForm.id;
      console.log(`     Form definition ID: ${deliverableForm.id}`);
    }
  }

  } catch (e) {
    console.error(`\n  SCENARIO ERROR: ${e?.message ?? e}`);
    assert(false, `Scenario 1 terminated by exception: ${e?.message ?? e}`);
    forcedStatus = forcedStatus ?? "BLOCKED";
  } finally {
    printSummary("Scenario 1: Owner Workspace Verification");
    registerScenarioResult("Owner Workspace Verification", forcedStatus, scenarioStartedAt);
  }
}

// ── Scenario 2: Quote Lifecycle (Sales Rep → Sales Manager → Sales Rep) ──

async function scenario2() {
  const scenarioStartedAt = Date.now();
  section("SCENARIO 2 — Quote Lifecycle: Sales Rep → Sales Manager → Sales Rep");
  resetCounters();
  let forcedStatus = null;
  try {
  const ws = state.workspaceId;

  // ── Phase 1: Sales Rep creates a new quote ──
  personaHeader(PERSONAS.SALES_REP, PERSONA_LABELS[PERSONAS.SALES_REP]);
  await switchPersona(PERSONAS.SALES_REP);

  step("2.1", "Sales Rep: Create a new draft quote via command");
  {
    const { ok, json } = await executeCommand(ws, "quote.create_draft", {
      title: `E2E Walkthrough Quote [${RUN_ID}] — HVAC Maintenance Plan`,
      companyId: state.companyId,
      contactId: state.contactId,
      currency: "CNY",
      priceBookId: state.priceBookId,
    });
    assert(ok, "quote.create_draft command succeeded");
    assert(json.data?.aggregate?.id != null, "Quote ID returned in response");
    assert(json.data?.status === "succeeded", "Command status is 'succeeded'");

    if (json.data?.aggregate?.id) {
      state.quoteId = json.data.aggregate.id;
      state.quoteNumber = json.data.aggregate.quote_number;
      state.quoteVersion = json.data.newVersion ?? 1;
      console.log(`     Quote ID: ${state.quoteId}`);
      console.log(`     Quote Number: ${state.quoteNumber}`);
      console.log(`     Version: ${state.quoteVersion}`);
    }
  }

  step("2.2", "Sales Rep: Verify quote record is persisted");
  {
    const { record } = await getRecord(ws, "quote", state.quoteId);
    assert(record != null, "Quote record found in database");
    assert(record?.status === "draft", `Quote status is 'draft' (got: ${record?.status})`);
    assert(record?.title?.includes("E2E Walkthrough"), "Quote title matches");
  }

  step("2.3", "Sales Rep: Add quote line items via records API");
  {
    // Add first line — HVAC Emergency Repair
    const { records: products } = await listRecords(ws, "product_service", { limit: 20 });
    const hvacRepair = products.find((p) => p.sku === "SVC-HVAC-001");
    assert(hvacRepair != null, "HVAC Repair service product found");

    if (hvacRepair) {
      const { status, record } = await createRecord(ws, "quote_line", {
        quote_id: state.quoteId,
        product_service_id: hvacRepair.id,
        description: "HVAC Emergency Repair Service (E2E)",
        quantity: 2,
        unit: "Visit",
        unit_price: 2500,
        tax_amount: 600,
        line_total: 5000,
        sort_order: 1,
      });
      assert(status === 201, `Quote line 1 created (status ${status})`);
    }

    // Add second line — Filter
    const filter = products.find((p) => p.sku === "PRT-FLT-002");
    assert(filter != null, "HEPA Filter product found");
    if (filter) {
      const { status } = await createRecord(ws, "quote_line", {
        quote_id: state.quoteId,
        product_service_id: filter.id,
        description: "HVAC Filter (High Efficiency) (E2E)",
        quantity: 4,
        unit: "Piece",
        unit_price: 380,
        tax_amount: 182,
        line_total: 1520,
        sort_order: 2,
      });
      assert(status === 201, `Quote line 2 created (status ${status})`);
    }
  }

  step("2.4", "Sales Rep: Recalculate quote totals via command");
  {
    // Quote Line mutation is an atomic Quote Command and advances the Quote
    // aggregate version. Refresh before the explicit recalculation command so
    // the optimistic lock observes the current aggregate state.
    const { record: currentQuote } = await getRecord(ws, "quote", state.quoteId);
    if (currentQuote?.aggregate_version) state.quoteVersion = currentQuote.aggregate_version;
    const { ok, json } = await executeCommand(ws, "quote.recalculate", {
      aggregateId: state.quoteId,
      expectedVersion: state.quoteVersion,
    });
    assert(ok, "quote.recalculate command succeeded");
    if (json.data?.newVersion) {
      state.quoteVersion = json.data.newVersion;
      console.log(`     New version: ${state.quoteVersion}`);
    }
    // Verify totals are calculated
    const { record } = await getRecord(ws, "quote", state.quoteId);
    assert(record?.grand_total != null, `Grand total calculated (value: ${record?.grand_total})`);
  }

  step("2.5", "Sales Rep: Submit quote for approval via command");
  {
    const { ok, json } = await executeCommand(ws, "quote.submit_for_approval", {
      aggregateId: state.quoteId,
      expectedVersion: state.quoteVersion,
    });
    assert(ok, "quote.submit_for_approval command succeeded");
    if (json.data?.newVersion) {
      state.quoteVersion = json.data.newVersion;
      console.log(`     New version: ${state.quoteVersion}`);
    }

    // Verify quote status changed
    const { record } = await getRecord(ws, "quote", state.quoteId);
    assert(record?.status === "in_review", `Quote status is 'in_review' (got: ${record?.status})`);
  }

  step("2.6", "Sales Rep: Verify workflow instance was created");
  {
    await sleep(500); // Brief pause for workflow to initialize
    const wfData = await getRecordWorkflow(ws, "quote", state.quoteId);
    assert(wfData != null, "Workflow instance found for quote");
    if (wfData) {
      console.log(`     Workflow key: ${wfData.workflowKey ?? wfData.workflow_key ?? "N/A"}`);
      console.log(`     Instance ID: ${wfData.id ?? wfData.instanceId ?? "N/A"}`);
      const workItems = wfData.workItems ?? wfData.work_items ?? [];
      assert(workItems.length > 0, `At least 1 work item in workflow (got ${workItems.length})`);
      // Find the approval work item
      const approvalItem = workItems.find(
        (wi) => wi.kind === "approval" || wi.stepKind === "approval" || wi.status === "ready" || wi.status === "active"
      );
      if (approvalItem) {
        state.workItemId = approvalItem.id ?? approvalItem.workItemId;
        console.log(`     Approval work item ID: ${state.workItemId}`);
      }
    }
  }

  // ── Phase 2: Sales Manager approves the quote ──
  personaHeader(PERSONAS.SALES_MANAGER, PERSONA_LABELS[PERSONAS.SALES_MANAGER]);
  await switchPersona(PERSONAS.SALES_MANAGER);

  step("2.7", "Sales Manager: List quotes in review");
  {
    const { records } = await listRecords(ws, "quote", { limit: 50 });
    const inReview = records.filter((r) => r.status === "in_review");
    assert(inReview.length >= 1, `At least 1 quote in review (got ${inReview.length})`);
    const found = inReview.find((r) => r.id === state.quoteId);
    assert(found != null, "E2E quote is visible in review list");
  }

  step("2.8", "Sales Manager: Find approval work item via my-work");
  {
    const myWork = await getMyWork(ws);
    assert(Array.isArray(myWork), "my-work endpoint returns array");
    // Find the approval work item for our quote
    const matchingItems = myWork.filter(
      (wi) => wi.subjectType === "quote" && wi.subjectId === state.quoteId
    );
    if (matchingItems.length > 0) {
      state.workItemId = matchingItems[0].id ?? matchingItems[0].workItemId;
      console.log(`     Found work item: ${state.workItemId}`);
    }
    assert(state.workItemId != null, "Approval work item found in my-work");
  }

  step("2.9", "Sales Manager: Approve quote via approval.decide command");
  {
    if (!state.workItemId) {
      // Required prerequisite (approval Work Item) is absent. Record a
      // failure, mark the scenario BLOCKED, and exit the scenario body.
      // The `finally` block below still registers the result so the grand
      // summary can never silently drop this scenario.
      assert(false, "No approval work item found — my-work endpoint should return the approval work item");
      forcedStatus = "BLOCKED";
      return;
    }

    const { ok, json } = await executeCommand(ws, "approval.decide", {
      aggregateId: state.workItemId,
      outcome: "approved",
      comment: "E2E walkthrough: Quote approved for HVAC maintenance plan",
      expectedVersion: 1,
    });
    assert(ok, "approval.decide command succeeded");
    if (!ok) {
      console.log(`     Response: ${JSON.stringify(json.error ?? json.data?.slice(0, 200))}`);
    }
  }

  step("2.10", "Verify workflow auto-executes quote.approve (system_command step)");
  {
    // CORRECT BEHAVIOR: After approval.decide with outcome "approved", the
    // workflow engine should automatically execute the "approved" system_command
    // step (which calls quote.approve) and advance to "end".
    //
    // The quote-approval workflow defines:
    //   approval.onApprove → "approved" (system_command, command: "quote.approve") → "end"
    //
    // The workflow engine has no step executor for system_command steps.
    // The approvalDecideHandler only updates current_step_id but does not
    // execute the bound command. This is a known system defect (P0).
    //
    // This assertion MUST FAIL until the workflow engine implements
    // system_command auto-execution.
    await sleep(1000); // Brief pause for any async workflow processing
    const { record } = await getRecord(ws, "quote", state.quoteId);
    assert(
      record?.status === "approved",
      `Quote should auto-transition to 'approved' after approval.decide (got: ${record?.status})`
    );
    if (record?.aggregate_version) {
      state.quoteVersion = record.aggregate_version;
      console.log(`     Current version: ${state.quoteVersion}`);
    }

    // The workflow instance should also be completed
    const wfData = await getRecordWorkflow(ws, "quote", state.quoteId);
    assert(
      wfData?.status === "completed",
      `Workflow instance should be 'completed' after system_command auto-execution (got: ${wfData?.status ?? "N/A"})`
    );
  }

  // ── Phase 3: Sales Rep marks quote as sent ──
  personaHeader(PERSONAS.SALES_REP, PERSONA_LABELS[PERSONAS.SALES_REP]);
  await switchPersona(PERSONAS.SALES_REP);

  step("2.11", "Sales Rep: Mark quote as sent via command");
  {
    const { ok, json } = await executeCommand(ws, "quote.mark_sent", {
      aggregateId: state.quoteId,
      expectedVersion: state.quoteVersion,
    });
    assert(ok, "quote.mark_sent command succeeded");
    if (json.data?.newVersion) state.quoteVersion = json.data.newVersion;

    const { record } = await getRecord(ws, "quote", state.quoteId);
    assert(record?.status === "sent", `Quote status is 'sent' (got: ${record?.status})`);
  }

  // ── Phase 4: Sales Manager accepts quote and converts to work order ──
  // quote.accept requires the 'quote.accept' permission, which only the
  // sales_manager group has (not sales_representative). Similarly,
  // quote.convert_to_work_order requires 'quote.convert'.
  personaHeader(PERSONAS.SALES_MANAGER, PERSONA_LABELS[PERSONAS.SALES_MANAGER]);
  await switchPersona(PERSONAS.SALES_MANAGER);

  step("2.12", "Sales Manager: Accept quote on behalf of customer via command");
  {
    const { ok, json } = await executeCommand(ws, "quote.accept", {
      aggregateId: state.quoteId,
      expectedVersion: state.quoteVersion,
    });
    assert(ok, "quote.accept command succeeded");
    if (json.data?.newVersion) state.quoteVersion = json.data.newVersion;

    const { record } = await getRecord(ws, "quote", state.quoteId);
    assert(record?.status === "accepted", `Quote status is 'accepted' (got: ${record?.status})`);
    assert(record?.accepted_at != null, "accepted_at timestamp is set");
  }

  step("2.13", "Sales Manager: Convert accepted quote to work order via command");
  {
    const { ok, json } = await executeCommand(ws, "quote.convert_to_work_order", {
      aggregateId: state.quoteId,
      expectedVersion: state.quoteVersion,
    });
    assert(ok, "quote.convert_to_work_order command succeeded");

    // The work order ID is set on the quote aggregate's work_order_id field.
    // The effect provider (fsm.create_work_order_from_quote) creates the
    // work_order record atomically in the same batch.
    const woId = json.data?.aggregate?.work_order_id;
    if (woId) {
      state.workOrderId = woId;
    } else {
      // The command response did not surface the work order id. Resolve it
      // by tracing to the quote created by THIS run (source_id === quoteId).
      // This is NOT a seeded-record fallback: any work order used here must
      // be the one created from the current run's quote (V09-REV-E2E-01).
      const { records } = await listRecords(ws, "work_order", { limit: 50 });
      const linked = records.find(
        (r) => r.source_type === "quote" && r.source_id === state.quoteId
      );
      if (linked) state.workOrderId = linked.id;
    }
    assert(state.workOrderId != null, `Work order created from quote (Run ${RUN_ID}, ID: ${state.workOrderId})`);
    console.log(`     Work Order ID: ${state.workOrderId}`);
  }

  // Sales Manager has work_order.read permission. Previously, the visibility
  // layer filtered work_order (an OPERATIONAL_OBJECT) to "1 = 0" for users
  // without OPERATIONAL_TEAM_SCOPE_PERMISSIONS or resource assignment,
  // making work_order.read effectively useless for commercial roles.
  // This was fixed: users with work_order.read can now see quote-originated
  // work orders (source_type = 'quote'). Verify with the Sales Manager.
  personaHeader(PERSONAS.SALES_MANAGER, PERSONA_LABELS[PERSONAS.SALES_MANAGER]);
  await switchPersona(PERSONAS.SALES_MANAGER);

  step("2.14", "Sales Manager: Verify work order record created from quote");
  {
    if (state.workOrderId) {
      const { record } = await getRecord(ws, "work_order", state.workOrderId);
      assert(record != null, "Work order record visible to Sales Manager");
      assert(
        record?.status === "new",
        `Work order status is 'new' (got: ${record?.status})`
      );
      state.workOrderVersion = record?.aggregate_version ?? 1;
      console.log(`     Work Order Number: ${record?.work_order_number ?? "N/A"}`);
    }

    // Verify the quote now links back to the work order
    const { record: updatedQuote } = await getRecord(ws, "quote", state.quoteId);
    assert(
      updatedQuote?.work_order_id === state.workOrderId,
      `Quote.work_order_id links to created work order (${updatedQuote?.work_order_id ?? "none"})`
    );
  }

  } catch (e) {
    console.error(`\n  SCENARIO ERROR: ${e?.message ?? e}`);
    assert(false, `Scenario 2 terminated by exception: ${e?.message ?? e}`);
    forcedStatus = forcedStatus ?? "BLOCKED";
  } finally {
    printSummary("Scenario 2: Quote Lifecycle");
    registerScenarioResult("Quote Lifecycle", forcedStatus, scenarioStartedAt);
  }
}

// ── Scenario 3: Dispatch Flow (Dispatcher → Technician) ──

async function scenario3() {
  const scenarioStartedAt = Date.now();
  section("SCENARIO 3 — Dispatch Flow: Dispatcher triages, creates visit, assigns, schedules");
  resetCounters();
  let forcedStatus = null;
  try {
  const ws = state.workspaceId;

  // No seeded-record fallback. The dispatch flow may only operate on the
  // Work Order created from the current run's Quote (Scenario 2). If that
  // prerequisite is absent, the scenario is BLOCKED and must record a failure
  // — it must never silently pass with { pass: 0, fail: 0 } (V09-REV-E2E-01).
  if (!state.workOrderId) {
    assert(
      false,
      `No Work Order from Scenario 2 (Run ${RUN_ID}) — Quote-to-Work-Order conversion did not produce a traceable Work Order; dispatch flow cannot proceed`
    );
    forcedStatus = "BLOCKED";
    return;
  }

  // ── Phase 1: Dispatcher triages and creates visit ──
  personaHeader(PERSONAS.DISPATCHER, PERSONA_LABELS[PERSONAS.DISPATCHER]);
  await switchPersona(PERSONAS.DISPATCHER);

  step("3.1", "Dispatcher: List work orders");
  {
    const { records } = await listRecords(ws, "work_order", { limit: 50 });
    assert(records.length >= 1, `At least 1 work order visible (got ${records.length})`);
    const target = records.find((r) => r.id === state.workOrderId);
    assert(target != null, "Target work order is visible to dispatcher");
    console.log(`     Target: ${target?.title ?? target?.work_order_number ?? state.workOrderId}`);
  }

  step("3.2", "Dispatcher: Triage work order via command");
  {
    // Read current status — skip triage if already past 'new'
    const { record: currentWo } = await getRecord(ws, "work_order", state.workOrderId);
    if (currentWo?.status === "new") {
      const { ok, json } = await executeCommand(ws, "work_order.triage", {
        aggregateId: state.workOrderId,
        expectedVersion: state.workOrderVersion,
        priority: "high",
        companyId: state.companyId,
        contactId: state.contactId,
      });
      assert(ok, "work_order.triage command succeeded");
      if (json.data?.newVersion) state.workOrderVersion = json.data.newVersion;
      console.log(`     New version: ${state.workOrderVersion}`);
    } else {
      console.log(`     Skipping triage — work order already in '${currentWo?.status}' status`);
    }

    const { record } = await getRecord(ws, "work_order", state.workOrderId);
    assert(
      record?.status === "planned" || record?.status === "triaged" || record?.status === "in_progress",
      `Work order status after triage (got: ${record?.status})`
    );
    if (currentWo?.status === "new") {
      assert(record?.priority === "high", `Priority set to 'high' (got: ${record?.priority})`);
    } else {
      console.log(`     Current priority: ${record?.priority}`);
    }
  }

  step("3.3", "Dispatcher: Create service visit (Plan & Dispatch) via command");
  {
    // Use a time slot 7 days out to avoid conflicts with demo data visits
    // (demo data schedules visits from -2d to +3d relative to today).
    const start = isoOffset(7, 9, 0);
    const end = isoOffset(7, 13, 0);
    const { ok, json } = await executeCommand(ws, "work_order.create_visit", {
      aggregateId: state.workOrderId,
      expectedVersion: state.workOrderVersion,
      title: "E2E Walkthrough — HVAC Maintenance Visit",
      technicianId: state.technicianId,
      scheduledStart: start,
      scheduledEnd: end,
      notes: "Scheduled visit for HVAC maintenance and filter replacement",
    });
    assert(ok, "work_order.create_visit command succeeded");
    if (json.data?.newVersion) state.workOrderVersion = json.data.newVersion;

    // create_visit is a Plan & Dispatch operation: it atomically creates the
    // service visit, assignment, schedule entry, and execution work items via
    // the fsm.create_dispatched_visit effect provider.
    const workItemIds = json.data?.workItemIds ?? [];
    if (workItemIds.length > 0) {
      console.log(`     Work item IDs created: ${workItemIds.length}`);
      state.workItemId = workItemIds[0];
    }

    // Strategy: list service visits linked to this work order
    await sleep(500);
    const { records: visits } = await listRecords(ws, "service_visit", { limit: 50 });
    const linked = visits.find(
      (v) => v.work_order_id === state.workOrderId
    );
    if (linked) {
      state.visitId = linked.id;
    }

    assert(state.visitId != null, `Service visit created (ID: ${state.visitId})`);
    console.log(`     Visit ID: ${state.visitId}`);

    if (state.visitId) {
      const { record: visit } = await getRecord(ws, "service_visit", state.visitId);
      assert(visit != null, "Service visit record exists");
      state.visitVersion = visit?.aggregate_version ?? 1;
      assert(
        visit?.status === "scheduled" || visit?.status === "ready",
        `Visit status (got: ${visit?.status})`
      );
      // The visit record stores the assignment and schedule IDs created by
      // the Plan & Dispatch effect provider.
      if (visit?.assignment_id) {
        state.assignmentId = visit.assignment_id;
        console.log(`     Assignment ID (from visit): ${state.assignmentId}`);
      }
      if (visit?.schedule_entry_id) {
        state.scheduleEntryId = visit.schedule_entry_id;
        console.log(`     Schedule Entry ID (from visit): ${state.scheduleEntryId}`);
      }
    }

    // Fetch immutable visit execution requirements (deliverables snapshot).
    // These are created by Plan & Dispatch and must be satisfied before the
    // visit can be completed. Store binding/form/work-item IDs for step 4.3.
    if (state.visitId) {
      const requirements = await getVisitExecution(ws, state.visitId);
      console.log(`     Execution requirements: ${requirements.length}`);
      if (requirements.length > 0) {
        const req = requirements[0];
        state.formBindingId = req.binding_id;
        state.formVersionId = req.form_version_id;
        // Update formDefinitionId to match the requirement (may differ from
        // the workspace-level form definition found in Scenario 1).
        state.formDefinitionId = req.form_definition_id;
        if (req.work_item_id) {
          state.workItemId = req.work_item_id;
        }
        console.log(`     Required form: ${req.form_name} (binding: ${state.formBindingId?.slice(0, 12)}…)`);
      }
    }
  }

  step("3.4", "Dispatcher: Verify technician resource is linked");
  {
    // Resource is a runtime table (not a catalog business object).
    // Technician records have a `resource_id` field that links to it.
    if (state.technicianId) {
      const { record: tech } = await getRecord(ws, "technician", state.technicianId);
      if (tech?.resource_id) {
        state.resourceId = tech.resource_id;
        console.log(`     Resource ID (from technician.resource_id): ${state.resourceId}`);
      }
    }
    assert(state.resourceId != null, "Technician resource ID found");
  }

  step("3.5", "Dispatcher: Verify assignment was auto-created by Plan & Dispatch");
  {
    // The create_visit command atomically creates an assignment via the
    // fsm.create_dispatched_visit effect provider. We verify it exists
    // rather than creating a separate one.
    if (state.assignmentId) {
      console.log(`     Assignment already created: ${state.assignmentId}`);
      assert(state.assignmentId != null, "Assignment ID available from visit record");
    } else {
      // Fallback: look up assignments for this visit
      const { records: assignments } = await listRecords(ws, "assignment", { limit: 50 });
      const matching = assignments.find(
        (a) => a.subject_id === state.visitId || a.subjectId === state.visitId
      );
      if (matching) {
        state.assignmentId = matching.id;
        console.log(`     Assignment found via list: ${state.assignmentId}`);
      }
      assert(state.assignmentId != null, "Assignment exists for visit (auto-created by Plan & Dispatch)");
    }
  }

  step("3.6", "Dispatcher: Verify schedule entry was auto-created and has no conflict");
  {
    // The create_visit command atomically creates a schedule entry via the
    // fsm.create_dispatched_visit effect provider.
    if (state.scheduleEntryId) {
      console.log(`     Schedule entry already created: ${state.scheduleEntryId}`);
      assert(state.scheduleEntryId != null, "Schedule entry ID available from visit record");
    } else {
      // Fallback: check planning entries
      const entries = await getPlanningEntries(ws, {
        from: isoOffset(0, 0, 0),
        to: isoOffset(7, 23, 59),
      });
      const matching = entries.find(
        (e) => e.subjectId === state.visitId || e.subject_id === state.visitId
      );
      if (matching) {
        state.scheduleEntryId = matching.id ?? matching.scheduleEntryId;
        console.log(`     Schedule entry found via planning: ${state.scheduleEntryId}`);
      }
      assert(state.scheduleEntryId != null, "Schedule entry exists for visit (auto-created by Plan & Dispatch)");
    }

    // The schedule entry MUST NOT have a conflict — a conflicted schedule
    // blocks downstream operations (start_travel, etc.). If create_visit
    // detects a conflict, it should either reject the request or provide
    // explicit feedback, not silently create a conflicted entry.
    const entries = await getPlanningEntries(ws, {
      from: isoOffset(0, 0, 0),
      to: isoOffset(7, 23, 59),
    });
    const ourEntry = entries.find(
      (e) => (e.subjectId === state.visitId || e.subject_id === state.visitId)
    );
    if (ourEntry) {
      const conflictState = ourEntry.conflictState ?? ourEntry.conflict_state;
      assert(
        conflictState === "none",
        `Schedule entry has no conflict (conflict_state: ${conflictState ?? "N/A"})`
      );
    }
  }

  step("3.7", "Dispatcher: Verify planning entries reflect the new schedule");
  {
    await sleep(500);
    const entries = await getPlanningEntries(ws, {
      from: isoOffset(0, 0, 0),
      to: isoOffset(7, 23, 59),
    });
    assert(entries.length >= 1, `Planning entries returned (got ${entries.length})`);
    // The scheduled visit MUST appear in planning entries — this is a core
    // consistency requirement, not optional.
    const matching = entries.filter(
      (e) => e.subjectId === state.visitId || e.subject_id === state.visitId
    );
    assert(matching.length >= 1, `E2E visit appears in planning entries (got ${matching.length} matches)`);
    console.log(`     Total planning entries: ${entries.length}`);
  }

  // ── Phase 2: Technician accepts the assignment ──
  personaHeader(PERSONAS.TECHNICIAN, PERSONA_LABELS[PERSONAS.TECHNICIAN]);
  await switchPersona(PERSONAS.TECHNICIAN);

  step("3.8", "Technician: Accept assignment via command");
  {
    if (state.assignmentId) {
      const { ok, json } = await executeCommand(ws, "assignment.accept", {
        aggregateId: state.assignmentId,
      });
      assert(ok, "assignment.accept command succeeded");
      if (!ok) {
        console.log(`     Response: ${JSON.stringify(json.error ?? json.data).slice(0, 200)}`);
      }
    } else {
      assert(false, "No assignment ID to accept");
    }
  }

  step("3.9", "Technician: Verify visit appears in my-work");
  {
    const myWork = await getMyWork(ws);
    assert(Array.isArray(myWork), "my-work returns array");
    // The assigned visit MUST appear in the technician's my-work list.
    // Plan & Dispatch creates work items for the visit, and the technician
    // has accepted the assignment — the visit should be visible.
    const matching = myWork.filter(
      (wi) => wi.subjectId === state.visitId || wi.subject_id === state.visitId
    );
    console.log(`     My work items: ${myWork.length}, matching visit: ${matching.length}`);
    assert(matching.length >= 1, `Visit appears in technician's my-work (got ${matching.length} matches)`);
  }

  } catch (e) {
    console.error(`\n  SCENARIO ERROR: ${e?.message ?? e}`);
    assert(false, `Scenario 3 terminated by exception: ${e?.message ?? e}`);
    forcedStatus = forcedStatus ?? "BLOCKED";
  } finally {
    printSummary("Scenario 3: Dispatch Flow");
    registerScenarioResult("Dispatch Flow", forcedStatus, scenarioStartedAt);
  }
}

// ── Scenario 4: Field Execution (Technician → Supervisor) ──

async function scenario4() {
  const scenarioStartedAt = Date.now();
  section("SCENARIO 4 — Field Execution: Technician executes visit, Supervisor completes");
  resetCounters();
  let forcedStatus = null;
  try {
  const ws = state.workspaceId;

  // No seeded-record fallback. Field execution may only operate on the
  // Visit created from the current run's Work Order (Scenario 3). If that
  // prerequisite is absent, the scenario is BLOCKED and must record a failure
  // — it must never silently pass with { pass: 0, fail: 0 } (V09-REV-E2E-01).
  if (!state.visitId) {
    assert(
      false,
      `No Visit from Scenario 3 (Run ${RUN_ID}) — dispatch flow did not produce a traceable Visit; field execution cannot proceed`
    );
    forcedStatus = "BLOCKED";
    return;
  }

  // ── Phase 1: Technician executes the visit ──
  personaHeader(PERSONAS.TECHNICIAN, PERSONA_LABELS[PERSONAS.TECHNICIAN]);
  await switchPersona(PERSONAS.TECHNICIAN);

  step("4.1", "Technician: Start travel to site via command");
  {
    const { ok, json } = await executeCommand(ws, "visit.start_travel", {
      aggregateId: state.visitId,
      expectedVersion: state.visitVersion,
    });
    assert(ok, "visit.start_travel command succeeded");
    if (json.data?.newVersion) state.visitVersion = json.data.newVersion;

    const { record } = await getRecord(ws, "service_visit", state.visitId);
    assert(
      record?.status === "en_route",
      `Visit status after start_travel (got: ${record?.status})`
    );
  }

  step("4.2", "Technician: Arrive on site via command");
  {
    const { ok, json } = await executeCommand(ws, "visit.arrive", {
      aggregateId: state.visitId,
      expectedVersion: state.visitVersion,
    });
    assert(ok, "visit.arrive command succeeded");
    if (json.data?.newVersion) state.visitVersion = json.data.newVersion;

    const { record } = await getRecord(ws, "service_visit", state.visitId);
    assert(
      record?.status === "on_site",
      `Visit status after arrive (got: ${record?.status})`
    );
  }

  step("4.3", "Technician: Submit service deliverable form");
  {
    if (state.formDefinitionId) {
      // The form submission must include bindingId and formVersionId from the
      // visit's execution requirement snapshot, otherwise visit.complete will
      // reject it as an unfulfilled deliverable.
      const { ok, json } = await executeCommand(ws, "form_submission.submit", {
        formDefinitionId: state.formDefinitionId,
        formVersionId: state.formVersionId ?? undefined,
        bindingId: state.formBindingId ?? undefined,
        workItemId: state.workItemId ?? undefined,
        subjectType: "service_visit",
        subjectId: state.visitId,
        answers: {
          work_performed: "E2E walkthrough: Replaced HVAC filters, checked refrigerant levels, tested system operation. All parameters normal.",
          parts_used: "2x HEPA Filter (Model H-12)",
          system_status_after_service: "operational",
          "cl-pre-service": {
            "cl-1": "pass",
            "cl-2": "pass",
            "cl-3": "pass",
            "cl-4": "pass",
          },
          "evi-photos": {
            attachments: ["att_e2e_before_001", "att_e2e_after_001"],
          },
          "sig-customer": {
            acknowledged: true,
            signedBy: "Maya Chen",
          },
        },
      });
      assert(ok, "form_submission.submit command succeeded");
      // The HTTP Command route returns submitForm()'s aggregate directly as
      // `data`, while older/internal callers may still wrap it in `aggregate`.
      // Capture either shape, but fail this Scenario immediately if a
      // successful response cannot be bound to the fresh submission record.
      const submissionId = json.data?.submissionId
        ?? json.data?.aggregate?.submissionId;
      assert(submissionId != null, "Current-run Form Submission ID returned");
      if (submissionId) {
        state.formSubmissionId = submissionId;
        console.log(`     Form submission ID: ${state.formSubmissionId}`);
      }
    } else {
      assert(false, "No form definition available — form submission is required for visit completion");
    }
  }

  step("4.4", "Technician: Submit work via command");
  {
    const { ok, json } = await executeCommand(ws, "visit.submit_work", {
      aggregateId: state.visitId,
      expectedVersion: state.visitVersion,
    });
    assert(ok, "visit.submit_work command succeeded");
    if (json.data?.newVersion) state.visitVersion = json.data.newVersion;

    // submit_work does NOT transition visit status — it emits a
    // work_submitted event but the visit remains on_site until completed.
    const { record } = await getRecord(ws, "service_visit", state.visitId);
    assert(
      record?.status === "on_site",
      `Visit status remains 'on_site' after submit_work (got: ${record?.status})`
    );
  }

  // ── Phase 2: Supervisor completes the visit and work order ──
  personaHeader(PERSONAS.SUPERVISOR, PERSONA_LABELS[PERSONAS.SUPERVISOR]);
  await switchPersona(PERSONAS.SUPERVISOR);

  step("4.5", "Supervisor: Complete the visit via command");
  {
    const { ok, json } = await executeCommand(ws, "visit.complete", {
      aggregateId: state.visitId,
      expectedVersion: state.visitVersion,
    });
    assert(ok, "visit.complete command succeeded");
    if (json.data?.newVersion) state.visitVersion = json.data.newVersion;

    const { record } = await getRecord(ws, "service_visit", state.visitId);
    assert(
      record?.status === "completed",
      `Visit status is 'completed' (got: ${record?.status})`
    );
  }

  step("4.6", "Supervisor: Start the work order via command");
  {
    if (state.workOrderId) {
      // Read current work order version
      const { record: wo } = await getRecord(ws, "work_order", state.workOrderId);
      const woVersion = wo?.aggregate_version ?? state.workOrderVersion;

      // Work order must be in 'in_progress' before it can be completed.
      // The create_visit command transitions triaged → planned, so we need
      // to start it (planned → in_progress) before completion.
      if (wo?.status === "planned") {
        const { ok, json } = await executeCommand(ws, "work_order.start", {
          aggregateId: state.workOrderId,
          expectedVersion: woVersion,
        });
        assert(ok, "work_order.start command succeeded");
        if (json.data?.newVersion) state.workOrderVersion = json.data.newVersion;

        const { record: started } = await getRecord(ws, "work_order", state.workOrderId);
        assert(
          started?.status === "in_progress",
          `Work order status is 'in_progress' after start (got: ${started?.status})`
        );
      } else if (wo?.status === "in_progress") {
        console.log(`     Work order already in_progress — skipping start`);
        state.workOrderVersion = woVersion;
      } else {
        assert(
          false,
          `Work order in unexpected status '${wo?.status}' — expected 'planned' or 'in_progress'`
        );
      }
    } else {
      assert(false, "No work order ID to start");
    }
  }

  step("4.7", "Supervisor: Complete the work order via command");
  {
    if (state.workOrderId) {
      // Read current work order version
      const { record: wo } = await getRecord(ws, "work_order", state.workOrderId);
      const woVersion = wo?.aggregate_version ?? state.workOrderVersion;

      const { ok, json } = await executeCommand(ws, "work_order.complete", {
        aggregateId: state.workOrderId,
        expectedVersion: woVersion,
        completionReason: "E2E walkthrough: HVAC maintenance completed successfully",
      });
      assert(ok, "work_order.complete command succeeded");

      const { record } = await getRecord(ws, "work_order", state.workOrderId);
      assert(
        record?.status === "completed",
        `Work order status is 'completed' (got: ${record?.status})`
      );
    } else {
      assert(false, "No work order ID to complete");
    }
  }

  } catch (e) {
    console.error(`\n  SCENARIO ERROR: ${e?.message ?? e}`);
    assert(false, `Scenario 4 terminated by exception: ${e?.message ?? e}`);
    forcedStatus = forcedStatus ?? "BLOCKED";
  } finally {
    printSummary("Scenario 4: Field Execution");
    registerScenarioResult("Field Execution", forcedStatus, scenarioStartedAt);
  }
}

// ── Scenario 5: Cross-Surface Consistency & Audit ──

async function scenario5() {
  const scenarioStartedAt = Date.now();
  section("SCENARIO 5 — Cross-Surface Consistency: Timeline, Audit, Planning, Forms");
  resetCounters();
  let forcedStatus = null;
  try {
  const ws = state.workspaceId;

  // Switch to owner for broad visibility
  personaHeader(PERSONAS.OWNER, PERSONA_LABELS[PERSONAS.OWNER]);
  await switchPersona(PERSONAS.OWNER);

  // 5.1 Timeline for quote
  step("5.1", "Verify timeline events for the quote created in Scenario 2");
  {
    if (state.quoteId) {
      const timeline = await getTimeline(ws, "quote", state.quoteId, 50);
      assert(timeline.length >= 1, `Timeline has entries for quote (got ${timeline.length})`);
      console.log(`     Timeline entries: ${timeline.length}`);
      // Check for key event types
      const eventTypes = [...new Set(timeline.map((e) => e.eventType ?? e.event_type ?? e.type))];
      console.log(`     Event types: ${eventTypes.join(", ")}`);
      assert(timeline.length >= 3, `At least 3 timeline events (got ${timeline.length})`);
    } else {
      assert(false, "No quote ID for timeline check");
    }
  }

  // 5.2 Timeline for work order
  step("5.2", "Verify timeline events for the work order");
  {
    if (state.workOrderId) {
      const timeline = await getTimeline(ws, "work_order", state.workOrderId, 50);
      assert(timeline.length >= 1, `Timeline has entries for work order (got ${timeline.length})`);
      console.log(`     Timeline entries: ${timeline.length}`);
    } else {
      assert(false, "No work order ID for timeline check");
    }
  }

  // 5.3 Timeline for service visit
  step("5.3", "Verify timeline events for the service visit");
  {
    if (state.visitId) {
      const timeline = await getTimeline(ws, "service_visit", state.visitId, 50);
      assert(timeline.length >= 1, `Timeline has entries for visit (got ${timeline.length})`);
      console.log(`     Timeline entries: ${timeline.length}`);
    } else {
      assert(false, "No visit ID for timeline check");
    }
  }

  // 5.4 Audit events
  step("5.4", "Verify audit trail exists for command operations");
  {
    const auditEvents = await getAuditEvents(ws, { limit: 50 });
    assert(auditEvents.length >= 1, `Audit events returned (got ${auditEvents.length})`);
    console.log(`     Total audit events: ${auditEvents.length}`);

    // Check for quote-related audit events
    if (state.quoteId) {
      const quoteAudits = auditEvents.filter(
        (e) => e.entityId === state.quoteId || e.entity_id === state.quoteId
      );
      assert(quoteAudits.length >= 1, `Audit events for quote exist (got ${quoteAudits.length})`);
    }
  }

  // 5.5 Planning entries
  step("5.5", "Verify planning entries are consistent");
  {
    const entries = await getPlanningEntries(ws, {
      from: isoOffset(-7, 0, 0),
      to: isoOffset(14, 23, 59),
    });
    assert(entries.length >= 1, `Planning entries returned (got ${entries.length})`);
    console.log(`     Planning entries in 3-week window: ${entries.length}`);

    // Verify our scheduled visit appears
    if (state.visitId) {
      const matching = entries.filter(
        (e) => e.subjectId === state.visitId || e.subject_id === state.visitId
      );
      console.log(`     Entries matching our visit: ${matching.length}`);
      assert(matching.length >= 1, `Current-run Visit appears in planning (got ${matching.length})`);
    } else {
      assert(false, "No current-run Visit for planning consistency check");
    }
  }

  // 5.6 Form submissions
  step("5.6", "Verify form submissions are recorded");
  {
    if (state.formSubmissionId) {
      const submissions = await listFormSubmissions(ws, {
        subjectType: "service_visit",
        subjectId: state.visitId,
      });
      assert(submissions.length >= 1, `Form submissions for visit (got ${submissions.length})`);
      const ours = submissions.find((s) => s.id === state.formSubmissionId);
      assert(ours != null, "E2E form submission found in list");
    } else {
      assert(false, "No current-run Form Submission for consistency check");
    }
  }

  // 5.7 Workflow instances
  step("5.7", "Verify workflow instances are tracked and completed");
  {
    const instances = await listWorkflowInstances(ws, { limit: 50 });
    assert(instances.length >= 1, `Workflow instances exist (got ${instances.length})`);
    console.log(`     Total workflow instances: ${instances.length}`);

    // Check for our quote's workflow
    if (state.quoteId) {
      const quoteWf = instances.find(
        (inst) => inst.record_id === state.quoteId || inst.subjectId === state.quoteId || inst.subject_id === state.quoteId
      );
      assert(quoteWf != null, "Workflow instance for E2E quote found");
      // After the quote has been approved, accepted, and converted to a work
      // order, the workflow instance MUST be in 'completed' status. If it's
      // still 'running', the workflow engine failed to auto-execute the
      // system_command step (quote.approve) after the approval decision.
      assert(
        quoteWf?.status === "completed",
        `Workflow instance for E2E quote is 'completed' (got: ${quoteWf?.status ?? "N/A"})`
      );
      if (quoteWf) {
        console.log(`     Workflow status: ${quoteWf.status ?? "N/A"}`);
      }
    }
  }

  // 5.8 Quote-to-work-order traceability
  step("5.8", "Verify quote-to-work-order traceability");
  {
    if (state.quoteId && state.workOrderId) {
      const { record: quote } = await getRecord(ws, "quote", state.quoteId);
      assert(
        quote?.work_order_id === state.workOrderId,
        `Quote links to work order (${quote?.work_order_id ?? "none"} vs ${state.workOrderId})`
      );

      const { record: wo } = await getRecord(ws, "work_order", state.workOrderId);
      assert(
        wo?.source_type === "quote" || wo?.source_id === state.quoteId,
        `Work order traces back to quote (source: ${wo?.source_type ?? "none"})`
      );
    } else {
      assert(false, "Missing quote or work order for traceability check");
    }
  }

  // 5.9 Data integrity — quote lifecycle states
  step("5.9", "Verify end-to-end data integrity of the quote lifecycle");
  {
    if (state.quoteId) {
      const { record: quote } = await getRecord(ws, "quote", state.quoteId);
      assert(quote?.status === "converted", `Final quote status is 'converted' (got: ${quote?.status})`);
      assert(quote?.accepted_at != null, "Quote has accepted_at timestamp");
      assert(quote?.work_order_id != null, "Quote has linked work_order_id");
      assert(quote?.aggregate_version >= 5, `Quote version >= 5 after lifecycle (got: ${quote?.aggregate_version})`);
      console.log(`     Quote final state: status=${quote?.status}, version=${quote?.aggregate_version}`);
    }
  }

  // 5.10 Work order final state
  step("5.10", "Verify work order final state");
  {
    if (state.workOrderId) {
      const { record: wo } = await getRecord(ws, "work_order", state.workOrderId);
      assert(wo?.status === "completed", `Final work order status is 'completed' (got: ${wo?.status})`);
      console.log(`     Work order final state: status=${wo?.status}, version=${wo?.aggregate_version}`);
    }
  }

  } catch (e) {
    console.error(`\n  SCENARIO ERROR: ${e?.message ?? e}`);
    assert(false, `Scenario 5 terminated by exception: ${e?.message ?? e}`);
    forcedStatus = forcedStatus ?? "BLOCKED";
  } finally {
    printSummary("Scenario 5: Cross-Surface Consistency");
    registerScenarioResult("Cross-Surface Consistency", forcedStatus, scenarioStartedAt);
  }
}

// ── Main ──

async function main() {
  console.log("");
  console.log("=".repeat(70));
  console.log("  Runory Business E2E Walkthrough");
  console.log("  Multi-Role Functional Flow Validation");
  console.log("=".repeat(70));
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Date:   ${new Date().toISOString()}`);
  console.log(`  Run ID: ${RUN_ID}`);
  console.log(`  Excludes: Retell/phone integrations, payment/billing flows`);

  try {
    await preflight();
  } catch (e) {
    console.error("\nFATAL: Preflight failed:", e.message);
    writeRunArtifact("FAIL", e?.message ?? String(e));
    process.exitCode = 1;
    return;
  }

  // Run all scenarios
  await scenario1();
  await scenario2();
  await scenario3();
  await scenario4();
  await scenario5();

  // Grand summary — counts ALL scenarios (each registers its result in a
  // `finally` block, so a scenario that returned early or threw is still
  // included). V09-REV-E2E-01.
  const totalFail = printGrandSummary(scenarioResults);

  // Any required scenario that did not PASS (FAIL/SKIPPED/BLOCKED) must force
  // a non-zero process exit. A missing scenario result (defensive: should not
  // happen with `finally` registration) is also a hard failure.
  const EXPECTED_SCENARIO_COUNT = 5;
  const hasNonPassScenario = scenarioResults.some(
    (s) => s.status && s.status !== "PASS"
  );
  const allScenariosRegistered = scenarioResults.length >= EXPECTED_SCENARIO_COUNT;
  if (!allScenariosRegistered) {
    console.error(
      `\n  FATAL: Only ${scenarioResults.length}/${EXPECTED_SCENARIO_COUNT} scenarios registered a result.`
    );
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  Run ID:        ${RUN_ID}`);
  console.log(`  Workspace:     ${BASE_URL}/w/${state.workspaceSlug}`);
  console.log(`  Quote ID:      ${state.quoteId ?? "N/A"}`);
  console.log(`  Work Order ID: ${state.workOrderId ?? "N/A"}`);
  console.log(`  Visit ID:      ${state.visitId ?? "N/A"}`);
  console.log(`${"=".repeat(70)}\n`);

  const passed = totalFail === 0 && !hasNonPassScenario && allScenariosRegistered;
  writeRunArtifact(passed ? "PASS" : "FAIL");
  process.exitCode = passed ? 0 : 1;
}

main().catch((e) => {
  console.error("\nWalkthrough crashed:", e);
  writeRunArtifact("FAIL", e?.message ?? String(e));
  process.exitCode = 1;
});
