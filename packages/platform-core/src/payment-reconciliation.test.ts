import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  reconcilePayment,
  replayProviderEvent,
  comparePaymentWithSnapshot,
  listReconciliationResults,
  getReconciliationResult,
  type ProviderSnapshotInput,
} from "./payment-reconciliation";
import {
  applyProviderPaymentEvent,
  requestPayment,
  upsertPaymentProviderAccount,
  type PaymentRecord,
} from "./payment-commands";
import { businessTable, TABLES } from "./contracts";
import { db, execute, genId, now, queryOne } from "./db";
import { installModule } from "./installer";
import { runMigrations } from "./migrations";
import { NotFoundError } from "./context";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;
let otherWorkspaceId: string;
const providerAccountId = "provider_account_stripe_test";
const otherProviderAccountId = "provider_account_stripe_other";
const actor = { type: "user" as const, id: "user_finance" };

// ── Database setup ──

async function resetDatabase() {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${String(row.name)}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createWorkspace(wsId: string, name: string, acctId: string) {
  const timestamp = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [wsId, name, `ws-${wsId}`, timestamp, timestamp],
  );
  // User is shared across workspaces — use INSERT OR IGNORE to avoid duplicate key
  await execute(
    `INSERT OR IGNORE INTO ${TABLES.users}
     (id, external_id, display_name, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [actor.id, "user-finance", "Finance User", timestamp, timestamp],
  );
  await execute(
    `INSERT INTO ${TABLES.workspaceMemberships}
     (id, workspace_id, user_id, role, status, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
    [genId("wsmem"), wsId, actor.id, timestamp, timestamp],
  );
  await installModule(wsId, "runory.contact");
  await installModule(wsId, "runory.payment");
  await execute(
    `CREATE TABLE IF NOT EXISTS ${businessTable("quote")} (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT NOT NULL
    )`,
  );
  await execute(
    `INSERT INTO ${businessTable("quote")} (id, workspace_id, status)
     VALUES (?, ?, 'accepted'), (?, ?, 'draft')`,
    [`quote_accepted_${wsId}`, wsId, `quote_draft_${wsId}`, wsId],
  );
  await upsertPaymentProviderAccount({
    workspaceId: wsId,
    id: acctId,
    provider: "stripe",
    mode: "test",
    providerAccountRef: `acct_test_${wsId}`,
  });
}

async function createPaymentRequest(wsId: string, acctId: string, cmdId: string) {
  return requestPayment(wsId, {
    sourceObjectType: "quote",
    sourceObjectId: `quote_accepted_${wsId}`,
    purpose: "deposit",
    amountMinor: 12_500,
    currency: "usd",
    providerAccountId: acctId,
    customerEmail: "payer@example.com",
    description: "Accepted quote deposit",
    successUrl: "https://runory.example/success",
    cancelUrl: "https://runory.example/cancel",
  }, actor, cmdId);
}

function makeSnapshot(overrides: Partial<ProviderSnapshotInput> = {}): ProviderSnapshotInput {
  return {
    provider: "stripe",
    providerAccountId,
    providerPaymentId: "pi_test_001",
    status: "succeeded",
    amountMinor: 12_500,
    refundedAmountMinor: 0,
    currency: "USD",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
  workspaceId = genId("ws");
  otherWorkspaceId = genId("ws");
  await createWorkspace(workspaceId, "Payments", providerAccountId);
  await createWorkspace(otherWorkspaceId, "Other WS", otherProviderAccountId);
});

// ── Pure function tests: comparePaymentWithSnapshot ──

describe("comparePaymentWithSnapshot", () => {
  const basePayment: PaymentRecord = {
    id: "pay_001",
    workspace_id: "ws_001",
    payment_request_id: "pr_001",
    status: "succeeded",
    amount_minor: 12_500,
    refunded_amount_minor: 0,
    currency: "USD",
    provider: "stripe",
    provider_account_id: "provider_account_stripe_test",
    provider_payment_id: "pi_test_001",
    failure_code: null,
    failure_message: null,
    succeeded_at: "2026-07-29T00:00:00.000Z",
    aggregate_version: 1,
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:00:00.000Z",
  };

  it("returns empty divergences when all fields match", () => {
    const snapshot = makeSnapshot();
    const divergences = comparePaymentWithSnapshot(basePayment, snapshot);
    expect(divergences).toHaveLength(0);
  });

  it("detects amount mismatch as error", () => {
    const snapshot = makeSnapshot({ amountMinor: 13_000 });
    const divergences = comparePaymentWithSnapshot(basePayment, snapshot);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      field: "amount",
      severity: "error",
      canonicalValue: 12_500,
      providerValue: 13_000,
    });
  });

  it("detects currency mismatch as error", () => {
    const snapshot = makeSnapshot({ currency: "EUR" });
    const divergences = comparePaymentWithSnapshot(basePayment, snapshot);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      field: "currency",
      severity: "error",
    });
  });

  it("detects payment status mismatch as error", () => {
    const snapshot = makeSnapshot({ status: "pending" });
    const divergences = comparePaymentWithSnapshot(basePayment, snapshot);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      field: "payment_status",
      severity: "error",
      canonicalValue: "succeeded",
      providerValue: "pending",
    });
  });

  it("detects refunded amount mismatch as warning", () => {
    const snapshot = makeSnapshot({ refundedAmountMinor: 5_000 });
    const divergences = comparePaymentWithSnapshot(basePayment, snapshot);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      field: "refunded_amount",
      severity: "warning",
      canonicalValue: 0,
      providerValue: 5_000,
    });
  });

  it("detects provider account mismatch as error", () => {
    const snapshot = makeSnapshot({ providerAccountId: "wrong_account" });
    const divergences = comparePaymentWithSnapshot(basePayment, snapshot);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      field: "provider_account",
      severity: "error",
    });
  });

  it("detects provider payment ID mismatch as error", () => {
    const snapshot = makeSnapshot({ providerPaymentId: "pi_different" });
    const divergences = comparePaymentWithSnapshot(basePayment, snapshot);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      field: "provider_payment_id",
      severity: "error",
    });
  });

  it("maps provider status 'paid' to canonical 'succeeded'", () => {
    const snapshot = makeSnapshot({ status: "paid" });
    const divergences = comparePaymentWithSnapshot(basePayment, snapshot);
    // "paid" maps to "succeeded", which matches basePayment.status
    expect(divergences).toHaveLength(0);
  });

  it("maps provider status 'canceled' to canonical 'cancelled'", () => {
    const cancelledPayment = { ...basePayment, status: "cancelled" as const };
    const snapshot = makeSnapshot({ status: "canceled" });
    const divergences = comparePaymentWithSnapshot(cancelledPayment, snapshot);
    expect(divergences).toHaveLength(0);
  });

  it("detects multiple divergences simultaneously", () => {
    const snapshot = makeSnapshot({
      amountMinor: 13_000,
      refundedAmountMinor: 5_000,
      status: "pending",
    });
    const divergences = comparePaymentWithSnapshot(basePayment, snapshot);
    expect(divergences).toHaveLength(3);
    const fields = divergences.map((d) => d.field);
    expect(fields).toContain("amount");
    expect(fields).toContain("refunded_amount");
    expect(fields).toContain("payment_status");
  });
});

