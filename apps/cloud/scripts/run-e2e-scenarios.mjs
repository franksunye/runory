#!/usr/bin/env node
/**
 * E2E Scenario Runner — executes all 5 release scenarios in sequence
 * and writes a summary report to docs/releases/e2e-report.md.
 *
 * Usage: node scripts/run-e2e-scenarios.mjs
 * Prereq: dev server running (pnpm dev:cloud)
 *
 * Each scenario script is executed as a child process. The runner captures
 * stdout/stderr, exit code, and duration, then compiles a markdown report.
 */

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = resolve(__dirname, "e2e-scenarios");
const REPORT_PATH = resolve(__dirname, "../../../docs/releases/e2e-report.md");
const REPORT_DIR = dirname(REPORT_PATH);

const SCENARIOS = [
  {
    id: "A",
    name: "New Customer Onboarding",
    script: "scenario-a-onboarding.mjs",
    description:
      "Email OTP → Organization/Workspace created → CRM Lite installed → Customer + Contact created → Member invited and scoped",
  },
  {
    id: "B",
    name: "Governed Workspace Extension",
    script: "scenario-b-extension.mjs",
    description:
      "Agent proposes customer tier field → Diff preview → Admin approval → Apply → UI update → Audit → rollback point verified",
  },
  {
    id: "C",
    name: "Module Manufacturing and Upgrade",
    script: "scenario-c-module-upgrade.mjs",
    description:
      "typed Module source → SDK validate/test/build → immutable artifact → validate → compatibility → upgrade path",
  },
  {
    id: "D",
    name: "Bad Release Containment",
    script: "scenario-d-bad-release.mjs",
    description:
      "Beta migration fails → target marked failed → rollout pauses → unrelated Workspace available → containment evidence",
  },
  {
    id: "E",
    name: "Recovery",
    script: "scenario-e-recovery.mjs",
    description:
      "restore backup → migrations replay → tenant isolation suite → CRM journey → Catalog/installation integrity verified",
  },
];

function runScenario(scriptPath) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn("node", [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const duration = Date.now() - start;
      resolve({
        exitCode: code ?? 1,
        duration,
        stdout,
        stderr,
      });
    });

    child.on("error", (err) => {
      const duration = Date.now() - start;
      resolve({
        exitCode: 1,
        duration,
        stdout,
        stderr: `Failed to spawn: ${err.message}`,
      });
    });
  });
}

function extractSummary(stdout) {
  const passMatch = stdout.match(/Passed:\s*(\d+)/);
  const failMatch = stdout.match(/Failed:\s*(\d+)/);
  return {
    passed: passMatch ? parseInt(passMatch[1], 10) : 0,
    failed: failMatch ? parseInt(failMatch[1], 10) : 0,
  };
}

async function main() {
  console.log("=== Runory E2E Scenario Runner ===\n");
  console.log(`Target: ${process.env.RUNORY_API_BASE ?? "http://localhost:3000"}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  const results = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Scenario ${scenario.id}: ${scenario.name}`);
    console.log(`${"─".repeat(60)}`);

    const scriptPath = resolve(SCRIPTS_DIR, scenario.script);
    const result = await runScenario(scriptPath);
    const summary = extractSummary(result.stdout);

    console.log(result.stdout);
    if (result.stderr) {
      console.log(`[stderr]\n${result.stderr}`);
    }
    console.log(
      `→ Exit: ${result.exitCode} | Passed: ${summary.passed} | Failed: ${summary.failed} | ${result.duration}ms`
    );

    results.push({ ...scenario, ...result, ...summary });
  }

  // ── Build report ──
  const totalPassed = results.filter((r) => r.exitCode === 0).length;
  const totalScenarios = results.length;
  const allPassed = totalPassed === totalScenarios;

  const lines = [];
  lines.push("# Runory E2E Scenario Report");
  lines.push("");
  lines.push(`- **Release:** v0.1.0`);
  lines.push(`- **Date:** ${new Date().toISOString()}`);
  lines.push(`- **Target:** ${process.env.RUNORY_API_BASE ?? "http://localhost:3000"}`);
  lines.push(`- **Result:** ${allPassed ? "PASS" : "FAIL"} (${totalPassed}/${totalScenarios} scenarios passed)`);
  lines.push("");

  lines.push("## Scenario Summary");
  lines.push("");
  lines.push("| Scenario | Name | Result | Checks | Duration |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of results) {
    const status = r.exitCode === 0 ? "✅ PASS" : "❌ FAIL";
    const checks = `${r.passed} passed, ${r.failed} failed`;
    lines.push(
      `| ${r.id} | ${r.name} | ${status} | ${checks} | ${r.duration}ms |`
    );
  }
  lines.push("");

  for (const r of results) {
    lines.push(`## Scenario ${r.id} — ${r.name}`);
    lines.push("");
    lines.push(`> ${r.description}`);
    lines.push("");
    lines.push(`- **Status:** ${r.exitCode === 0 ? "PASS" : "FAIL"}`);
    lines.push(`- **Exit code:** ${r.exitCode}`);
    lines.push(`- **Checks:** ${r.passed} passed, ${r.failed} failed`);
    lines.push(`- **Duration:** ${r.duration}ms`);
    lines.push("");

    // Include the scenario output as evidence
    lines.push("<details>");
    lines.push("<summary>Evidence (scenario output)</summary>");
    lines.push("");
    lines.push("```");
    lines.push(r.stdout.trim());
    if (r.stderr.trim()) {
      lines.push("");
      lines.push("[stderr]");
      lines.push(r.stderr.trim());
    }
    lines.push("```");
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  lines.push("## Notes");
  lines.push("");
  lines.push("- Scenario A: Member invitation is a manual step (requires email delivery).");
  lines.push("- Scenario C: SDK build, Beta/Stable promotion, and actual upgrade require human approval.");
  lines.push("- Scenario D: Broken manifest creation and rollout pause require active Beta rollout.");
  lines.push("- Scenario E: Backup-restore drill (OPS-04) is a manual operations prerequisite.");
  lines.push("");

  // Write report
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, lines.join("\n"));

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Report written to: ${REPORT_PATH}`);
  console.log(`Overall: ${allPassed ? "PASS" : "FAIL"} (${totalPassed}/${totalScenarios} scenarios)`);
  console.log(`${"─".repeat(60)}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E runner crashed:", e);
  process.exit(1);
});
