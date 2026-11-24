// One independent scheduler calls the existing leased workflow coordinator.
// Health is an ephemeral local receipt, never a separate business-state writer.
import { setTimeout as delay } from "node:timers/promises";
import { readFile, rename, writeFile } from "node:fs/promises";

const receiptPath = "/tmp/runory-scheduler-health.json";
const operation = "independent-scheduler";
if (process.argv.includes("--health")) {
  try {
    const result = JSON.parse(await readFile(receiptPath, "utf8"));
    if (!["PASS", "SKIPPED_LEASE"].includes(result.status) ||
        !Number.isFinite(result.checkedAt) || Date.now() - result.checkedAt > 180_000 ||
        result.checkedAt > Date.now()) throw new Error("stale or failed receipt");
    console.log(JSON.stringify({ operation, status: result.status, checkedAt: new Date(result.checkedAt).toISOString(),
      overdueFired: result.overdueFired, slaWarningsSent: result.slaWarningsSent, outbox: result.outbox }));
  } catch {
    console.error(JSON.stringify({ operation, status: "FAIL", reason: "missing_stale_or_failed_receipt" }));
    process.exitCode = 1;
  }
} else {
  const secret = process.env.PLATFORM_CRON_SECRET;
  if (!secret || secret.length < 32) {
    console.error(JSON.stringify({ operation, status: "FAIL", reason: "missing_or_short_secret" }));
    process.exit(1);
  }
  const once = process.argv.includes("--once");
  const endpoint = "http://runory:3000/api/platform/cron/workflow-timers";
  const outboxEndpoint = "http://runory:3000/api/platform/cron/outbox";
  async function tick() {
    let result;
    try {
      const response = await fetch(endpoint, {
        headers: { "x-cron-secret": secret }, redirect: "error",
        signal: AbortSignal.timeout(65_000),
      });
      if (!response.ok) result = { status: "FAIL", httpStatus: response.status };
      else {
        const body = await response.json();
        const data = body.data;
        if (body.success !== true || typeof data?.acquired !== "boolean" ||
            !Number.isSafeInteger(data.overdueFired) || !Number.isSafeInteger(data.slaWarningsSent)) {
          result = { status: "FAIL", reason: "unexpected_result" };
        } else result = { status: data.acquired ? "PASS" : "SKIPPED_LEASE",
          overdueFired: data.overdueFired, slaWarningsSent: data.slaWarningsSent };
      }
    } catch { result = { status: "FAIL", reason: "transport" }; }
    if (result.status !== "FAIL") {
      try {
        const response = await fetch(outboxEndpoint, {
          method: "POST", headers: { "x-cron-secret": secret, "X-Requested-With": "XMLHttpRequest" },
          redirect: "error", signal: AbortSignal.timeout(35_000),
        });
        if (!response.ok) result = { ...result, status: "FAIL", reason: "outbox_http_failure", httpStatus: response.status };
        else {
          const body = await response.json();
          const outbox = body.data;
          if (body.success !== true || !["disabled", "unconfigured", "enabled"].includes(outbox?.mode) ||
              !["attempted","accepted","failed","skipped","emailOutstanding","reviewRequired","otherOutstanding","deadLetter"]
                .every(key => Number.isSafeInteger(outbox[key]) && outbox[key] >= 0)) {
            result = { ...result, status: "FAIL", reason: "invalid_outbox_receipt" };
          } else result = { ...result, outbox };
        }
      } catch { result = { ...result, status: "FAIL", reason: "outbox_transport_failure" }; }
    }
    const receipt = { operation, ...result, checkedAt: Date.now() };
    try {
      await writeFile(receiptPath + ".next", JSON.stringify(receipt), { mode: 0o600 });
      await rename(receiptPath + ".next", receiptPath);
    } catch {
      console.error(JSON.stringify({ operation, status: "FAIL", reason: "receipt_write_failed" }));
      return false;
    }
    console.log(JSON.stringify(receipt));
    return result.status !== "FAIL";
  }
  do {
    const start = Date.now();
    const ok = await tick();
    if (once) { process.exitCode = ok ? 0 : 1; break; }
    await delay(Math.max(1_000, 60_000 - (Date.now() - start)));
  } while (true);
}
