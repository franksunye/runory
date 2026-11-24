// B1: validate the narrow independent deployment profile before opening the
// application server. No authentication, database mutation or secret output.
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateProfile(env) {
  const issues = [];
  if (env.NODE_ENV !== "production") issues.push("production_runtime_required");
  if (env.PLATFORM_DEPLOYMENT_MODE !== "local" || env.VERCEL === "1" || env.VERCEL_ENV)
    issues.push("independent_local_runtime_required");
  if (env.PLATFORM_DEV_BOOTSTRAP !== "false" || env.PLATFORM_OTP_RETURN_DEV_CODE !== "false"
    || env.PLATFORM_TRUST_IDENTITY_HEADERS !== "false" || env.PLATFORM_TRUST_PROXY_VERIFIED === "true")
    issues.push("unsafe_identity_configuration");
  if (env.LIBSQL_URL !== "file:/data/platform.db" || env.LIBSQL_AUTH_TOKEN)
    issues.push("local_persistent_database_required");
  if (env.RUNORY_ATTACHMENT_STORAGE !== "local" || env.RUNORY_LOCAL_UPLOADS_DIR !== "/data/uploads")
    issues.push("local_persistent_attachment_storage_required");
  if (!/^[a-f0-9]{40}$/.test(env.RUNORY_RELEASE_COMMIT ?? ""))
    issues.push("source_commit_required");
  if (!/^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(env.PLATFORM_ADMIN_EMAILS ?? ""))
    issues.push("single_owner_email_required");
  try {
    const url = new URL(env.PLATFORM_MAIL_PROVIDER_URL ?? "");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash)
      issues.push("owner_controlled_mail_endpoint_required");
  } catch {
    issues.push("owner_controlled_mail_endpoint_required");
  }
  const cron = env.PLATFORM_CRON_SECRET ?? "";
  const customer = env.CUSTOMER_ACCESS_SESSION_SECRET ?? "";
  if (cron.length < 32 || customer.length < 32 || cron === customer)
    issues.push("distinct_runtime_secrets_required");
  return issues;
}

async function main() {
  const issues = validateProfile(process.env);
  if (issues.length === 0) {
    try {
      await access("/data", constants.R_OK | constants.W_OK | constants.X_OK);
      await mkdir("/data/uploads", { recursive: true, mode: 0o700 });
      await access("/data/uploads", constants.R_OK | constants.W_OK | constants.X_OK);
    } catch {
      issues.push("persistent_volume_not_writable");
    }
  }
  // This is configuration preflight, not application readiness or a release gate.
  console.log(JSON.stringify({ operation: "self-host-preflight", status: issues.length ? "FAIL" : "PASS", issues }));
  if (issues.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
