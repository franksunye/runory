import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function getRunoryHome() {
  const dir = process.env.RUNORY_HOME ?? join(homedir(), ".runory");
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "data"), { recursive: true });
  mkdirSync(join(dir, "logs"), { recursive: true });
  return dir;
}

export function getDatabasePath() {
  return process.env.RUNORY_DB_PATH ?? join(getRunoryHome(), "data", "runory.db");
}
