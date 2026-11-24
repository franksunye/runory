import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProfile } from "./preflight.mjs";

const good = {
  NODE_ENV: "production", PLATFORM_DEPLOYMENT_MODE: "local",
  PLATFORM_DEV_BOOTSTRAP: "false", PLATFORM_OTP_RETURN_DEV_CODE: "false",
  PLATFORM_TRUST_IDENTITY_HEADERS: "false",
  LIBSQL_URL: "file:/data/platform.db", RUNORY_ATTACHMENT_STORAGE: "local",
  RUNORY_LOCAL_UPLOADS_DIR: "/data/uploads", RUNORY_RELEASE_COMMIT: "a".repeat(40),
  PLATFORM_ADMIN_EMAILS: "owner@example.invalid",
  PLATFORM_MAIL_PROVIDER_URL: "http://mail-fixture:8787/send",
  PLATFORM_CRON_SECRET: "a".repeat(64), CUSTOMER_ACCESS_SESSION_SECRET: "b".repeat(64),
};

test("candidate profile accepts the bounded independent production configuration", () => {
  assert.deepEqual(validateProfile(good), []);
  assert.deepEqual(validateProfile({ ...good, RUNORY_SELF_HOST_CANDIDATE: "1", RUNORY_SELF_HOST_MAIL_MODE: "operator", PLATFORM_MAIL_PROVIDER_URL: "" }), []);
});
test("candidate profile rejects unsafe deployment and credential configuration without printing values", () => {
  for (const [overrides, expected] of [
    [{ NODE_ENV: "development" }, "production_runtime_required"],
    [{ VERCEL_ENV: "production" }, "independent_local_runtime_required"],
    [{ PLATFORM_DEPLOYMENT_MODE: "cloud" }, "independent_local_runtime_required"],
    [{ PLATFORM_DEV_BOOTSTRAP: "true" }, "unsafe_identity_configuration"],
    [{ PLATFORM_TRUST_IDENTITY_HEADERS: "true" }, "unsafe_identity_configuration"],
    [{ LIBSQL_URL: "libsql://external.invalid", LIBSQL_AUTH_TOKEN: "SYNTHETIC_SECRET" }, "local_persistent_database_required"],
    [{ RUNORY_ATTACHMENT_STORAGE: "vercel-blob" }, "local_persistent_attachment_storage_required"],
    [{ RUNORY_RELEASE_COMMIT: "" }, "source_commit_required"],
    [{ PLATFORM_ADMIN_EMAILS: "a@example.invalid,b@example.invalid" }, "single_owner_email_required"],
    [{ PLATFORM_MAIL_PROVIDER_URL: "https://user:SYNTHETIC_SECRET@example.invalid" }, "owner_controlled_mail_endpoint_required"],
    [{ RUNORY_SELF_HOST_MAIL_MODE: "operator" }, "invalid_operator_delivery_configuration"],
    [{ RUNORY_SELF_HOST_MAIL_MODE: "other" }, "invalid_mail_delivery_mode"],
    [{ PLATFORM_CRON_SECRET: "short" }, "distinct_runtime_secrets_required"],
    [{ CUSTOMER_ACCESS_SESSION_SECRET: good.PLATFORM_CRON_SECRET }, "distinct_runtime_secrets_required"],
  ]) {
    const issues = validateProfile({ ...good, ...overrides });
    assert.ok(issues.includes(expected), expected);
    assert.ok(!JSON.stringify(issues).includes("SYNTHETIC_SECRET"));
  }
});
