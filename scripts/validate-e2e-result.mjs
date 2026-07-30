#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const resultPath = process.argv.slice(2).find((argument) => argument !== "--");
if (!resultPath) {
  console.error("Usage: node scripts/validate-e2e-result.mjs <result.json>");
  process.exit(2);
}

const result = JSON.parse(readFileSync(resolve(resultPath), "utf8"));
const errors = [];
const allowedStatuses = new Set(["PASS", "FAIL", "BLOCKED", "N/A"]);
const allowedEnvironments = new Set(["dev", "staging", "production"]);
const allowedEvidenceLayers = new Set([
  "contract_integration",
  "api_business_walkthrough",
  "automated_browser_e2e",
  "manual_device_provider",
  "real_customer_release",
]);
const shaPattern = /^[0-9a-f]{40}$/;

if (result.schemaVersion !== "runory.e2e-result/v1") errors.push("unsupported schemaVersion");
if (typeof result.runId !== "string" || result.runId.length === 0) errors.push("runId is required");
if (!shaPattern.test(result.commit ?? "")) errors.push("commit must be an exact 40-character Git SHA");
if (typeof result.workingTreeDirty !== "boolean") errors.push("workingTreeDirty must be a boolean");
if (!allowedEnvironments.has(result.environment)) errors.push("environment is invalid");
if (!allowedEvidenceLayers.has(result.evidenceLayer)) errors.push("evidenceLayer is invalid");
if (!Array.isArray(result.scenarios)) errors.push("scenarios must be an array");
if (!new Set(["PASS", "FAIL"]).has(result.finalDecision)) errors.push("finalDecision must be PASS or FAIL");

for (const [index, scenario] of (result.scenarios ?? []).entries()) {
  if (!allowedStatuses.has(scenario.status)) errors.push(`scenario ${index} has invalid status`);
  if (!Number.isInteger(scenario.pass) || scenario.pass < 0) errors.push(`scenario ${index} has invalid pass count`);
  if (!Number.isInteger(scenario.fail) || scenario.fail < 0) errors.push(`scenario ${index} has invalid fail count`);
  if (!Array.isArray(scenario.failures)) errors.push(`scenario ${index} failures must be an array`);
  if (scenario.status === "PASS" && (scenario.fail !== 0 || scenario.failures.length !== 0)) {
    errors.push(`scenario ${index} cannot PASS with failures`);
  }
}

if (result.finalDecision === "PASS") {
  if (result.fatalError) errors.push("PASS result cannot contain fatalError");
  if (result.workingTreeDirty !== false) errors.push("PASS result requires a clean working tree");
  if (result.scenarios.length === 0) errors.push("PASS result must contain scenarios");
  if (result.scenarios.some((scenario) => scenario.status !== "PASS")) {
    errors.push("PASS result requires every scenario to PASS");
  }
  for (const key of ["workspaceId", "quoteId", "workOrderId", "visitId", "formSubmissionId"]) {
    if (typeof result.records?.[key] !== "string" || result.records[key].length === 0) {
      errors.push(`PASS result requires fresh records.${key}`);
    }
  }
}

if (result.evidenceLayer === "api_business_walkthrough") {
  const requiredScenarios = [
    "Owner Workspace Verification",
    "Quote Lifecycle",
    "Dispatch Flow",
    "Field Execution",
    "Cross-Surface Consistency",
  ];
  const actualScenarios = (result.scenarios ?? []).map((scenario) => scenario.name);
  if (JSON.stringify(actualScenarios) !== JSON.stringify(requiredScenarios)) {
    errors.push("API business walkthrough must contain the five required scenarios in order");
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`INVALID: ${error}`);
  process.exit(1);
}

console.log(`Valid Runory E2E result: ${result.runId} (${result.finalDecision})`);
