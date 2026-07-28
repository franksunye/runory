import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  commandActorTypeSchema,
  customerAccessCapabilitySchema,
  customerAccessGrantSchema,
  customerAccessGrantStatusSchema,
  customerAccessIssueInputSchema,
  customerAccessRootObjectTypeSchema,
  customerAccessSubjectTypeSchema,
  customerAccessContextDtoSchema,
} from "@runory/contracts";
import { loadPlatformServiceContractManifest } from "./platform-service-contracts";
import { loadModuleManifest } from "./installer";
import {
  generateAccessToken,
  hashAccessToken,
  validateCapabilities,
  validateExpiry,
} from "./customer-access-commands";
import {
  CUSTOMER_ACCESS_COOKIE_NAME,
  createCustomerAccessSession,
  verifyCustomerAccessSession,
  customerAccessCookieOptions,
  rateLimitFingerprint,
  CUSTOMER_ACCESS_RESPONSE_HEADERS,
} from "./customer-access-session";

// ── Platform Service Manifest ──

describe("Customer Access Platform Service manifest", () => {
  it("loads and validates against the platform service contract schema", () => {
    const manifest = loadPlatformServiceContractManifest("runory.customer-access");
    expect(manifest.id).toBe("runory.customer-access");
    expect(manifest.name).toBe("Customer Access");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.permissions).toEqual([
      "customer_access.read",
      "customer_access.manage",
    ]);
  });

  it("declares the customer_access_grant aggregate with correct states", () => {
    const manifest = loadPlatformServiceContractManifest("runory.customer-access");
    const aggregate = manifest.domain.aggregates[0];
    expect(aggregate.key).toBe("customer_access_grant");
    expect(aggregate.stateField).toBe("status");
    expect(aggregate.versionField).toBe("aggregate_version");
    expect(aggregate.states).toEqual(["active", "revoked", "expired"]);
  });

  it("declares issue and revoke commands with correct contracts", () => {
    const manifest = loadPlatformServiceContractManifest("runory.customer-access");
    const commands = manifest.domain.commands;
    expect(commands).toHaveLength(2);

    const issue = commands.find((c) => c.key === "customer_access.issue");
    expect(issue).toBeDefined();
    expect(issue!.operation).toBe("create");
    expect(issue!.allowedActorTypes).toEqual(["user", "api_key", "system", "agent"]);
    expect(issue!.permission).toBe("customer_access.manage");
    expect(issue!.requiresExpectedVersion).toBe(false);
    expect(issue!.emits).toEqual(["customer_access.issued"]);

    const revoke = commands.find((c) => c.key === "customer_access.revoke");
    expect(revoke).toBeDefined();
    expect(revoke!.operation).toBe("transition");
    expect(revoke!.transition).toEqual({ from: ["active"], to: "revoked" });
    expect(revoke!.allowedActorTypes).toEqual(["user", "api_key", "system", "agent"]);
    expect(revoke!.permission).toBe("customer_access.manage");
    expect(revoke!.requiresExpectedVersion).toBe(true);
    expect(revoke!.emits).toEqual(["customer_access.revoked"]);
  });
});

// ── Capability Enum ──

describe("Customer Access capability enum", () => {
  it("accepts all valid capabilities from the closed enum", () => {
    const valid = [
      "quote.view",
      "quote.accept",
      "work_order.view_status",
      "service_report.view",
      "invoice.view",
      "invoice.pay",
      "payment.view_status",
    ];
    for (const cap of valid) {
      expect(customerAccessCapabilitySchema.safeParse(cap).success).toBe(true);
    }
  });

  it("rejects unknown capabilities", () => {
    expect(customerAccessCapabilitySchema.safeParse("quote.delete").success).toBe(false);
    expect(customerAccessCapabilitySchema.safeParse("admin.access").success).toBe(false);
    expect(customerAccessCapabilitySchema.safeParse("").success).toBe(false);
  });
});

// ── Subject and Root Object Types ──

describe("Customer Access subject and root object types", () => {
  it("accepts contact and company subject types", () => {
    expect(customerAccessSubjectTypeSchema.safeParse("contact").success).toBe(true);
    expect(customerAccessSubjectTypeSchema.safeParse("company").success).toBe(true);
    expect(customerAccessSubjectTypeSchema.safeParse("user").success).toBe(false);
  });

  it("accepts quote and work_order root object types", () => {
    expect(customerAccessRootObjectTypeSchema.safeParse("quote").success).toBe(true);
    expect(customerAccessRootObjectTypeSchema.safeParse("work_order").success).toBe(true);
    expect(customerAccessRootObjectTypeSchema.safeParse("invoice").success).toBe(false);
  });
});