// ── Integration tests: reconcilePayment ──

describe("reconcilePayment", () => {
  it("returns consistent status when canonical state matches provider snapshot", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_recon_1");
    const paymentId = result.aggregate.paymentId;

    // Simulate provider confirming the payment
    await applyProviderPaymentEvent(workspaceId, providerAccountId, {
      type: "payment.succeeded",
      provider: "stripe",
      providerEventId: "evt_success_1",
      providerPaymentId: "pi_test_001",
      paymentRequestRef: result.aggregate.id,
      amountMinor: 12_500,
      currency: "usd",
      occurredAt: now(),
    });

    // Update the payment's provider_payment_id (set during webhook processing)
    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_test_001", paymentId],
    );

    const command = await reconcilePayment({
      workspaceId,
      paymentId,
      providerSnapshot: makeSnapshot(),
      actor,
    });

    expect(command.aggregate.status).toBe("consistent");
    expect(command.aggregate.divergences).toHaveLength(0);
    expect(command.aggregate.replayAttempted).toBe(false);
  });

  it("detects lost event: payment is pending but provider shows succeeded", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_recon_2");
    const paymentId = result.aggregate.paymentId;

    // Don't apply the provider event — simulating a lost webhook
    // Payment stays "pending" but provider snapshot says "succeeded"
    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_test_001", paymentId],
    );

    const command = await reconcilePayment({
      workspaceId,
      paymentId,
      providerSnapshot: makeSnapshot({ status: "succeeded" }),
      actor,
    });

    expect(command.aggregate.status).toBe("divergent");
    const statusDivergence = command.aggregate.divergences.find((d) => d.field === "payment_status");
    expect(statusDivergence).toBeDefined();
    expect(statusDivergence!.canonicalValue).toBe("pending");
    expect(statusDivergence!.providerValue).toBe("succeeded");
  });

  it("detects amount divergence", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_recon_3");
    const paymentId = result.aggregate.paymentId;

    await applyProviderPaymentEvent(workspaceId, providerAccountId, {
      type: "payment.succeeded",
      provider: "stripe",
      providerEventId: "evt_success_3",
      providerPaymentId: "pi_test_003",
      paymentRequestRef: result.aggregate.id,
      amountMinor: 12_500,
      currency: "usd",
      occurredAt: now(),
    });

    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_test_003", paymentId],
    );

    const command = await reconcilePayment({
      workspaceId,
      paymentId,
      providerSnapshot: makeSnapshot({ amountMinor: 15_000 }),
      actor,
    });

    expect(command.aggregate.status).toBe("divergent");
    const amountDivergence = command.aggregate.divergences.find((d) => d.field === "amount");
    expect(amountDivergence).toBeDefined();
    expect(amountDivergence!.severity).toBe("error");
  });

  it("detects refund divergence as warning-level severity", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_recon_4");
    const paymentId = result.aggregate.paymentId;

    await applyProviderPaymentEvent(workspaceId, providerAccountId, {
      type: "payment.succeeded",
      provider: "stripe",
      providerEventId: "evt_success_4",
      providerPaymentId: "pi_test_004",
      paymentRequestRef: result.aggregate.id,
      amountMinor: 12_500,
      currency: "usd",
      occurredAt: now(),
    });

    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_test_004", paymentId],
    );

    const command = await reconcilePayment({
      workspaceId,
      paymentId,
      providerSnapshot: makeSnapshot({ refundedAmountMinor: 5_000 }),
      actor,
    });

    expect(command.aggregate.status).toBe("divergent");
    const refundDivergence = command.aggregate.divergences.find((d) => d.field === "refunded_amount");
    expect(refundDivergence).toBeDefined();
    expect(refundDivergence!.severity).toBe("warning");
  });

  it("throws NotFoundError for non-existent payment", async () => {
    await expect(
      reconcilePayment({
        workspaceId,
        paymentId: "nonexistent_payment",
        providerSnapshot: makeSnapshot(),
        actor,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects provider snapshot from mismatched provider account", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_recon_5");
    const paymentId = result.aggregate.paymentId;

    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_test_005", paymentId],
    );

    await expect(
      reconcilePayment({
        workspaceId,
        paymentId,
        providerSnapshot: makeSnapshot({ providerAccountId: "wrong_account_id" }),
        actor,
      }),
    ).rejects.toThrow("INVALID_INPUT");
  });

  it("persists reconciliation result in database", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_recon_6");
    const paymentId = result.aggregate.paymentId;

    await applyProviderPaymentEvent(workspaceId, providerAccountId, {
      type: "payment.succeeded",
      provider: "stripe",
      providerEventId: "evt_success_6",
      providerPaymentId: "pi_test_006",
      paymentRequestRef: result.aggregate.id,
      amountMinor: 12_500,
      currency: "usd",
      occurredAt: now(),
    });

    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_test_006", paymentId],
    );

    const command = await reconcilePayment({
      workspaceId,
      paymentId,
      providerSnapshot: makeSnapshot({ providerPaymentId: "pi_test_006" }),
      actor,
    });

    const row = await queryOne<{ status: string; payment_id: string }>(
      `SELECT status, payment_id FROM ${businessTable("payment_reconciliation_result")}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, command.aggregate.id],
    );
    expect(row).toEqual({
      status: "consistent",
      payment_id: paymentId,
    });
  });

  it("does not expose credentials in stored snapshots", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_recon_7");
    const paymentId = result.aggregate.paymentId;

    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_test_007", paymentId],
    );

    const command = await reconcilePayment({
      workspaceId,
      paymentId,
      providerSnapshot: makeSnapshot({ providerPaymentId: "pi_test_007" }),
      actor,
    });

    const row = await queryOne<{
      provider_snapshot_json: string;
      canonical_snapshot_json: string;
      comparison_json: string;
    }>(
      `SELECT provider_snapshot_json, canonical_snapshot_json, comparison_json
       FROM ${businessTable("payment_reconciliation_result")}
       WHERE id = ?`,
      [command.aggregate.id],
    );

    const providerSnapshot = JSON.parse(row!.provider_snapshot_json);
    const canonicalSnapshot = JSON.parse(row!.canonical_snapshot_json);
    const comparison = JSON.parse(row!.comparison_json);

    // No secret keys, API keys, or webhook secrets should appear
    const allJson = JSON.stringify({ providerSnapshot, canonicalSnapshot, comparison });
    expect(allJson).not.toMatch(/sk_(live|test)_/i);
    expect(allJson).not.toMatch(/whsec_/i);
    expect(allJson).not.toMatch(/password/i);
    expect(allJson).not.toMatch(/secret/i);
  });
});

// ── Integration tests: replayProviderEvent ──

describe("replayProviderEvent", () => {
  it("replays a lost payment.succeeded event and updates payment status", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_replay_1");
    const paymentId = result.aggregate.paymentId;

    // Set the provider_payment_id but don't apply the webhook event
    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_replay_001", paymentId],
    );

    const replayResult = await replayProviderEvent({
      workspaceId,
      providerAccountId,
      event: {
        type: "payment.succeeded",
        provider: "stripe",
        providerEventId: "evt_replay_001",
        providerPaymentId: "pi_replay_001",
        paymentRequestRef: result.aggregate.id,
        amountMinor: 12_500,
        currency: "usd",
        occurredAt: now(),
      },
      actor,
    });

    expect(replayResult.alreadyProcessed).toBe(false);
    expect(replayResult.replayResult).toBeDefined();
    expect(replayResult.reconciliationResultId).toBeTruthy();

    // Verify the payment was actually updated
    const payment = await queryOne<{ status: string }>(
      `SELECT status FROM ${businessTable("payment")} WHERE id = ?`,
      [paymentId],
    );
    expect(payment?.status).toBe("succeeded");
  });

  it("returns alreadyProcessed=true when event was already processed (idempotency)", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_replay_2");
    const paymentId = result.aggregate.paymentId;

    // First, apply the event normally
    await applyProviderPaymentEvent(workspaceId, providerAccountId, {
      type: "payment.succeeded",
      provider: "stripe",
      providerEventId: "evt_dup_001",
      providerPaymentId: "pi_replay_002",
      paymentRequestRef: result.aggregate.id,
      amountMinor: 12_500,
      currency: "usd",
      occurredAt: now(),
    });

    // Now try to replay the same event
    const replayResult = await replayProviderEvent({
      workspaceId,
      providerAccountId,
      event: {
        type: "payment.succeeded",
        provider: "stripe",
        providerEventId: "evt_dup_001",
        providerPaymentId: "pi_replay_002",
        paymentRequestRef: result.aggregate.id,
        amountMinor: 12_500,
        currency: "usd",
        occurredAt: now(),
      },
      actor,
    });

    expect(replayResult.alreadyProcessed).toBe(true);
    expect(replayResult.replayResult).toBeNull();
  });

  it("handles delayed payment.failed event via replay", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_replay_3");
    const paymentId = result.aggregate.paymentId;

    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_replay_003", paymentId],
    );

    const replayResult = await replayProviderEvent({
      workspaceId,
      providerAccountId,
      event: {
        type: "payment.failed",
        provider: "stripe",
        providerEventId: "evt_replay_failed_001",
        providerPaymentId: "pi_replay_003",
        paymentRequestRef: result.aggregate.id,
        safeFailureCode: "card_declined",
        occurredAt: now(),
      },
      actor,
    });

    expect(replayResult.alreadyProcessed).toBe(false);
    expect(replayResult.replayResult).toBeDefined();

    const payment = await queryOne<{ status: string; failure_code: string }>(
      `SELECT status, failure_code FROM ${businessTable("payment")} WHERE id = ?`,
      [paymentId],
    );
    expect(payment?.status).toBe("failed");
    expect(payment?.failure_code).toBe("card_declined");
  });

  it("throws NotFoundError for non-existent provider account", async () => {
    await expect(
      replayProviderEvent({
        workspaceId,
        providerAccountId: "nonexistent_account",
        event: {
          type: "payment.succeeded",
          provider: "stripe",
          providerEventId: "evt_replay_004",
          providerPaymentId: "pi_replay_004",
          paymentRequestRef: "pr_fake",
          amountMinor: 12_500,
          currency: "usd",
          occurredAt: now(),
        },
        actor,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects event with mismatched provider", async () => {
    await expect(
      replayProviderEvent({
        workspaceId,
        providerAccountId,
        event: {
          type: "payment.succeeded",
          provider: "paypal",
          providerEventId: "evt_replay_005",
          providerPaymentId: "pi_replay_005",
          paymentRequestRef: "pr_fake",
          amountMinor: 12_500,
          currency: "usd",
          occurredAt: now(),
        },
        actor,
      }),
    ).rejects.toThrow("INVALID_INPUT");
  });
});

// ── Cross-tenant security tests ──

describe("cross-tenant security", () => {
  it("cannot reconcile payment from another workspace", async () => {
    const result = await createPaymentRequest(otherWorkspaceId, otherProviderAccountId, "idem_cross_1");

    await expect(
      reconcilePayment({
        workspaceId, // Different workspace
        paymentId: result.aggregate.paymentId,
        providerSnapshot: makeSnapshot(),
        actor,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("cannot replay event using another workspace's provider account", async () => {
    await expect(
      replayProviderEvent({
        workspaceId, // Workspace A
        providerAccountId: otherProviderAccountId, // Workspace B's account
        event: {
          type: "payment.succeeded",
          provider: "stripe",
          providerEventId: "evt_cross_002",
          providerPaymentId: "pi_cross_002",
          paymentRequestRef: "pr_fake",
          amountMinor: 12_500,
          currency: "usd",
          occurredAt: now(),
        },
        actor,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("cannot retrieve reconciliation result from another workspace", async () => {
    // Create a result in workspace A
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_cross_3");
    const paymentId = result.aggregate.paymentId;

    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_cross_003", paymentId],
    );

    const command = await reconcilePayment({
      workspaceId,
      paymentId,
      providerSnapshot: makeSnapshot(),
      actor,
    });

    // Try to fetch it from workspace B
    await expect(
      getReconciliationResult(otherWorkspaceId, command.aggregate.id),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── Query helper tests ──

describe("listReconciliationResults", () => {
  it("returns results filtered by paymentId", async () => {
    const result1 = await createPaymentRequest(workspaceId, providerAccountId, "idem_list_1");
    const result2 = await createPaymentRequest(workspaceId, providerAccountId, "idem_list_2");

    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_list_001", result1.aggregate.paymentId],
    );
    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_list_002", result2.aggregate.paymentId],
    );

    await reconcilePayment({
      workspaceId,
      paymentId: result1.aggregate.paymentId,
      providerSnapshot: makeSnapshot({ providerPaymentId: "pi_list_001" }),
      actor,
    });
    await reconcilePayment({
      workspaceId,
      paymentId: result2.aggregate.paymentId,
      providerSnapshot: makeSnapshot({ providerPaymentId: "pi_list_002" }),
      actor,
    });

    const filtered = await listReconciliationResults(workspaceId, {
      paymentId: result1.aggregate.paymentId,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].paymentId).toBe(result1.aggregate.paymentId);
  });

  it("returns results filtered by status", async () => {
    const result1 = await createPaymentRequest(workspaceId, providerAccountId, "idem_list_3");
    const result2 = await createPaymentRequest(workspaceId, providerAccountId, "idem_list_4");

    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_list_003", result1.aggregate.paymentId],
    );
    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_list_004", result2.aggregate.paymentId],
    );

    // result1 → consistent (snapshot matches pending payment state)
    await reconcilePayment({
      workspaceId,
      paymentId: result1.aggregate.paymentId,
      providerSnapshot: makeSnapshot({ providerPaymentId: "pi_list_003", status: "pending" }),
      actor,
    });

    // result2 → divergent (mismatched amount)
    await reconcilePayment({
      workspaceId,
      paymentId: result2.aggregate.paymentId,
      providerSnapshot: makeSnapshot({ providerPaymentId: "pi_list_004", amountMinor: 99_999 }),
      actor,
    });

    const consistent = await listReconciliationResults(workspaceId, { status: "consistent" });
    const divergent = await listReconciliationResults(workspaceId, { status: "divergent" });
    expect(consistent).toHaveLength(1);
    expect(divergent).toHaveLength(1);
    expect(divergent[0].paymentId).toBe(result2.aggregate.paymentId);
  });

  it("respects limit and offset for pagination", async () => {
    // Create 5 reconciliation results
    for (let i = 0; i < 5; i++) {
      const result = await createPaymentRequest(workspaceId, providerAccountId, `idem_page_${i}`);
      await execute(
        `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
        [`pi_page_${i}`, result.aggregate.paymentId],
      );
      await reconcilePayment({
        workspaceId,
        paymentId: result.aggregate.paymentId,
        providerSnapshot: makeSnapshot({ providerPaymentId: `pi_page_${i}` }),
        actor,
      });
    }

    const page1 = await listReconciliationResults(workspaceId, { limit: 2, offset: 0 });
    const page2 = await listReconciliationResults(workspaceId, { limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    // Ensure no overlap
    const page1Ids = new Set(page1.map((r) => r.id));
    const page2Ids = new Set(page2.map((r) => r.id));
    for (const id of page1Ids) {
      expect(page2Ids.has(id)).toBe(false);
    }
  });
});

describe("getReconciliationResult", () => {
  it("returns a single result by ID", async () => {
    const result = await createPaymentRequest(workspaceId, providerAccountId, "idem_get_1");
    await execute(
      `UPDATE ${businessTable("payment")} SET provider_payment_id = ? WHERE id = ?`,
      ["pi_get_001", result.aggregate.paymentId],
    );

    const command = await reconcilePayment({
      workspaceId,
      paymentId: result.aggregate.paymentId,
      providerSnapshot: makeSnapshot({ providerPaymentId: "pi_get_001", status: "pending" }),
      actor,
    });

    const fetched = await getReconciliationResult(workspaceId, command.aggregate.id);
    expect(fetched.id).toBe(command.aggregate.id);
    expect(fetched.status).toBe("consistent");
    expect(fetched.paymentId).toBe(result.aggregate.paymentId);
  });

  it("throws NotFoundError for non-existent result", async () => {
    await expect(
      getReconciliationResult(workspaceId, "nonexistent_result"),
    ).rejects.toThrow(NotFoundError);
  });
});
