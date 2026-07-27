import { describe, expect, it } from "vitest";
import {
  customerAccessCapabilitySchema,
  customerAccessGrantSchema,
  customerAccessGrantStatusSchema,
  customerAccessIssueInputSchema,
  customerAccessRootObjectTypeSchema,
  customerAccessSubjectTypeSchema,
  customerAccessContextDtoSchema,
} from "@runory/contracts";
import { loadPlatformServiceContractManifest } from "./platform-service-contracts";
import {
  generateAccessToken,
  hashAccessToken,
  validateCapabilities,
  validateExpiry,
} from "./customer-access-commands";

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
      ["quote.view", "quote.accept", "invoice.view", "invoice.pay", "payment.view_status"],
      "quote",
    );
    expect(result).toEqual([
      "quote.view",
      "quote.accept",
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

  it("rejects work_order.view_status for quote root", () => {
    expect(() => validateCapabilities(["work_order.view_status"], "quote")).toThrow();
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
