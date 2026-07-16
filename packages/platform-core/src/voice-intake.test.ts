import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, execute, genId, now, queryAll } from "./db";
import { TABLES, businessTable } from "./contracts";
import { getAuditEvents } from "./audit-service";
import { runMigrations } from "./migrations";
import { installPack } from "./installer";
import { createRecord } from "./metadata";
import {
  createVoiceFollowUp,
  createVoiceWorkOrder,
  ingestVoiceEvent,
  normalizeE164,
  previewServiceIntake,
  upsertVoiceCall,
  verifyRetellSignature,
} from "./voice-intake";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;

async function resetDatabase() {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'" });
  for (const row of tables.rows) await db.execute({ sql: `DROP TABLE IF EXISTS "${String((row as unknown as { name: string }).name)}"` });
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function setupWorkspace() {
  workspaceId = genId("ws");
  const ts = now();
  await execute(`INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [workspaceId, "Voice Test", `voice-${workspaceId.slice(-8)}`, ts, ts]);
  await installPack(workspaceId, "fsm-pack");
  await installPack(workspaceId, "voice-intake-poc-pack");
}

beforeAll(resetDatabase);
beforeEach(async () => { await resetDatabase(); await setupWorkspace(); });

describe("voice intake provider boundary", () => {
  it("normalizes supported US phone input", () => {
    expect(normalizeE164("(212) 555-0123")).toBe("+12125550123");
    expect(normalizeE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(() => normalizeE164("123")).toThrow("VOICE_INVALID_PHONE");
  });

  it("verifies Retell HMAC without accepting a modified body", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ call_id: "call_1" });
    const timestamp = 1_720_000_000_000;
    const digest = createHmac("sha256", secret).update(`${body}${timestamp}`).digest("hex");
    const signature = `v=${timestamp},d=${digest}`;
    expect(verifyRetellSignature(body, signature, secret, timestamp)).toBe(true);
    expect(verifyRetellSignature(`${body}x`, signature, secret, timestamp)).toBe(false);
    expect(verifyRetellSignature(body, signature, secret, timestamp + 5 * 60 * 1000 + 1)).toBe(false);
  });
});

describe("voice intake POC flows", () => {
  const complete = {
    providerCallId: "call_001",
    callerPhone: "+12125550123",
    contactName: "John Smith",
    serviceAddress: "123 Main Street, Austin, TX",
    serviceCategory: "water_leak",
    issueDescription: "Kitchen pipe is leaking continuously",
    urgency: "urgent" as const,
    confirmedFields: ["serviceAddress", "serviceCategory", "urgency"],
  };

  beforeEach(async () => {
    await upsertVoiceCall(workspaceId, { providerCallId: complete.providerCallId, callerPhone: complete.callerPhone });
  });

  it("previews without mutating a work order", async () => {
    const result = await previewServiceIntake(workspaceId, complete);
    expect(result.missingFields).toEqual([]);
    expect(result.requiresConfirmation).toEqual([]);
    const workOrders = await queryAll(`SELECT id FROM ${businessTable("work_order")} WHERE workspace_id = ?`, [workspaceId]);
    expect(workOrders).toHaveLength(0);
  });

  it("creates exactly one work order for repeated command calls", async () => {
    const actor = { provider: "retell" as const, providerCallId: complete.providerCallId, integrationPrincipalId: "integration:test" };
    const first = await createVoiceWorkOrder(workspaceId, complete, actor, "idem:create:1");
    const second = await createVoiceWorkOrder(workspaceId, complete, actor, "idem:create:1");
    expect(second).toEqual(first);
    const workOrders = await queryAll(`SELECT id FROM ${businessTable("work_order")} WHERE workspace_id = ?`, [workspaceId]);
    expect(workOrders).toHaveLength(1);
    const order = await queryAll<{ contact_id: string; service_site_id: string; notes: string }>(
      `SELECT contact_id, service_site_id, notes FROM ${businessTable("work_order")} WHERE workspace_id = ?`, [workspaceId]
    );
    expect(order[0]).toMatchObject({ contact_id: first.contactId, service_site_id: first.serviceSiteId });
    expect(order[0]?.notes).toContain("Runory Voice Intake (retell)");

    const activity = await getAuditEvents(workspaceId);
    expect(activity.filter(event => event.actorId === "Runory Voice Intake (retell)")).toHaveLength(4);
    expect(activity.map(event => event.entityType)).toEqual(expect.arrayContaining(["contact", "service_site", "work_order", "voice_call"]));
  });

  it("reuses an existing customer and service site when name and address match", async () => {
    const existingContact = await createRecord(workspaceId, "contact", {
      name: complete.contactName,
      phone: "+15125550123",
      source: "manual",
    });
    const existingSite = await createRecord(workspaceId, "service_site", {
      name: "Existing Main Street site",
      address: complete.serviceAddress,
      primary_contact_id: existingContact.id,
      status: "active",
    });
    const actor = { provider: "retell" as const, providerCallId: complete.providerCallId, integrationPrincipalId: "integration:test" };
    const result = await createVoiceWorkOrder(workspaceId, complete, actor, "idem:existing:1");

    expect(result).toMatchObject({ contactId: existingContact.id, serviceSiteId: existingSite.id });
    const activity = await getAuditEvents(workspaceId);
    expect(activity.filter(event => event.entityType === "work_order")).toHaveLength(1);
    expect(activity.some(event => event.entityType === "contact" && event.after?.source === "voice")).toBe(false);
  });

  it("deduplicates lifecycle events and prevents status regression", async () => {
    const first = await ingestVoiceEvent(workspaceId, { eventId: "evt_1", providerCallId: complete.providerCallId, eventType: "call_ended", status: "ended", sequence: 3 });
    const duplicate = await ingestVoiceEvent(workspaceId, { eventId: "evt_1", providerCallId: complete.providerCallId, eventType: "call_ended", status: "ended", sequence: 3 });
    await ingestVoiceEvent(workspaceId, { eventId: "evt_2", providerCallId: complete.providerCallId, eventType: "call_started", status: "ringing", sequence: 1 });
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    const rows = await queryAll<{ status: string }>(`SELECT status FROM ${businessTable("voice_call")} WHERE workspace_id = ?`, [workspaceId]);
    expect(rows[0]?.status).toBe("ended");
  });

  it("creates visible follow-up and marks the call for review", async () => {
    const result = await createVoiceFollowUp(workspaceId, { providerCallId: complete.providerCallId, reason: "human_requested" }, "idem:follow:1");
    expect(result.accepted).toBe(true);
    const calls = await queryAll<{ review_status: string; outcome: string }>(`SELECT review_status, outcome FROM ${businessTable("voice_call")} WHERE workspace_id = ?`, [workspaceId]);
    expect(calls[0]).toMatchObject({ review_status: "needs_review", outcome: "follow_up_created" });
  });
});
