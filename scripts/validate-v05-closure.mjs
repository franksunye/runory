#!/usr/bin/env node
/**
 * Validate the local Runory Cloud database against the v0.5 SMB closure gate.
 *
 * Usage:
 *   pnpm validate:v05
 *   DB_PATH=apps/cloud/data/runory.db WORKSPACE_ID=ws_... pnpm validate:v05
 *
 * This validator is intentionally read-only. It is a pre-manual-acceptance
 * signal for local development, not a replacement for browser/user testing.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB_PATH = path.resolve(ROOT, process.env.DB_PATH ?? "apps/cloud/data/runory.db");
const WORKSPACE_ID = process.env.WORKSPACE_ID;

function sql(query) {
  return execFileSync("sqlite3", [DB_PATH, query], { encoding: "utf8" }).trim();
}

function scalar(query) {
  const value = sql(query);
  return value === "" ? null : value;
}

function count(query) {
  return Number(scalar(query) ?? 0);
}

function tableExists(table) {
  return count(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${table.replaceAll("'", "''")}'`) > 0;
}

function columnExists(table, column) {
  const escaped = table.replaceAll("'", "''");
  const rows = sql(`PRAGMA table_info('${escaped}')`);
  return rows.split("\n").some((line) => line.split("|")[1] === column);
}

function latestWorkspaceId() {
  if (WORKSPACE_ID) return WORKSPACE_ID;
  return scalar("SELECT id FROM saas_workspaces ORDER BY created_at DESC LIMIT 1");
}

function check(label, ok, detail, failures, warnings, severity = "fail") {
  const icon = ok ? "✓" : severity === "warn" ? "⚠" : "✗";
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok && severity === "warn") warnings.push(label);
  if (!ok && severity === "fail") failures.push(label);
}

function quote(value) {
  return String(value).replaceAll("'", "''");
}

function findFilesByName(dir, fileName, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next" || entry.name === ".next-dev") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFilesByName(full, fileName, results);
    } else if (entry.name === fileName) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  console.log("\n=== Runory v0.5 SMB Closure Validator ===\n");
  console.log(`Database: ${DB_PATH}`);

  if (!existsSync(DB_PATH)) {
    console.error("✗ Database file does not exist.");
    process.exit(1);
  }

  const requiredTables = [
    "saas_workspaces",
    "runory_runtime_pack_installations",
    "runory_runtime_workflow_instances",
    "runory_runtime_work_items",
    "runory_runtime_resources",
    "runory_runtime_assignments",
    "runory_runtime_schedule_entries",
    "runory_runtime_form_definitions",
    "runory_business_company",
    "runory_business_quote",
    "runory_business_work_order",
    "runory_business_service_visit",
    "runory_business_service_report",
    "runory_business_technician",
  ];

  const failures = [];
  const warnings = [];

  for (const table of requiredTables) {
    check(`table exists: ${table}`, tableExists(table), "", failures, warnings);
  }

  if (failures.length > 0) {
    console.error("\nDatabase schema is incomplete; stop before data validation.");
    process.exit(1);
  }

  const workspaceId = latestWorkspaceId();
  check("workspace selected", Boolean(workspaceId), workspaceId ?? "none", failures, warnings);
  if (!workspaceId) process.exit(1);

  const ws = quote(workspaceId);
  console.log(`\nWorkspace: ${workspaceId}\n`);

  const requiredPacks = ["crm-lite-pack", "sales-quote-pack", "fsm-pack"];
  for (const packId of requiredPacks) {
    const installed = count(`SELECT COUNT(*) FROM runory_runtime_pack_installations WHERE workspace_id='${ws}' AND pack_id='${quote(packId)}'`) > 0;
    check(`pack installed: ${packId}`, installed, "", failures, warnings);
  }

  const objectMinimums = [
    ["companies", "runory_business_company", 1],
    ["quotes", "runory_business_quote", 1],
    ["technicians", "runory_business_technician", 1],
    ["work orders", "runory_business_work_order", 1],
    ["service visits", "runory_business_service_visit", 1],
    ["service reports", "runory_business_service_report", 1],
  ];

  for (const [label, table, min] of objectMinimums) {
    const n = count(`SELECT COUNT(*) FROM ${table} WHERE workspace_id='${ws}'`);
    check(`${label} >= ${min}`, n >= min, String(n), failures, warnings);
  }

  const stateColumn = columnExists("runory_runtime_workflow_instances", "status") ? "status" : "current_state";
  const activeInstances = count(`SELECT COUNT(*) FROM runory_runtime_workflow_instances WHERE workspace_id='${ws}' AND ${stateColumn} NOT IN ('completed', 'cancelled', 'failed', 'terminal')`);
  check("no active Workflow instances", activeInstances === 0, String(activeInstances), failures, warnings);

  const totalInstances = count(`SELECT COUNT(*) FROM runory_runtime_workflow_instances WHERE workspace_id='${ws}'`);
  console.log(`ⓘ Workflow instances are optional for SMB default execution — ${totalInstances}`);

  const workItems = count(`SELECT COUNT(*) FROM runory_runtime_work_items WHERE workspace_id='${ws}'`);
  console.log(`ⓘ Workflow-backed Work Items are optional when schedule-backed My Work is available — ${workItems}`);

  const resources = count(`SELECT COUNT(*) FROM runory_runtime_resources WHERE workspace_id='${ws}'`);
  const linkedResources = count(`SELECT COUNT(*) FROM runory_runtime_resources WHERE workspace_id='${ws}' AND user_id IS NOT NULL`);
  check("resources exist", resources > 0, String(resources), failures, warnings);
  check("at least one resource is user-linked", linkedResources > 0, `${linkedResources}/${resources}`, failures, warnings);

  const assignments = count(`SELECT COUNT(*) FROM runory_runtime_assignments WHERE workspace_id='${ws}'`);
  check("assignments exist", assignments > 0, String(assignments), failures, warnings);

  const schedules = count(`SELECT COUNT(*) FROM runory_runtime_schedule_entries WHERE workspace_id='${ws}'`);
  check("schedule entries exist", schedules > 0, String(schedules), failures, warnings);

  const scheduleSubjectsMissing = count(`
    SELECT COUNT(*)
    FROM runory_runtime_schedule_entries se
    LEFT JOIN runory_business_work_order wo
      ON se.subject_type = 'work_order'
     AND wo.workspace_id = se.workspace_id
     AND wo.id = se.subject_id
    LEFT JOIN runory_business_service_visit sv
      ON se.subject_type = 'service_visit'
     AND sv.workspace_id = se.workspace_id
     AND sv.id = se.subject_id
    WHERE se.workspace_id='${ws}'
      AND se.subject_type IN ('work_order', 'service_visit')
      AND COALESCE(wo.title, sv.title) IS NULL
  `);
  check("schedule-backed My Work subjects resolve", scheduleSubjectsMissing === 0, String(scheduleSubjectsMissing), failures, warnings);

  const forms = count(`SELECT COUNT(*) FROM runory_runtime_form_definitions WHERE workspace_id='${ws}'`);
  check("form definitions exist", forms > 0, String(forms), failures, warnings);

  const formSubmissions = count(`SELECT COUNT(*) FROM runory_runtime_form_submissions WHERE workspace_id='${ws}'`);
  check("form submissions exist", formSubmissions > 0, String(formSubmissions), failures, warnings);

  const evidenceSubmissions = count(`
    SELECT COUNT(*)
    FROM runory_runtime_form_submissions
    WHERE workspace_id='${ws}'
      AND answers_json LIKE '%"evi-photos"%'
      AND answers_json LIKE '%"attachments"%'
  `);
  check("field evidence exists in form submissions", evidenceSubmissions > 0, String(evidenceSubmissions), failures, warnings);

  const returnedSubmissions = count(`SELECT COUNT(*) FROM runory_runtime_form_submissions WHERE workspace_id='${ws}' AND status='returned'`);
  check("returned form submission example exists", returnedSubmissions > 0, String(returnedSubmissions), failures, warnings);

  const reportsWithPhotos = count(`
    SELECT COUNT(*)
    FROM runory_business_service_report
    WHERE workspace_id='${ws}'
      AND photos IS NOT NULL
      AND photos <> ''
  `);
  check("service reports include evidence references", reportsWithPhotos > 0, String(reportsWithPhotos), failures, warnings);

  const geolocatedSchedules = count(`
    SELECT COUNT(*)
    FROM runory_runtime_schedule_entries
    WHERE workspace_id='${ws}'
      AND location_type='customer_site'
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
  `);
  check("planning map has geolocated customer-site entries", geolocatedSchedules > 0, String(geolocatedSchedules), failures, warnings);

  const conflictSchedules = count(`
    SELECT COUNT(*)
    FROM runory_runtime_schedule_entries
    WHERE workspace_id='${ws}'
      AND conflict_state='conflict'
  `);
  check("planning conflict example exists", conflictSchedules > 0, String(conflictSchedules), failures, warnings);

  const staleOpenVisits = count(`
    SELECT COUNT(*)
    FROM runory_business_service_visit
    WHERE workspace_id='${ws}'
      AND status NOT IN ('completed', 'cancelled')
      AND scheduled_start IS NOT NULL
      AND datetime(scheduled_start) < datetime('now', '-7 days')
  `);
  check("open service visits are current-date-safe", staleOpenVisits === 0, String(staleOpenVisits), failures, warnings);

  const staleOpenWorkOrders = count(`
    SELECT COUNT(*)
    FROM runory_business_work_order
    WHERE workspace_id='${ws}'
      AND status NOT IN ('completed', 'cancelled')
      AND scheduled_start IS NOT NULL
      AND datetime(scheduled_start) < datetime('now', '-7 days')
  `);
  check("open work orders are current-date-safe", staleOpenWorkOrders === 0, String(staleOpenWorkOrders), failures, warnings);

  const rawRelationIds = count(`
    SELECT COUNT(*)
    FROM runory_business_work_order wo
    LEFT JOIN runory_business_company c ON c.workspace_id = wo.workspace_id AND c.id = wo.company_id
    WHERE wo.workspace_id='${ws}' AND wo.company_id IS NOT NULL AND c.id IS NULL
  `);
  check("work order company relations resolve", rawRelationIds === 0, String(rawRelationIds), failures, warnings);

  const activeQuoteApprovalModuleInstalls = count(`
    SELECT COUNT(*)
    FROM runory_runtime_installations
    WHERE workspace_id='${ws}'
      AND module_id='runory.quote-approval'
  `);
  check("quote approval retired module is not installed", activeQuoteApprovalModuleInstalls === 0, String(activeQuoteApprovalModuleInstalls), failures, warnings);

  const quoteApprovalsRoutePage = path.join(ROOT, "apps/cloud/src/app/w/[workspaceId]/quote-approvals/page.tsx");
  check("quote approvals has no standalone route page", !existsSync(quoteApprovalsRoutePage), "", failures, warnings);

  const salesQuoteTemplate = readFileSync(
    path.join(ROOT, "catalog/templates/small-business-sales-quote/manifest.yaml"),
    "utf8"
  );
  const templateHasQuoteApproval =
    salesQuoteTemplate.includes("quote-approvals") ||
    salesQuoteTemplate.includes("runory.quote-approval") ||
    salesQuoteTemplate.includes("quote_approval");
  check("sales quote template does not expose quote approvals", !templateHasQuoteApproval, "", failures, warnings);

  const dsStoreFiles = findFilesByName(path.join(ROOT, "apps/cloud/src"), ".DS_Store");
  check(".DS_Store files removed from source app tree", dsStoreFiles.length === 0, String(dsStoreFiles.length), failures, warnings);

  console.log("\nSummary:");
  console.log(`  failures: ${failures.length}`);
  console.log(`  warnings: ${warnings.length}`);

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) console.log(`  - ${warning}`);
  }

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }

  console.log("\n✓ v0.5.1 local database passes the SMB closure and acceptance-hardening preflight gate.\n");
}

main();
