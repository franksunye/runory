// Self-hosted workflow timer adapter. It calls the existing leased coordinator;
// no second scheduler, direct database access, or alternative business writes.
import { setTimeout as delay } from "node:timers/promises";

const secret = process.env.PLATFORM_CRON_SECRET;
if (!secret || secret.length < 32) {
  console.error(JSON.stringify({ operation: "workflow-timers", status: "FAIL", reason: "missing_or_short_secret" }));
  process.exit(1);
}
const once = process.argv.includes("--once");
const endpoint = "http://runory:3000/api/platform/cron/workflow-timers";

async function tick() {
  try {
    const response = await fetch(endpoint, {
      headers: { "x-cron-secret": secret },
      redirect: "error",
      signal: AbortSignal.timeout(65_000),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ operation: "workflow-timers", status: "FAIL", httpStatus: response.status }));
      return false;
    }
    const body = await response.json();
    if (body.success !== true || typeof body.data?.acquired !== "boolean") {
      console.error(JSON.stringify({ operation: "workflow-timers", status: "FAIL", reason: "unexpected_result" }));
      return false;
    }
    console.log(JSON.stringify({
      operation: "workflow-timers",
      status: body.data.acquired ? "PASS" : "SKIPPED_LEASE",
      overdueFired: body.data.overdueFired,
      slaWarningsSent: body.data.slaWarningsSent,
    }));
    return true;
  } catch {
    // A provider/transport error may contain request headers. Log no raw error.
    console.error(JSON.stringify({ operation: "workflow-timers", status: "FAIL", reason: "transport" }));
    return false;
  }
}

do {
  const start = Date.now();
  const ok = await tick();
  if (once) {
    process.exitCode = ok ? 0 : 1;
    break;
  }
  await delay(Math.max(1_000, 60_000 - (Date.now() - start)));
} while (true);
