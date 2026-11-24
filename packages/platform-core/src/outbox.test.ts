import { beforeEach, describe, expect, it } from "vitest";
import { TABLES } from "./contracts";
import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";
import {
  claimOutboxMessage,
  enqueueOutboxMessage,
  getOutboxMessages,
  getOutboxMessage,
  listDueOutboxMessageIds,
  getOutboxQueueCounts,
  markOutboxDelivered,
  markOutboxFailed,
  retryOutboxMessage,
} from "./outbox";

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows as unknown as Array<{ name: string }>) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${row.name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createWorkspace(id: string): Promise<void> {
  const timestamp = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, id, id, timestamp, timestamp],
  );
}

beforeEach(resetDatabase);

describe("Outbox delivery reliability", () => {
  it("fences an expired worker from settling a reclaimed message", async () => {
    const workspaceId = genId("ws");
    await createWorkspace(workspaceId);
    const id = await enqueueOutboxMessage(workspaceId, "message_delivery.email", {});
    const first = await claimOutboxMessage(workspaceId, id, "2099-07-20T00:00:00.000Z");
    const next = await claimOutboxMessage(workspaceId, id, "2099-07-20T00:06:00.000Z");
    expect(first?.lockedAt).toBeTruthy();
    expect(next?.lockedAt).not.toBe(first?.lockedAt);
    expect(await markOutboxDelivered(workspaceId, id, first!.lockedAt!)).toBe(false);
    expect(await markOutboxFailed(workspaceId, id, "STALE_WORKER", { claimLockedAt: first!.lockedAt! })).toBe(false);
    expect(await markOutboxDelivered(workspaceId, id, next!.lockedAt!)).toBe(true);
    expect((await getOutboxMessage(workspaceId, id))?.status).toBe("delivered");
  });

  it("selects due supported jobs including stale leases and counts held work", async () => {
    const workspaceId = genId("ws");
    await createWorkspace(workspaceId);
    const due = await enqueueOutboxMessage(workspaceId, "message_delivery.email", {});
    const stale = await enqueueOutboxMessage(workspaceId, "message_delivery.email", {});
    const future = await enqueueOutboxMessage(workspaceId, "message_delivery.email", {});
    const aged = await enqueueOutboxMessage(workspaceId, "message_delivery.email", {});
    await enqueueOutboxMessage(workspaceId, "payment.refund.create", {});
    await claimOutboxMessage(workspaceId, stale, "2099-07-20T00:00:00.000Z");
    await execute(`UPDATE ${TABLES.outboxMessages} SET next_attempt_at = ? WHERE id = ?`, ["2099-07-21T00:00:00.000Z", future]);
    await execute(`UPDATE ${TABLES.outboxMessages} SET created_at = ? WHERE id = ?`, ["2000-01-01T00:00:00.000Z", aged]);
    const options = { at: "2099-07-20T00:06:00.000Z", createdAfter: "2020-01-01T00:00:00.000Z" };
    const ids = await listDueOutboxMessageIds("message_delivery.email", options);
    expect(ids.map(row => row.id).sort()).toEqual([due, stale].sort());
    expect(await getOutboxQueueCounts("message_delivery.email", options.createdAfter)).toEqual({active:4, other:1, aged:1, dead:0});
  });

  it("allows only one worker to claim a due message and preserves correlation", async () => {
    const workspaceId = genId("ws");
    await createWorkspace(workspaceId);
    const messageId = await enqueueOutboxMessage(
      workspaceId,
      "test.delivery",
      { value: 1 },
      { correlationId: "req_outbox_claim" },
    );

    const [first, second] = await Promise.all([
      claimOutboxMessage(workspaceId, messageId, "2099-07-20T00:00:00.000Z"),
      claimOutboxMessage(workspaceId, messageId, "2099-07-20T00:00:00.000Z"),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect((first ?? second)?.correlationId).toBe("req_outbox_claim");

    await markOutboxDelivered(workspaceId, messageId);
    await expect(getOutboxMessages(workspaceId, { status: "delivered" }))
      .resolves.toMatchObject([{ id: messageId, attempts: 0 }]);
  });

  it("recovers stale claims and rejects cross-Workspace claims", async () => {
    const workspaceId = genId("ws");
    const otherWorkspaceId = genId("ws");
    await createWorkspace(workspaceId);
    await createWorkspace(otherWorkspaceId);
    const messageId = await enqueueOutboxMessage(workspaceId, "test.delivery", {});

    expect(await claimOutboxMessage(
      otherWorkspaceId,
      messageId,
      "2099-07-20T00:00:00.000Z",
    )).toBeNull();
    expect(await claimOutboxMessage(
      workspaceId,
      messageId,
      "2099-07-20T00:00:00.000Z",
    )).not.toBeNull();
    expect(await claimOutboxMessage(
      workspaceId,
      messageId,
      "2099-07-20T00:04:59.000Z",
    )).toBeNull();
    expect(await claimOutboxMessage(
      workspaceId,
      messageId,
      "2099-07-20T00:05:01.000Z",
    )).not.toBeNull();
  });

  it("backs off failures, dead-letters bounded retries, and supports operator reset", async () => {
    const workspaceId = genId("ws");
    await createWorkspace(workspaceId);
    const messageId = await enqueueOutboxMessage(workspaceId, "test.delivery", {});

    const attempts = [
      "2099-07-20T00:00:00.000Z",
      "2099-07-20T00:00:31.000Z",
      "2099-07-20T00:01:32.000Z",
    ];
    for (const attemptedAt of attempts) {
      expect(await claimOutboxMessage(workspaceId, messageId, attemptedAt))
        .not.toBeNull();
      await markOutboxFailed(workspaceId, messageId, "TRANSIENT_PROVIDER_ERROR", {
        maxAttempts: 3,
        failedAt: attemptedAt,
      });
    }

    await expect(getOutboxMessages(workspaceId, { status: "dead_letter" }))
      .resolves.toMatchObject([{
        id: messageId,
        attempts: 3,
        lastError: "TRANSIENT_PROVIDER_ERROR",
        nextAttemptAt: null,
      }]);
    await expect(retryOutboxMessage(workspaceId, messageId)).resolves.toBe(true);
    await expect(getOutboxMessages(workspaceId, { status: "pending" }))
      .resolves.toMatchObject([{ id: messageId, attempts: 3, lastError: null }]);
  });
});
