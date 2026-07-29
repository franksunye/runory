/**
 * v0.9.2 PWA Notification — push subscription, preferences, and dispatch tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hashEndpoint,
  toSafeSubscription,
  type PushSubscriptionRecord,
} from "./push-subscriptions";
import {
  isCategoryEnabled,
  type PushPreferencesRecord,
} from "./push-preferences";
import { validatePushRoute, buildPushPayload } from "./web-push-provider";

// ── push-subscriptions ──

describe("hashEndpoint", () => {
  it("produces a stable SHA-256 hex hash", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";
    const hash1 = hashEndpoint(endpoint);
    const hash2 = hashEndpoint(endpoint);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[0-9a-f]+$/);
  });

  it("produces different hashes for different endpoints", () => {
    const h1 = hashEndpoint("https://a.example.com/ep1");
    const h2 = hashEndpoint("https://b.example.com/ep2");
    expect(h1).not.toBe(h2);
  });
});

describe("toSafeSubscription", () => {
  it("strips endpoint, p256dh, auth, and endpointHash from the record", () => {
    const record: PushSubscriptionRecord = {
      id: "push_sub_test",
      workspaceId: "ws_test",
      principalType: "workspace_membership",
      principalId: "mem_test",
      endpointHash: "hash123",
      endpoint: "https://fcm.googleapis.com/sensitive",
      p256dh: "sensitive_key",
      auth: "sensitive_auth",
      userAgentSummary: "Chrome/120",
      status: "active",
      createdAt: "2026-07-29T00:00:00Z",
      lastVerifiedAt: null,
      lastAcceptedAt: null,
      lastErrorCode: null,
    };

    const safe = toSafeSubscription(record);
    expect(safe.id).toBe("push_sub_test");
    expect(safe.status).toBe("active");
    expect(safe).not.toHaveProperty("endpoint");
    expect(safe).not.toHaveProperty("p256dh");
    expect(safe).not.toHaveProperty("auth");
    expect(safe).not.toHaveProperty("endpointHash");
  });
});

// ── push-preferences ──

describe("isCategoryEnabled", () => {
  const defaultPrefs: PushPreferencesRecord = {
    id: "push_pref_test",
    workspaceId: "ws_test",
    principalType: "workspace_membership",
    principalId: "mem_test",
    globalEnabled: true,
    workAssignmentEnabled: true,
    scheduleChangeEnabled: true,
    workReturnedEnabled: true,
    approvalReadyEnabled: true,
    customerDocumentEnabled: true,
    paymentStatusEnabled: true,
    serviceStatusEnabled: true,
    createdAt: "2026-07-29T00:00:00Z",
    updatedAt: "2026-07-29T00:00:00Z",
  };

  it("returns true for enabled categories when global is on", () => {
    expect(isCategoryEnabled(defaultPrefs, "work_assignment")).toBe(true);
    expect(isCategoryEnabled(defaultPrefs, "schedule_change")).toBe(true);
    expect(isCategoryEnabled(defaultPrefs, "payment_status")).toBe(true);
  });

  it("returns false for all categories when global is off", () => {
    const prefs = { ...defaultPrefs, globalEnabled: false };
    expect(isCategoryEnabled(prefs, "work_assignment")).toBe(false);
    expect(isCategoryEnabled(prefs, "schedule_change")).toBe(false);
  });

  it("returns false for a specific disabled category", () => {
    const prefs = { ...defaultPrefs, workAssignmentEnabled: false };
    expect(isCategoryEnabled(prefs, "work_assignment")).toBe(false);
    expect(isCategoryEnabled(prefs, "schedule_change")).toBe(true);
  });
});

// ── web-push-provider ──

describe("validatePushRoute", () => {
  it("accepts allowlisted relative routes", () => {
    expect(validatePushRoute("/m")).toBe(true);
    expect(validatePushRoute("/m/w/ws123")).toBe(true);
    expect(validatePushRoute("/app")).toBe(true);
    expect(validatePushRoute("/access")).toBe(true);
  });

  it("rejects absolute URLs", () => {
    expect(validatePushRoute("https://evil.com/path")).toBe(false);
    expect(validatePushRoute("http://localhost:3000/m")).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(validatePushRoute("//evil.com/m")).toBe(false);
  });

  it("rejects non-allowlisted paths", () => {
    expect(validatePushRoute("/admin")).toBe(false);
    expect(validatePushRoute("/api/push/subscribe")).toBe(false);
  });

  it("rejects empty or invalid input", () => {
    expect(validatePushRoute("")).toBe(false);
    expect(validatePushRoute("relative")).toBe(false);
  });
});

describe("buildPushPayload", () => {
  it("builds a versioned payload with safe route", () => {
    const payload = buildPushPayload({
      notificationId: "ntf_test",
      title: "Work needs your attention",
      body: "Open Runory to review the update.",
      route: "/m/w/ws123/work/wi456",
    });

    expect(payload.version).toBe(1);
    expect(payload.notificationId).toBe("ntf_test");
    expect(payload.title).toBe("Work needs your attention");
    expect(payload.body).toBe("Open Runory to review the update.");
    expect(payload.route).toBe("/m/w/ws123/work/wi456");
  });

  it("falls back to /app for unsafe routes", () => {
    const payload = buildPushPayload({
      notificationId: "ntf_test",
      title: "Test",
      body: "Test",
      route: "https://evil.com/path",
    });

    expect(payload.route).toBe("/app");
  });

  it("truncates long titles and bodies", () => {
    const longTitle = "A".repeat(200);
    const longBody = "B".repeat(300);
    const payload = buildPushPayload({
      notificationId: "ntf_test",
      title: longTitle,
      body: longBody,
      route: "/app",
    });

    expect(payload.title).toHaveLength(120);
    expect(payload.body).toHaveLength(200);
  });
});
