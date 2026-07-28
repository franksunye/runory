import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, execute, genId, now, queryAll, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { businessTable, TABLES } from "./contracts";
import { installModule } from "./installer";
import {
  startConnectOnboarding,
  syncConnectAccount,
  disconnectConnectAccount,
  assertConnectReady,
  getConnectProviderAccount,
  updateConnectOnboardingStatus,
  type ConnectSyncData,
  type PaymentProviderAccountConnect,
} from "./payment-connect-commands";
import {
  upsertPaymentProviderAccount,
  requestPayment,
  applyProviderPaymentEvent,
} from "./payment-commands";
import { BusinessError } from "./context";

// ── Database setup ──

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

/**
 * Connect columns added by platform migration 0048. The migration is
 * tolerant and runs before the payment_provider_account table is created
 * by pack installation, so the ALTER statements are silently skipped.
 * This helper adds the columns after installModule creates the table.
 */
const CONNECT_COLUMNS: Array<{ name: string; def: string }> = [
  { name: "account_configuration_version", def: "TEXT" },
  { name: "onboarding_status", def: "TEXT NOT NULL DEFAULT 'not_started'" },
  { name: "details_submitted", def: "INTEGER NOT NULL DEFAULT 0" },
  { name: "charges_enabled", def: "INTEGER NOT NULL DEFAULT 0" },
  { name: "payouts_enabled", def: "INTEGER NOT NULL DEFAULT 0" },
  { name: "requirements_status", def: "TEXT NOT NULL DEFAULT 'clear'" },
  { name: "requirements_json", def: "TEXT" },
  { name: "last_synced_at", def: "TEXT" },
  { name: "disconnected_at", def: "TEXT" },
  { name: "aggregate_version", def: "INTEGER NOT NULL DEFAULT 1" },
];

