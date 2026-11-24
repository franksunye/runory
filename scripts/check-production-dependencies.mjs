#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync("corepack", ["pnpm", "audit", "--prod", "--json"], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
});
if (result.error || !result.stdout.trim()) {
  throw new Error(`Dependency audit could not run: ${result.error?.message ?? result.stderr}`);
}
let audit;
try { audit = JSON.parse(result.stdout); } catch { throw new Error("Dependency audit returned invalid JSON"); }
if (audit.error || !audit.metadata || !audit.advisories) throw new Error("Dependency audit did not return complete results");

const blocked = [];
const reviewed = [];
for (const advisory of Object.values(audit.advisories)) {
  // The registry advisory currently says <=6.4.0, but the maintainer shipped
  // the same fix on 5.x. This is NOT a blanket GHSA suppression: only the
  // exact reviewed backport version qualifies; any downgrade still fails.
  // https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579
  // https://github.com/maplibre/maplibre-gl-js/releases/tag/v5.24.1
  const reviewedMapLibreBackport = advisory.url?.endsWith("GHSA-jrc7-96c5-q579")
    && advisory.module_name === "maplibre-gl"
    && advisory.findings?.length > 0
    && advisory.findings.every(finding => finding.version === "5.24.1");
  const entry = { package: advisory.module_name, severity: advisory.severity, advisory: advisory.url };
  if (reviewedMapLibreBackport) reviewed.push({ ...entry, reason: "Maintainer-confirmed 5.24.1 security backport" });
  else if (["high", "critical"].includes(advisory.severity)) blocked.push(entry);
}
console.log(JSON.stringify({ vulnerabilities: audit.metadata.vulnerabilities, reviewedMetadataExceptions: reviewed, releaseBlockers: blocked }, null, 2));
if (blocked.length > 0 || ![0, 1].includes(result.status ?? -1)) process.exitCode = 1;
