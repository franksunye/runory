import { setImmediate } from "node:timers/promises";
import { afterEach } from "vitest";

// Local libSQL resolves synchronous SQLite work through promises. Long runs of
// migration/Pack fixtures can otherwise keep the worker in its microtask queue,
// starving Vitest's IPC acknowledgements even when every assertion succeeds.
// Yield between cases; keep the normal RPC timeouts and unhandled-error checks.
afterEach(async () => {
  await setImmediate();
});