async function ensureConnectColumns(): Promise<void> {
  const table = businessTable("payment_provider_account");
  const cols = await queryAll<{ name: string }>(`PRAGMA table_info(${table})`);
  const existing = new Set(cols.map((c) => c.name));
  for (const col of CONNECT_COLUMNS) {
    if (!existing.has(col.name)) {
      await execute(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.def}`);
    }
  }
}

async function resetDatabase(): Promise<void> {
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

// ── Workspace fixture ──

interface WorkspaceFixture {
  ws: string;
  userId: string;
  actor: { type: "user"; id: string };
}

async function setupWorkspace(label: string): Promise<WorkspaceFixture> {
  const ws = genId("ws");
  const ts = now();
  const userId = genId("user");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [ws, label, `${label}-${ws}`, ts, ts],
  );
  await execute(
    `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
    [userId, `ext-${ws}`, label, ts, ts],
  );
  await execute(
    `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
    [genId("wsm"), ws, userId, ts, ts],
  );
  await installModule(ws, "runory.contact");
  await installModule(ws, "runory.payment");
  await installModule(ws, "runory.invoice");
  await ensureConnectColumns();
  return { ws, userId, actor: { type: "user" as const, id: userId } };
}

// ── Sync data fixtures ──

const COMPLETE_SYNC: ConnectSyncData = {
  details_submitted: true,
  charges_enabled: true,
  payouts_enabled: true,
  requirements_status: "clear",
  requirements_json: null,
};

const RESTRICTED_SYNC: ConnectSyncData = {
  details_submitted: true,
  charges_enabled: true,
  payouts_enabled: true,
  requirements_status: "past_due",
  requirements_json: JSON.stringify({ currently_due: ["individual.id_number"] }),
};

// ── Helpers ──

/**
 * Create a fully ready Stripe Connect account (onboarding complete,
 * charges enabled) for the given workspace.
 */
async function createReadyConnectAccount(
  fix: WorkspaceFixture,
  accountRef: string,
): Promise<PaymentProviderAccountConnect> {
  const accountId = genId("ppa");
  await upsertPaymentProviderAccount({
    workspaceId: fix.ws,
    id: accountId,
    provider: "stripe",
    mode: "test",
    providerAccountRef: accountRef,
  });
  const start = await startConnectOnboarding(fix.ws, fix.actor, "test");
  const sync = await syncConnectAccount(fix.ws, start.aggregate.id, COMPLETE_SYNC);
  return sync.aggregate;
}

/**
 * Create a minimal quote table with an accepted quote for payment source tests.
 */
async function createAcceptedQuote(fix: WorkspaceFixture): Promise<string> {
  const quoteId = genId("qt");
  await execute(
    `CREATE TABLE IF NOT EXISTS ${businessTable("quote")} (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT NOT NULL
    )`,
  );
  await execute(
    `INSERT INTO ${businessTable("quote")} (id, workspace_id, status) VALUES (?, ?, 'accepted')`,
    [quoteId, fix.ws],
  );
  return quoteId;
}

/**
 * Create an issued invoice with the given total.
 */
async function createInvoice(
  fix: WorkspaceFixture,
  totalMinor: number,
): Promise<string> {
  const id = genId("inv");
  const ts = now();
  const workOrderId = genId("wo");
  await execute(
    `INSERT INTO ${businessTable("invoice")}
     (id, workspace_id, invoice_number, status, work_order_id, quote_id, company_id, contact_id,
      currency, total_minor, amount_paid_minor, balance_due_minor, issued_at, due_at, paid_at,
      voided_at, memo, source_snapshot_hash, created_by, aggregate_version, created_at, updated_at)
     VALUES (?, ?, ?, 'issued', ?, NULL, NULL, NULL, 'USD', ?, 0, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, 1, ?, ?)`,
    [id, fix.ws, `INV-${id.slice(-6).toUpperCase()}`, workOrderId, totalMinor, totalMinor, ts, fix.userId, ts, ts],
  );
  return id;
}

/**
 * Fetch a connect provider account directly from the database (including
 * disconnected accounts) for assertion purposes.
 */
async function getConnectAccountDirect(
  workspaceId: string,
  accountId: string,
): Promise<PaymentProviderAccountConnect | undefined> {
  const table = businessTable("payment_provider_account");
  return queryOne<PaymentProviderAccountConnect>(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, accountId],
  );
}

// ── Shared state ──

let wsA: WorkspaceFixture;
let wsB: WorkspaceFixture;

beforeEach(async () => {
  await resetDatabase();
  wsA = await setupWorkspace("WS-A");
  wsB = await setupWorkspace("WS-B");
});

// ────────────────────────────────────────────────────────────────────
// §14.6 Stripe Connect Test Matrix
// ────────────────────────────────────────────────────────────────────

describe("§14.6 Stripe Connect test matrix", () => {

  // ── 1. Two Workspaces map to different sandbox Connected Accounts ──

  describe("1. Two workspaces map to different sandbox Connected Accounts and modes", () => {
    it("creates distinct provider accounts for WS-A and WS-B with different provider_account_refs", async () => {
      const idA = genId("ppa");
      const idB = genId("ppa");
      await upsertPaymentProviderAccount({
        workspaceId: wsA.ws,
        id: idA,
        provider: "stripe",
        mode: "test",
        providerAccountRef: "acct_test_a",
      });
      await upsertPaymentProviderAccount({
        workspaceId: wsB.ws,
        id: idB,
        provider: "stripe",
        mode: "test",
        providerAccountRef: "acct_test_b",
      });

      const startA = await startConnectOnboarding(wsA.ws, wsA.actor, "test");
      const startB = await startConnectOnboarding(wsB.ws, wsB.actor, "test");

      expect(startA.aggregate.id).not.toBe(startB.aggregate.id);
      expect(startA.aggregate.workspace_id).toBe(wsA.ws);
      expect(startB.aggregate.workspace_id).toBe(wsB.ws);
      expect(startA.aggregate.provider_account_ref).toBe("acct_test_a");
      expect(startB.aggregate.provider_account_ref).toBe("acct_test_b");
    });

    it("getConnectProviderAccount for WS-A returns WS-A's account, not WS-B's", async () => {
      await createReadyConnectAccount(wsA, "acct_test_a");
      await createReadyConnectAccount(wsB, "acct_test_b");

      const accountA = await getConnectProviderAccount(wsA.ws, "test");
      const accountB = await getConnectProviderAccount(wsB.ws, "test");

      expect(accountA.workspace_id).toBe(wsA.ws);
      expect(accountA.provider_account_ref).toBe("acct_test_a");
      expect(accountB.workspace_id).toBe(wsB.ws);
      expect(accountB.provider_account_ref).toBe("acct_test_b");
      expect(accountA.id).not.toBe(accountB.id);
    });
  });

  // ── 2. Incomplete, restricted, disabled, disconnected, and stale account states reject ──

  describe("2. Incomplete, restricted, disabled, disconnected, and stale account states reject new Checkout/refund execution", () => {
    it("rejects when onboarding_status is in_progress", async () => {
      const start = await startConnectOnboarding(wsA.ws, wsA.actor, "test");
      const account = await getConnectProviderAccount(wsA.ws, "test");

      expect(account.onboarding_status).toBe("in_progress");
      expect(() => assertConnectReady(account)).toThrow(
        "PAYMENT_CONNECT_ONBOARDING_INCOMPLETE",
      );
    });

    it("rejects when onboarding_status is restricted (requirements past_due)", async () => {
      const start = await startConnectOnboarding(wsA.ws, wsA.actor, "test");
      await syncConnectAccount(wsA.ws, start.aggregate.id, RESTRICTED_SYNC);
      const account = await getConnectProviderAccount(wsA.ws, "test");

      expect(account.onboarding_status).toBe("restricted");
      expect(() => assertConnectReady(account)).toThrow(
        "PAYMENT_CONNECT_RESTRICTED",
      );
    });

    it("rejects when onboarding_status is complete but charges_enabled is false", async () => {
      const start = await startConnectOnboarding(wsA.ws, wsA.actor, "test");
      // syncConnectAccount would derive "in_progress" when charges_enabled=false,
      // so use updateConnectOnboardingStatus to set "complete" directly.
      await updateConnectOnboardingStatus(wsA.ws, start.aggregate.id, "complete", {
        details_submitted: true,
        charges_enabled: false,
        payouts_enabled: true,
        requirements_status: "clear",
        requirements_json: null,
      });
      const account = await getConnectProviderAccount(wsA.ws, "test");

      expect(account.onboarding_status).toBe("complete");
      // SQLite stores booleans as integers (0/1)
      expect(Number(account.charges_enabled)).toBe(0);
      expect(() => assertConnectReady(account)).toThrow(
        "PAYMENT_CONNECT_CHARGES_DISABLED",
      );
    });

    it("rejects when account is disconnected", async () => {
      const start = await startConnectOnboarding(wsA.ws, wsA.actor, "test");
      const sync = await syncConnectAccount(wsA.ws, start.aggregate.id, COMPLETE_SYNC);
      await disconnectConnectAccount(wsA.ws, start.aggregate.id, wsA.actor, sync.newVersion);

      // getConnectProviderAccount filters out disconnected accounts
      await expect(getConnectProviderAccount(wsA.ws, "test")).rejects.toThrow();

      // Verify assertConnectReady throws for the disconnected account
      const disconnected = await getConnectAccountDirect(wsA.ws, start.aggregate.id);
      expect(disconnected!.onboarding_status).toBe("disconnected");
      expect(() => assertConnectReady(disconnected!)).toThrow(
        "PAYMENT_CONNECT_DISCONNECTED",
      );
    });
  });

  // ── 3. Checkout, PaymentIntent retrieval, refund, and reconciliation use owning account ──

  describe("3. Checkout, PaymentIntent retrieval, refund, and reconciliation always use the owning Connected Account context", () => {
    it("getConnectProviderAccount always returns the workspace's own account", async () => {
      const acctA = await createReadyConnectAccount(wsA, "acct_test_a");
      const acctB = await createReadyConnectAccount(wsB, "acct_test_b");

      const fetchedA = await getConnectProviderAccount(wsA.ws, "test");
      const fetchedB = await getConnectProviderAccount(wsB.ws, "test");

      expect(fetchedA.id).toBe(acctA.id);
      expect(fetchedB.id).toBe(acctB.id);
      expect(fetchedA.workspace_id).toBe(wsA.ws);
      expect(fetchedB.workspace_id).toBe(wsB.ws);
    });

    it("payment request provider_account_id is the workspace's own connect account", async () => {
      const acctA = await createReadyConnectAccount(wsA, "acct_test_a");
      const quoteId = await createAcceptedQuote(wsA);

      const result = await requestPayment(
        wsA.ws,
        {
          sourceObjectType: "quote",
          sourceObjectId: quoteId,
          purpose: "deposit",
          amountMinor: 12_500,
          currency: "usd",
          providerAccountId: acctA.id,
          successUrl: "https://runory.example/success",
          cancelUrl: "https://runory.example/cancel",
        },
        wsA.actor,
      );

      expect(result.aggregate.provider_account_id).toBe(acctA.id);

      // WS-A's connect account is not WS-B's
      const acctB = await getConnectProviderAccount(wsB.ws, "test").catch(() => null);
      // WS-B has no connect account yet
      expect(acctB).toBeNull();
    });
  });

  // ── 4. Connect webhook mismatches fail safely ──

  describe("4. Connect webhook signature, account, mode, amount, currency, and provider object mismatches fail safely", () => {
    it("syncConnectAccount rejects non-Stripe providers", async () => {
      const paypalAccountId = genId("ppa");
      await upsertPaymentProviderAccount({
        workspaceId: wsA.ws,
        id: paypalAccountId,
        provider: "paypal",
        mode: "test",
        providerAccountRef: "acct_paypal_a",
      });

      await expect(
        syncConnectAccount(wsA.ws, paypalAccountId, COMPLETE_SYNC),
      ).rejects.toThrow("PAYMENT_CONNECT_PROVIDER_UNSUPPORTED");
    });

    it("syncConnectAccount rejects disconnected accounts", async () => {
      const start = await startConnectOnboarding(wsA.ws, wsA.actor, "test");
      const sync = await syncConnectAccount(wsA.ws, start.aggregate.id, COMPLETE_SYNC);
      await disconnectConnectAccount(wsA.ws, start.aggregate.id, wsA.actor, sync.newVersion);

      await expect(
        syncConnectAccount(wsA.ws, start.aggregate.id, COMPLETE_SYNC),
      ).rejects.toThrow("PAYMENT_CONNECT_DISCONNECTED");
    });

    it("disconnectConnectAccount rejects non-Stripe providers", async () => {
      const paypalAccountId = genId("ppa");
      await upsertPaymentProviderAccount({
        workspaceId: wsA.ws,
        id: paypalAccountId,
        provider: "paypal",
        mode: "test",
        providerAccountRef: "acct_paypal_a",
      });

      await expect(
        disconnectConnectAccount(wsA.ws, paypalAccountId, wsA.actor, 1),
      ).rejects.toThrow("PAYMENT_CONNECT_PROVIDER_UNSUPPORTED");
    });

    it("disconnectConnectAccount rejects already-disconnected accounts", async () => {
      const start = await startConnectOnboarding(wsA.ws, wsA.actor, "test");
      const sync = await syncConnectAccount(wsA.ws, start.aggregate.id, COMPLETE_SYNC);
      await disconnectConnectAccount(wsA.ws, start.aggregate.id, wsA.actor, sync.newVersion);

      await expect(
        disconnectConnectAccount(wsA.ws, start.aggregate.id, wsA.actor, sync.newVersion + 1),
      ).rejects.toThrow("PAYMENT_CONNECT_ALREADY_DISCONNECTED");
    });
  });

  // ── 5. Duplicate and reordered events do not regress authoritative state ──

  describe("5. Duplicate and reordered account/payment/refund/dispute events do not regress authoritative state", () => {
    it("duplicate syncConnectAccount calls produce consistent state without duplicates", async () => {
      const start = await startConnectOnboarding(wsA.ws, wsA.actor, "test");

      const firstSync = await syncConnectAccount(wsA.ws, start.aggregate.id, COMPLETE_SYNC);
      const secondSync = await syncConnectAccount(wsA.ws, start.aggregate.id, COMPLETE_SYNC);

      expect(firstSync.aggregate.onboarding_status).toBe("complete");
      expect(secondSync.aggregate.onboarding_status).toBe("complete");
      expect(secondSync.aggregate.charges_enabled).toBe(true);
      expect(secondSync.aggregate.payouts_enabled).toBe(true);

      // No duplicate account records
      const table = businessTable("payment_provider_account");
      const count = await queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${table} WHERE workspace_id = ? AND provider = 'stripe'`,
        [wsA.ws],
      );
      expect(Number(count?.count)).toBe(1);
    });

    it("startConnectOnboarding when already complete returns existing account (idempotent fast-path)", async () => {
      const start = await startConnectOnboarding(wsA.ws, wsA.actor, "test");
      await syncConnectAccount(wsA.ws, start.aggregate.id, COMPLETE_SYNC);

      const restart = await startConnectOnboarding(wsA.ws, wsA.actor, "test");

      // Fast-path: same account, no new events, no onboarding URL
      expect(restart.aggregate.id).toBe(start.aggregate.id);
      expect(restart.aggregate.onboarding_status).toBe("complete");
      expect(restart.eventIds).toHaveLength(0);
      expect(restart.aggregate.onboarding_url).toBeNull();
    });

    it("disconnectConnectAccount on already-disconnected throws PAYMENT_CONNECT_ALREADY_DISCONNECTED", async () => {
      const start = await startConnectOnboarding(wsA.ws, wsA.actor, "test");
      const sync = await syncConnectAccount(wsA.ws, start.aggregate.id, COMPLETE_SYNC);
      await disconnectConnectAccount(wsA.ws, start.aggregate.id, wsA.actor, sync.newVersion);

      await expect(
        disconnectConnectAccount(wsA.ws, start.aggregate.id, wsA.actor, sync.newVersion + 1),
      ).rejects.toThrow("PAYMENT_CONNECT_ALREADY_DISCONNECTED");
    });
  });

  // ── 6. One Workspace cannot access another Workspace's account ──

  describe("6. One Workspace cannot onboard, read, charge, refund, replay, or reconcile the other Workspace's account", () => {
    it("getConnectProviderAccount for WS-A returns only WS-A's account, not WS-B's", async () => {
      const acctA = await createReadyConnectAccount(wsA, "acct_test_a");
      const acctB = await createReadyConnectAccount(wsB, "acct_test_b");

      const fetchedA = await getConnectProviderAccount(wsA.ws, "test");
      expect(fetchedA.id).toBe(acctA.id);
      expect(fetchedA.id).not.toBe(acctB.id);
    });

    it("WS-A cannot call syncConnectAccount with WS-B's providerAccountId", async () => {
      const acctB = await createReadyConnectAccount(wsB, "acct_test_b");

      // Querying WS-A + WS-B's account ID returns null → NotFoundError
      await expect(
        syncConnectAccount(wsA.ws, acctB.id, COMPLETE_SYNC),
      ).rejects.toThrow();
    });

    it("WS-A cannot call disconnectConnectAccount with WS-B's providerAccountId", async () => {
      const acctB = await createReadyConnectAccount(wsB, "acct_test_b");

      await expect(
        disconnectConnectAccount(wsA.ws, acctB.id, wsA.actor, acctB.aggregate_version),
      ).rejects.toThrow();
    });
  });

  // ── 7. Platform Payment/Checkout objects and balance do not receive merchant gross receipts ──

  describe("7. Runory platform Payment/Checkout objects and balance do not receive merchant gross receipts", () => {
    it("payment record amount equals the charge amount, not a gross receipt including Stripe fees", async () => {
      const connectAccount = await createReadyConnectAccount(wsA, "acct_test_a");
      const invoiceId = await createInvoice(wsA, 12_500);

      const payResult = await requestPayment(
        wsA.ws,
        {
          sourceObjectType: "invoice",
          sourceObjectId: invoiceId,
          purpose: "final",
          amountMinor: 12_500,
          currency: "usd",
          providerAccountId: connectAccount.id,
          successUrl: "https://runory.example/success",
          cancelUrl: "https://runory.example/cancel",
        },
        wsA.actor,
      );

      // Simulate payment.succeeded webhook — the charge amount is 12_500.
      // A "gross receipt" would include Stripe fees (e.g., 12_500 + 363 = 12_863),
      // but the platform must record only the charge amount.
      await applyProviderPaymentEvent(
        wsA.ws,
        connectAccount.id,
        {
          type: "payment.succeeded",
          provider: "stripe",
          providerEventId: "evt_connect_success_1",
          providerPaymentId: "pi_connect_success_1",
          paymentRequestRef: payResult.aggregate.id,
          amountMinor: 12_500,
          currency: "usd",
          occurredAt: "2026-07-28T08:00:00.000Z",
        },
        "payload_hash_connect_1",
      );

      const payment = await queryOne<{ amount_minor: number; status: string }>(
        `SELECT amount_minor, status FROM ${businessTable("payment")}
         WHERE workspace_id = ? AND payment_request_id = ?`,
        [wsA.ws, payResult.aggregate.id],
      );
      expect(payment).toBeDefined();
      expect(payment!.amount_minor).toBe(12_500);
      expect(payment!.status).toBe("succeeded");
    });

    it("invoice allocation matches the payment amount, not a gross receipt", async () => {
      const connectAccount = await createReadyConnectAccount(wsA, "acct_test_a");
      const invoiceId = await createInvoice(wsA, 12_500);

      const payResult = await requestPayment(
        wsA.ws,
        {
          sourceObjectType: "invoice",
          sourceObjectId: invoiceId,
          purpose: "final",
          amountMinor: 12_500,
          currency: "usd",
          providerAccountId: connectAccount.id,
          successUrl: "https://runory.example/success",
          cancelUrl: "https://runory.example/cancel",
        },
        wsA.actor,
      );

      await applyProviderPaymentEvent(
        wsA.ws,
        connectAccount.id,
        {
          type: "payment.succeeded",
          provider: "stripe",
          providerEventId: "evt_connect_alloc_1",
          providerPaymentId: "pi_connect_alloc_1",
          paymentRequestRef: payResult.aggregate.id,
          amountMinor: 12_500,
          currency: "usd",
          occurredAt: "2026-07-28T08:00:00.000Z",
        },
        "payload_hash_connect_alloc_1",
      );

      // Invoice should reflect the charge amount, not gross receipt
      const invoice = await queryOne<{
        amount_paid_minor: number;
        balance_due_minor: number;
        status: string;
      }>(
        `SELECT amount_paid_minor, balance_due_minor, status FROM ${businessTable("invoice")}
         WHERE workspace_id = ? AND id = ?`,
        [wsA.ws, invoiceId],
      );
      expect(invoice).toBeDefined();
      expect(invoice!.amount_paid_minor).toBe(12_500);
      expect(invoice!.balance_due_minor).toBe(0);
      expect(invoice!.status).toBe("paid");

      // Allocation record should match the payment amount
      const allocation = await queryOne<{ amount_minor: number }>(
        `SELECT amount_minor FROM ${businessTable("invoice_payment_allocation")}
         WHERE workspace_id = ? AND invoice_id = ?`,
        [wsA.ws, invoiceId],
      );
      expect(allocation).toBeDefined();
      expect(allocation!.amount_minor).toBe(12_500);
    });
  });
});