// ── Grant Status ──

describe("Customer Access grant status", () => {
  it("accepts active, revoked, and expired", () => {
    for (const status of ["active", "revoked", "expired"]) {
      expect(customerAccessGrantStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects unknown statuses", () => {
    expect(customerAccessGrantStatusSchema.safeParse("pending").success).toBe(false);
    expect(customerAccessGrantStatusSchema.safeParse("suspended").success).toBe(false);
  });
});

// ── Issue Input Validation ──

describe("Customer Access issue input schema", () => {
  it("accepts a valid issue input", () => {
    const input = {
      subjectType: "contact",
      subjectId: "ctc_123",
      rootObjectType: "quote",
      rootRecordId: "qt_456",
      capabilities: ["quote.view", "quote.accept"],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(customerAccessIssueInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects empty capabilities", () => {
    const input = {
      subjectType: "contact",
      subjectId: "ctc_123",
      rootObjectType: "quote",
      rootRecordId: "qt_456",
      capabilities: [],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(customerAccessIssueInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects empty subjectId or rootRecordId", () => {
    const input = {
      subjectType: "contact",
      subjectId: "",
      rootObjectType: "quote",
      rootRecordId: "",
      capabilities: ["quote.view"],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(customerAccessIssueInputSchema.safeParse(input).success).toBe(false);
  });
});

// ── Token Utilities ──

describe("Customer Access token utilities", () => {
  it("generates a 32-byte base64url token (43 characters)", () => {
    const token = generateAccessToken();
    expect(token).toHaveLength(43); // 32 bytes → 43 base64url chars (no padding)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateAccessToken()));
    expect(tokens.size).toBe(100);
  });

  it("hashes tokens deterministically with SHA-256", () => {
    const token = "test-token-value";
    const hash1 = hashAccessToken(token);
    const hash2 = hashAccessToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex digest
  });

  it("produces different hashes for different tokens", () => {
    expect(hashAccessToken("token-a")).not.toBe(hashAccessToken("token-b"));
  });
});

// ── Capability Validation ──

describe("Customer Access capability validation", () => {
  it("accepts quote capabilities for quote root", () => {
    const result = validateCapabilities(
      ["quote.view", "quote.accept", "work_order.view_status", "invoice.view", "invoice.pay", "payment.view_status"],
      "quote",
    );
    expect(result).toEqual([
      "quote.view",
      "quote.accept",
      "work_order.view_status",
      "invoice.view",
      "invoice.pay",
      "payment.view_status",
    ]);
  });

  it("accepts work_order capabilities for work_order root", () => {
    const result = validateCapabilities(
      ["work_order.view_status", "service_report.view", "invoice.view", "invoice.pay", "payment.view_status"],
      "work_order",
    );
    expect(result).toHaveLength(5);
  });

  it("allows work_order.view_status for quote root (quote→work_order journey)", () => {
    // Per v0.8 Batch 3: a quote-rooted grant needs work_order.view_status
    // because the context resolver follows quote.work_order_id after conversion.
    const result = validateCapabilities(["work_order.view_status"], "quote");
    expect(result).toEqual(["work_order.view_status"]);
  });

  it("rejects quote capabilities for work_order root", () => {
    expect(() => validateCapabilities(["quote.view"], "work_order")).toThrow();
    expect(() => validateCapabilities(["quote.accept"], "work_order")).toThrow();
  });

  it("rejects unknown capabilities", () => {
    expect(() => validateCapabilities(["quote.delete" as never], "quote")).toThrow();
  });
});

// ── Expiry Validation ──

describe("Customer Access expiry validation", () => {
  it("accepts a future date within 30 days", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => validateExpiry(future)).not.toThrow();
  });

  it("rejects a past date", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(() => validateExpiry(past)).toThrow();
  });

  it("rejects a date more than 30 days in the future", () => {
    const tooFar = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => validateExpiry(tooFar)).toThrow();
  });

  it("rejects an invalid date string", () => {
    expect(() => validateExpiry("not-a-date")).toThrow();
  });
});

// ── Grant Schema ──

describe("Customer Access grant schema", () => {
  it("accepts a valid grant record", () => {
    const grant = {
      id: "cag_123",
      workspaceId: "ws_456",
      subjectType: "contact",
      subjectId: "ctc_789",
      rootObjectType: "quote",
      rootRecordId: "qt_abc",
      capabilities: ["quote.view", "quote.accept"],
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      firstAccessedAt: null,
      lastAccessedAt: null,
      revokedAt: null,
      revokedBy: null,
      createdBy: "usr_123",
      status: "active",
      aggregateVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(customerAccessGrantSchema.safeParse(grant).success).toBe(true);
  });

  it("rejects a grant with invalid subject type", () => {
    const grant = {
      id: "cag_123",
      workspaceId: "ws_456",
      subjectType: "user",
      subjectId: "ctc_789",
      rootObjectType: "quote",
      rootRecordId: "qt_abc",
      capabilities: ["quote.view"],
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      firstAccessedAt: null,
      lastAccessedAt: null,
      revokedAt: null,
      revokedBy: null,
      createdBy: "usr_123",
      status: "active",
      aggregateVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(customerAccessGrantSchema.safeParse(grant).success).toBe(false);
  });
});

// ── Context DTO Schema ──

describe("Customer Access context DTO schema", () => {
  it("accepts a valid context with quote and available actions", () => {
    const ctx = {
      grant: {
        id: "cag_123",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        capabilities: ["quote.view", "quote.accept"],
      },
      workspace: { name: "Acme Repair" },
      customer: { displayName: "John Doe" },
      quote: {
        id: "qt_1",
        quoteNumber: "Q-001",
        title: "Repair Quote",
        status: "sent",
        currency: "USD",
        subtotal: 100,
        discountTotal: 0,
        taxTotal: 10,
        grandTotal: 110,
        validUntil: null,
        terms: null,
        revisionNumber: 0,
        acceptedAt: null,
        lines: [],
      },
      serviceReports: [],
      availableActions: ["quote.accept"],
    };
    expect(customerAccessContextDtoSchema.safeParse(ctx).success).toBe(true);
  });

  it("accepts a context with invoice and payment", () => {
    const ctx = {
      grant: {
        id: "cag_123",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        capabilities: ["invoice.view", "invoice.pay"],
      },
      workspace: { name: "Acme Repair" },
      customer: { displayName: "John Doe" },
      serviceReports: [],
      invoice: {
        id: "inv_1",
        invoiceNumber: "INV-001",
        status: "issued",
        currency: "USD",
        totalMinor: 11000,
        amountPaidMinor: 0,
        balanceDueMinor: 11000,
        issuedAt: new Date().toISOString(),
        dueAt: null,
        paidAt: null,
        memo: null,
        lines: [],
      },
      payment: {
        requestStatus: "open",
        paymentStatus: null,
        amountMinor: 11000,
        refundedAmountMinor: 0,
        currency: "USD",
      },
      availableActions: ["invoice.pay"],
    };
    expect(customerAccessContextDtoSchema.safeParse(ctx).success).toBe(true);
  });

  it("rejects invalid availableActions", () => {
    const ctx = {
      grant: { id: "cag_1", expiresAt: "2026-12-31", capabilities: [] },
      workspace: { name: "Acme" },
      customer: { displayName: "John" },
      serviceReports: [],
      availableActions: ["quote.delete"],
    };
    expect(customerAccessContextDtoSchema.safeParse(ctx).success).toBe(false);
  });
});

// ── Customer Command Authorization (Tech Spec §7) ──

describe("Customer Command actor type and contract admissibility", () => {
  it("commandActorTypeSchema includes 'customer'", () => {
    const values = commandActorTypeSchema.options;
    expect(values).toContain("customer");
    expect(values).toEqual(["user", "api_key", "system", "agent", "customer"]);
  });

  it("quote.accept contract allows customer actors", () => {
    const manifest = loadModuleManifest("runory.quote");
    const cmd = manifest.domain?.commands.find((c) => c.key === "quote.accept");
    expect(cmd).toBeDefined();
    expect(cmd!.allowedActorTypes).toContain("customer");
  });

  it("payment.request contract allows customer actors", () => {
    const manifest = loadModuleManifest("runory.payment");
    const cmd = manifest.domain?.commands.find((c) => c.key === "payment.request");
    expect(cmd).toBeDefined();
    expect(cmd!.allowedActorTypes).toContain("customer");
  });

  it("only quote.accept and payment.request admit customer among all module commands", () => {
    const moduleIds = [
      "runory.quote", "runory.payment", "runory.invoice", "runory.work-order",
      "runory.contact", "runory.company", "runory.schedule", "runory.form",
      "runory.workflow", "runory.automation", "runory.fsm",
    ];
    const customerAdmissible: string[] = [];
    for (const id of moduleIds) {
      let manifest;
      try { manifest = loadModuleManifest(id); } catch { continue; }
      if (manifest.status === "retired") continue;
      for (const cmd of manifest.domain?.commands ?? []) {
        if (cmd.allowedActorTypes.includes("customer" as never)) {
          customerAdmissible.push(cmd.key);
        }
      }
    }
    expect(customerAdmissible.sort()).toEqual(["payment.request", "quote.accept"]);
  });

  it("no platform service command other than customer_access allows customer actors", () => {
    const manifest = loadPlatformServiceContractManifest("runory.customer-access");
    for (const cmd of manifest.domain.commands) {
      expect(cmd.allowedActorTypes).not.toContain("customer" as never);
    }
  });
});

// ── Session Cookie (Tech Spec §6.2) ──

describe("Customer Access session cookie", () => {
  // Use a test secret so the session functions work without env config
  const originalSecret = process.env.CUSTOMER_ACCESS_SESSION_SECRET;
  beforeAll(() => {
    process.env.CUSTOMER_ACCESS_SESSION_SECRET = "test-secret-at-least-32-characters-long-for-testing";
  });
  afterAll(() => {
    if (originalSecret) process.env.CUSTOMER_ACCESS_SESSION_SECRET = originalSecret;
    else delete process.env.CUSTOMER_ACCESS_SESSION_SECRET;
  });

  const mockGrant = {
    id: "cag_test",
    workspace_id: "ws_test",
    subject_type: "contact" as const,
    subject_id: "ctc_test",
    root_object_type: "quote" as const,
    root_record_id: "qt_test",
    capabilities_json: JSON.stringify(["quote.view", "quote.accept"]),
    token_hash: "a".repeat(64),
    status: "active" as const,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    first_accessed_at: null,
    last_accessed_at: null,
    revoked_at: null,
    revoked_by: null,
    created_by: "usr_test",
    aggregate_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("creates and verifies a signed session cookie", () => {
    const cookie = createCustomerAccessSession(mockGrant);
    expect(cookie).toContain(".");
    const payload = verifyCustomerAccessSession(cookie);
    expect(payload).not.toBeNull();
    expect(payload!.grantId).toBe("cag_test");
    expect(payload!.workspaceId).toBe("ws_test");
    expect(payload!.expiresAt).toBe(mockGrant.expires_at);
  });

  it("rejects a tampered cookie signature", () => {
    const cookie = createCustomerAccessSession(mockGrant);
    const parts = cookie.split(".");
    const tampered = `${parts[0]}.invalidSignature`;
    expect(verifyCustomerAccessSession(tampered)).toBeNull();
  });

  it("rejects a malformed cookie", () => {
    expect(verifyCustomerAccessSession("not-a-valid-cookie")).toBeNull();
    expect(verifyCustomerAccessSession("")).toBeNull();
  });

  it("cookie name is 'runory_customer_access'", () => {
    expect(CUSTOMER_ACCESS_COOKIE_NAME).toBe("runory_customer_access");
  });

  it("cookie options are HttpOnly, SameSite=Lax, Path=/", () => {
    const opts = customerAccessCookieOptions(mockGrant.expires_at);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBeGreaterThan(0);
  });

  it("expired cookie options have maxAge=0", () => {
    const opts = customerAccessCookieOptions(new Date(Date.now() - 1000).toISOString());
    expect(opts.maxAge).toBe(0);
  });
});

// ── Rate Limit Fingerprint (Tech Spec §6.3) ──

describe("Customer Access rate limit fingerprint", () => {
  it("produces a deterministic 32-char hex fingerprint", () => {
    const fp = rateLimitFingerprint("192.168.1.1", "cag_test");
    expect(fp).toHaveLength(32);
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces different fingerprints for different inputs", () => {
    const fp1 = rateLimitFingerprint("192.168.1.1", "cag_a");
    const fp2 = rateLimitFingerprint("192.168.1.2", "cag_a");
    const fp3 = rateLimitFingerprint("192.168.1.1", "cag_b");
    expect(fp1).not.toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });
});

// ── Protected Response Headers (Tech Spec §6.3) ──

describe("Customer Access protected response headers", () => {
  it("includes Cache-Control, Referrer-Policy, and X-Robots-Tag", () => {
    expect(CUSTOMER_ACCESS_RESPONSE_HEADERS["Cache-Control"]).toBe("private, no-store");
    expect(CUSTOMER_ACCESS_RESPONSE_HEADERS["Referrer-Policy"]).toBe("no-referrer");
    expect(CUSTOMER_ACCESS_RESPONSE_HEADERS["X-Robots-Tag"]).toBe("noindex, nofollow");
  });
});
