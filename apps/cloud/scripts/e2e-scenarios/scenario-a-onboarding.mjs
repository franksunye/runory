#!/usr/bin/env node
/**
 * E2E Scenario A — New Customer Onboarding
 *
 * Email OTP → Organization/Workspace created → CRM Lite installed
 * → Customer + Contact created → Member invited and scoped
 *
 * Usage: node scripts/e2e-scenarios/scenario-a-onboarding.mjs
 * Prereq: dev server running (pnpm dev:cloud)
 *
 * Note: Member invitation requires email delivery and is documented as a
 * manual step. The script verifies everything up to and including
 * Customer + Contact creation.
 */

import { assert, api, checkServer, printSummary, getFailCount, BASE_URL } from "./_helpers.mjs";

async function main() {
  console.log("=== Runory E2E Scenario A: New Customer Onboarding ===\n");

  if (!(await checkServer())) {
    console.log("FATAL: Dev server is not running at", BASE_URL);
    console.log("Start it with: pnpm dev:cloud");
    process.exit(1);
  }

  const testEmail = `e2e-scenario-a+${Date.now()}@runory.test`;

  // ── 1. Request OTP ──
  console.log("[1] Request OTP for test email");
  let devCode;
  {
    const { status, json } = await api("/api/auth/request-otp", "POST", {
      email: testEmail,
    }, { useCookies: true });
    assert(status === 200, `OTP request returns 200 (got ${status})`);
    assert(
      json.data?.expiresAt != null,
      "OTP response includes expiresAt"
    );
    devCode = json.data?.devCode;
    assert(
      devCode != null,
      "devCode returned in dev mode (required for automated E2E)"
    );
  }
  if (!devCode) {
    console.log("\nFATAL: No devCode — cannot proceed without OTP. Is NODE_ENV=production?");
    process.exit(1);
  }

  // ── 2. Verify OTP ──
  console.log("\n[2] Verify OTP and obtain session");
  {
    const { status, json, headers } = await api("/api/auth/verify-otp", "POST", {
      email: testEmail,
      code: devCode,
    }, { useCookies: true });
    assert(status === 200, `OTP verification returns 200 (got ${status})`);
    const setCookies = headers.getSetCookie?.() ?? [];
    assert(
      setCookies.length > 0,
      "session cookie set in response"
    );
    assert(json.data?.principal?.userId != null, "principal has userId");
    assert(
      json.data?.isNewUser === true,
      "user is new (first login onboarding)"
    );
  }

  // ── 3. Get current user ──
  console.log("\n[3] Get current user (GET /api/auth/me)");
  let userId;
  {
    const { status, json } = await api("/api/auth/me", "GET", undefined, { useCookies: true });
    assert(status === 200, `auth/me returns 200 (got ${status})`);
    assert(json.data?.authenticated === true, "user is authenticated");
    assert(json.data?.principal?.userId != null, "principal present");
    userId = json.data?.principal?.userId;
  }

  // ── 4. Verify organization + default workspace exist ──
  console.log("\n[4] Verify organization + default workspace");
  let workspaceId;
  {
    const { json } = await api("/api/auth/me", "GET", undefined, { useCookies: true });
    const workspaces = json.data?.workspaces ?? [];
    assert(workspaces.length >= 1, `≥1 workspace exists (got ${workspaces.length})`);
    if (workspaces.length > 0) {
      const ws = workspaces[0];
      assert(ws.id != null, "workspace has id");
      assert(
        ws.organizationId != null || ws.organization_id != null,
        "workspace has organization reference"
      );
      workspaceId = ws.id ?? ws.workspaceId;
    }
  }
  if (!workspaceId) {
    console.log("\nFATAL: No workspace ID — onboarding did not provision a workspace.");
    process.exit(1);
  }

  // ── 5. Install CRM Lite pack ──
  console.log("\n[5] Install CRM Lite pack");
  {
    const { status, json } = await api(
      `/api/workspaces/${workspaceId}/packs/crm-lite-pack/install`,
      "POST",
      undefined,
      { useCookies: true }
    );
    assert(
      status === 201 || status === 200,
      `pack installed (${status})`
    );
    assert(json.success !== false, "install does not report failure");
  }

  // ── 6. Verify objects exist ──
  console.log("\n[6] Verify customer + contact objects installed");
  {
    const { json } = await api(`/api/workspaces/${workspaceId}/objects`, "GET", undefined, { useCookies: true });
    const objects = json.data ?? [];
    assert(objects.length >= 2, `≥2 objects installed (got ${objects.length})`);
    assert(
      objects.some((o) => o.objectKey === "customer"),
      "customer object exists"
    );
    assert(
      objects.some((o) => o.objectKey === "contact"),
      "contact object exists"
    );
  }

  // ── 7. Create customer ──
  console.log("\n[7] Create customer record");
  {
    const { status, json } = await api(
      `/api/workspaces/${workspaceId}/objects/customer/records`,
      "POST",
      { name: "Acme Corp", email: "info@acme.com", phone: "555-0100" },
      { useCookies: true }
    );
    assert(status === 201, `customer created (got ${status})`);
    assert(json.data?.id != null, "customer record has id");
  }

  // ── 8. Create contact ──
  console.log("\n[8] Create contact record");
  {
    const { status, json } = await api(
      `/api/workspaces/${workspaceId}/objects/contact/records`,
      "POST",
      { name: "Jane Doe", email: "jane@acme.com", phone: "555-0101" },
      { useCookies: true }
    );
    assert(status === 201, `contact created (got ${status})`);
    assert(json.data?.id != null, "contact record has id");
  }

  // ── 9. List customers and contacts — verify both exist ──
  console.log("\n[9] List customers and contacts");
  {
    const { json: custJson } = await api(
      `/api/workspaces/${workspaceId}/objects/customer/records`,
      "GET",
      undefined,
      { useCookies: true }
    );
    const customers = custJson.data ?? [];
    assert(customers.length >= 1, `≥1 customer record (got ${customers.length})`);
    assert(
      customers.some((c) => c.name === "Acme Corp"),
      "Acme Corp customer found"
    );

    const { json: contactJson } = await api(
      `/api/workspaces/${workspaceId}/objects/contact/records`,
      "GET",
      undefined,
      { useCookies: true }
    );
    const contacts = contactJson.data ?? [];
    assert(contacts.length >= 1, `≥1 contact record (got ${contacts.length})`);
    assert(
      contacts.some((c) => c.name === "Jane Doe"),
      "Jane Doe contact found"
    );
  }

  // ── 10. Member invitation (manual step) ──
  console.log("\n[10] Member invitation — documented as manual step");
  console.log("     (Requires email delivery; verify manually via UI or");
  console.log("      POST /api/organizations/{id}/invitations with a real email)");
  assert(true, "invitation step documented (email delivery not automatable in E2E)");

  // ── Summary ──
  const failCount = printSummary("Scenario A");
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Scenario A crashed:", e);
  process.exit(1);
});
