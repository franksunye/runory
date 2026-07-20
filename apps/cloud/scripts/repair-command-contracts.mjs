#!/usr/bin/env node
import {
  inspectAllWorkspaceCommandContractRepairs,
  repairAllWorkspaceCommandContracts,
} from "@runory/platform-core";

const apply = process.argv.slice(2).includes("--apply");
const report = apply
  ? await repairAllWorkspaceCommandContracts()
  : await inspectAllWorkspaceCommandContractRepairs();

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  ...report,
}, null, 2));

if (!apply) {
  console.error(
    "Dry run only. Review blockedWorkspaceCount and workspace details, then rerun with --apply.",
  );
}
