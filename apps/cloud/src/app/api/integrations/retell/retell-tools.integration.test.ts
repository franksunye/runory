import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getAuditEvents } from "@runory/platform-core";
import { businessTable, TABLES } from "@runory/platform-core";
import { createRecord } from "@runory/platform-core";
import { db, execute, genId, now, queryAll } from "@runory/platform-core";
import { installPack } from "@runory/platform-core";
import { runMigrations } from "@runory/platform-core";
import { POST as createWorkOrder } from "./tools/create-work-order/route";
import { POST as intakePreview } from "./tools/intake-preview/route";

const TEST_DB = "/tmp/runory-retell-cloud-route-test.db";
const AGENT_ID = "agent_cloud_route_test";
const TOOL_SECRET = "retell-cloud-route-test-secret";
let workspaceId: string;

process.env.LIBSQL_URL = `file:${TEST_DB}`;
process.env.LIBSQL_AUTH_TOKEN = "";
process.env.RETELL_AGENT_ID = AGENT_ID;
process.env.RETELL_TOOL_SECRET = TOOL_SECRET;
delete process.env.RETELL_WEBHOOK_SECRET;

function completeArgs(callId = "call_cloud_route_001") {
  return {
    callerPhone: "+1 212 555 0123",
    contactName: "Alex Chen",
    serviceAddress: "123 Main Street, Austin, TX",
    serviceCategory: "plumbing",
    issueDescription: "Urgent continuous water leak from a kitchen pipe.",
    urgency: "urgent",
    confirmedFields: ["serviceAddress", "serviceCategory", "urgency"],
    providerCallId: callId,
  };
}

function toolRequest(args: Record<string, unknown>, options: { secret?: string; invocationId?: string } = {}) {
  return new NextRequest("https://runory.example/api/integrations/retell/tools/create-work-order", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${options.secret ?? TOOL_SECRET}`,
      "x-retell-agent-id": AGENT_ID,
      "idempotency-key": "retell-cloud-route-idempotency-001",
    },
    body: JSON.stringify({
      args,
      call: { call_id: args.providerCallId, agent_id: AGENT_ID },
      tool_invocation_id: options.invocationId ?? "tool_cloud_route_001",
    }),
  });
}

async function resetDatabase() {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'" });
  for (const row of tables.rows) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${String((row as unknown as { name: string }).name)}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function setupWorkspace() {
  workspaceId = genId("ws");
  const timestamp = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, "Retell Cloud Route Test", `retell-cloud-${workspaceId.slice(-8)}`, timestamp, timestamp],
  );
  await installPack(workspaceId, "fsm-pack");
  await installPack(workspaceId, "voice-intake-poc-pack");
  await createRecord(workspaceId, "voice_provider_reference", {
    provider: "retell",
    resource_type: "agent",
    provider_resource_id: AGENT_ID,
    status: "active",
  });
}

beforeAll(() => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB);
  mkdirSync(join(TEST_DB, ".."), { recursive: true });
});

beforeEach(async () => {
  await resetDatabase();
  await setupWorkspace();
});

describe("Retell custom tool routes", () => {
  it("rejects a request without the scoped Retell tool secret", async () => {
    const response = await createWorkOrder(toolRequest(completeArgs(), { secret: "wrong-secret" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "INVALID_RETELL_SIGNATURE" });
  });

  it("does not create a work order before the caller confirms the required fields", async () => {
    const { confirmedFields: _confirmedFields, ...args } = completeArgs();
    const response = await createWorkOrder(toolRequest(args));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "VOICE_INTAKE_NOT_CONFIRMED" });
    const workOrders = await queryAll(`SELECT id FROM ${businessTable("work_order")} WHERE workspace_id = ?`, [workspaceId]);
    expect(workOrders).toHaveLength(0);
  });

  it("creates linked intake records and activity exactly once through the Cloud routes", async () => {
    const args = completeArgs();
    const previewResponse = await intakePreview(toolRequest(args));
    expect(previewResponse.status).toBe(200);
    await expect(previewResponse.json()).resolves.toMatchObject({
      ok: true,
      data: { missingFields: [], requiresConfirmation: [], nextCommands: expect.arrayContaining(["service_intake.create_work_order"]) },
    });

    const firstResponse = await createWorkOrder(toolRequest(args));
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json() as { data: { workOrderId: string; contactId: string; serviceSiteId: string } };
    const replayResponse = await createWorkOrder(toolRequest(args));
    expect(replayResponse.status).toBe(200);
    await expect(replayResponse.json()).resolves.toMatchObject({ ok: true, data: first.data });

    const workOrders = await queryAll<{ contact_id: string; service_site_id: string; source: string; source_id: string; notes: string }>(
      `SELECT contact_id, service_site_id, source, source_id, notes FROM ${businessTable("work_order")} WHERE workspace_id = ?`,
      [workspaceId],
    );
    expect(workOrders).toEqual([expect.objectContaining({
      contact_id: first.data.contactId,
      service_site_id: first.data.serviceSiteId,
      source: "voice",
      source_id: args.providerCallId,
      notes: expect.stringContaining("Runory Voice Intake (retell)"),
    })]);
    const calls = await queryAll<{ contact_id: string; service_site_id: string; work_order_id: string; outcome: string }>(
      `SELECT contact_id, service_site_id, work_order_id, outcome FROM ${businessTable("voice_call")} WHERE workspace_id = ?`,
      [workspaceId],
    );
    expect(calls).toEqual([expect.objectContaining({
      contact_id: first.data.contactId,
      service_site_id: first.data.serviceSiteId,
      work_order_id: first.data.workOrderId,
      outcome: "work_order_created",
    })]);
    const activity = await getAuditEvents(workspaceId);
    expect(activity.filter(event => event.actorId === "Runory Voice Intake (retell)")).toHaveLength(4);
    expect(activity.map(event => event.entityType)).toEqual(expect.arrayContaining(["contact", "service_site", "work_order", "voice_call"]));
  });
});
