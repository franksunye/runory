#!/usr/bin/env node
import { ReleaseBackupError, runReleaseBackup } from "./release-backup-gate";

try {
  console.log(JSON.stringify({ operation: "release-database-backup", ...await runReleaseBackup() }));
} catch (error) {
  console.error(JSON.stringify({
    operation: "release-database-backup",
    status: "FAIL",
    stage: error instanceof ReleaseBackupError ? error.stage : "unknown",
    ...(error instanceof ReleaseBackupError && error.objectReference
      ? { objectReference: error.objectReference }
      : {}),
  }));
  process.exitCode = 1;
}
