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
import { existsSync } from "node:fs";
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
    "runory_runtime_workflow_instances_v2",
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

  const v1StateColumn = columnExists("runory_runtime_workflow_instances", "status") ? "status" : "current_state";
  const activeV1 = count(`SELECT COUNT(*) FROM runory_runtime_workflow_instances WHERE workspace_id='${ws}' AND ${v1StateColumn} NOT IN ('completed', 'cancelled', 'failed', 'terminal')`);
  check("no active Workflow V1 instances", activeV1 === 0, String(activeV1), failures, warnings);

  const v2Instances = count(`SELECT COUNT(*) FROM runory_runtime_workflow_instances_v2 WHERE workspace_id='${ws}'`);
  console.log(`ⓘ Workflow V2 instances are optional for SMB default execution — ${v2Instances}`);

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

  const rawRelationIds = count(`
    SELECT COUNT(*)
    FROM runory_business_work_order wo
    LEFT JOIN runory_business_company c ON c.workspace_id = wo.workspace_id AND c.id = wo.company_id
    WHERE wo.workspace_id='${ws}' AND wo.company_id IS NOT NULL AND c.id IS NULL
  `);
  check("work order company relations resolve", rawRelationIds === 0, String(rawRelationIds), failures, warnings);

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

  console.log("\n✓ v0.5 local database passes the SMB closure preflight gate.\n");
}

main();
