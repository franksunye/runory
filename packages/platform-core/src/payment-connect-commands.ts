// ── Stripe Connect Command Implementations (v0.5 §9.3 / §9.4) ──
//
// Per Tech Spec §9.3 (Connect Lifecycle Commands):
//   - payment.connect.start    — creates/resumes Stripe-managed onboarding
//   - payment.connect.sync     — refreshes allowlisted account readiness from Stripe
//   - payment.connect.disconnect — sets disconnected_at, never deletes history
//
// Per Tech Spec §9.4 (Connect Readiness Guard):
//   - assertConnectReady() is called by checkout/refund paths to ensure the
//     Stripe Connect account is fully onboarded and charges-enabled before
//     any payment activity is permitted.

import {
  executeCommand,
  checkOptimisticLock,
  type CommandActor,
  type CommandResult,
} from "./command-runtime";
import { businessTable, TABLES } from "./contracts";
import { genId, now, queryOne, batch } from "./db";
import { BusinessError, NotFoundError } from "./context";
import { ERROR_CODES } from "./errors";
import type { PaymentProviderMode, PaymentProviderAccount } from "./payment-commands";

// ── Types ──

export type ConnectOnboardingStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "restricted"
  | "disconnected";

export type ConnectRequirementsStatus =
  | "pending"
  | "due"
  | "past_due"
  | "disabled"
  | "clear";

export interface PaymentProviderAccountConnect
  extends PaymentProviderAccount, Record<string, unknown> {
  account_configuration_version: number;
  onboarding_status: ConnectOnboardingStatus;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_status: ConnectRequirementsStatus;
  requirements_json: string | null;
  last_synced_at: string | null;
  disconnected_at: string | null;
  aggregate_version: number;
}

/**
 * Allowlisted sync payload received from the Stripe integration layer.
 * Only these fields are refreshed by `payment.connect.sync`; the platform
 * never accepts arbitrary Stripe account attributes.
 */
export interface ConnectSyncData {
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_status: ConnectRequirementsStatus;
  requirements_json: string | null;
}

// ── Helpers ──

function connectError(code: string, message: string, status = 409): BusinessError {
  return new BusinessError(code, `${code}: ${message}`, status);
}

/**
 * Derive the canonical onboarding status from synced Stripe data.
 *
 * Mapping (per Tech Spec §9.3):
 *   - requirements disabled/past_due → "restricted"
 *   - details_submitted + charges + payouts            → "complete"
 *   - details_submitted but not all capabilities        → "in_progress"
 *   - otherwise preserves current status (or "in_progress" if not_started)
 */
function resolveOnboardingStatus(
  syncData: ConnectSyncData,
  currentStatus: ConnectOnboardingStatus,
): ConnectOnboardingStatus {
  if (currentStatus === "disconnected") return "disconnected";
  if (syncData.requirements_status === "disabled" || syncData.requirements_status === "past_due") {
    return "restricted";
  }
  if (syncData.details_submitted && syncData.charges_enabled && syncData.payouts_enabled) {
    return "complete";
  }
  if (syncData.details_submitted) {
    return "in_progress";
  }
  return currentStatus === "not_started" ? "in_progress" : currentStatus;
}

// ── Query Functions ──

/**
 * Return the active (non-disconnected) Stripe Connect account mapping for
 * the given workspace/mode. Throws NotFoundError if none exists.
 */
export async function getConnectProviderAccount(
  workspaceId: string,
  mode: PaymentProviderMode,
): Promise<PaymentProviderAccountConnect> {
  const table = businessTable("payment_provider_account");
  const row = await queryOne<PaymentProviderAccountConnect>(
    `SELECT * FROM ${table}
     WHERE workspace_id = ? AND provider = 'stripe' AND mode = ?
       AND disconnected_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, mode],
  );
  if (!row) {
    throw new NotFoundError(
      "Active Stripe Connect account not found for this workspace and mode.",
    );
  }
  return row;
}

// ── Direct Update (used by webhook/integration layer outside a command) ──

/**
 * Update onboarding_status and allowlisted sync fields directly.
 *
 * This is used by the Stripe webhook handler to apply incremental readiness
 * updates without going through the full `payment.connect.sync` command
 * (e.g. when a webhook arrives for an account that is still mid-onboarding).
 */
export async function updateConnectOnboardingStatus(
  workspaceId: string,
  providerAccountId: string,
  status: ConnectOnboardingStatus,
  syncData: ConnectSyncData,
): Promise<void> {
  const table = businessTable("payment_provider_account");
  const timestamp = now();
  await batch([
    {
      sql: `UPDATE ${table}
        SET onboarding_status = ?,
            details_submitted = ?,
            charges_enabled = ?,
            payouts_enabled = ?,
            requirements_status = ?,
            requirements_json = ?,
            last_synced_at = ?,
            updated_at = ?
        WHERE workspace_id = ? AND id = ?`,
      args: [
        status,
        syncData.details_submitted ? 1 : 0,
        syncData.charges_enabled ? 1 : 0,
        syncData.payouts_enabled ? 1 : 0,
        syncData.requirements_status,
        syncData.requirements_json,
        timestamp,
        timestamp,
        workspaceId,
        providerAccountId,
      ],
      expectedRowsAffected: 1,
    },
  ]);
}

// ── Commands ──

/**
 * Implements `payment.connect.start` (Tech Spec §9.3).
 *
 * Creates or resumes the Stripe-managed onboarding flow for the active
 * workspace/mode mapping. Returns the provider account state with a
 * short-lived onboarding URL (delivered via outbox to the integration layer).
 *
 * The command is idempotent for the active workspace/mode mapping:
 *   - If onboarding is already complete, returns the existing account.
 *   - If onboarding is in progress, resumes by emitting a new onboarding-link
 *     request to the outbox.
 *   - If no active mapping exists, creates one with onboarding_status
 *     'in_progress'.
 */
export async function startConnectOnboarding(
  workspaceId: string,
  actor: CommandActor,
  mode: PaymentProviderMode,
  idempotencyKey?: string,
  requestId?: string,
): Promise<
  CommandResult<PaymentProviderAccountConnect & { onboarding_url: string | null }>
> {
  const table = businessTable("payment_provider_account");

  // Find the active (non-disconnected) Stripe mapping for this workspace/mode.
  const existing = await queryOne<PaymentProviderAccountConnect>(
    `SELECT * FROM ${table}
     WHERE workspace_id = ? AND provider = 'stripe' AND mode = ?
       AND disconnected_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, mode],
  );

  // Idempotent fast-path: onboarding already complete.
  if (existing && existing.onboarding_status === "complete") {
    return {
      commandId: idempotencyKey ?? `payment.connect.start:${existing.id}`,
      aggregate: { ...existing, onboarding_url: null },
      newVersion: existing.aggregate_version,
      eventIds: [],
      workItemIds: [],
      status: "succeeded" as const,
    };
  }

  const timestamp = now();
  const isResume = !!existing;
  const providerAccountId = existing?.id ?? genId("ppa");
  const currentVersion = existing?.aggregate_version ?? 0;
  const commandId = idempotencyKey ?? `payment.connect.start:${providerAccountId}`;

  return executeCommand<PaymentProviderAccountConnect & { onboarding_url: string | null }>(
    {
      commandId,
      workspaceId,
      commandType: "payment.connect.start",
      aggregateType: "payment_provider_account",
      aggregateId: providerAccountId,
      expectedVersion: isResume ? currentVersion : null,
      actor,
      occurredAt: timestamp,
      requestId,
      input: { mode },
    },
    async () => {
      const updated: PaymentProviderAccountConnect = {
        id: providerAccountId,
        workspace_id: workspaceId,
        provider: "stripe",
        mode,
        provider_account_ref: existing?.provider_account_ref ?? "",
        status: "active",
        account_configuration_version:
          existing?.account_configuration_version ?? 1,
        onboarding_status: "in_progress",
        details_submitted: existing?.details_submitted ?? false,
        charges_enabled: existing?.charges_enabled ?? false,
        payouts_enabled: existing?.payouts_enabled ?? false,
        requirements_status: existing?.requirements_status ?? "pending",
        requirements_json: existing?.requirements_json ?? null,
        last_synced_at: existing?.last_synced_at ?? null,
        disconnected_at: null,
        aggregate_version: currentVersion + 1,
      };

      return {
        statements: isResume
          ? [
              {
                sql: `UPDATE ${table}
                  SET onboarding_status = 'in_progress',
                      updated_at = ?,
                      aggregate_version = aggregate_version + 1
                  WHERE workspace_id = ? AND id = ?`,
                args: [timestamp, workspaceId, providerAccountId],
              },
            ]
          : [
              {
                sql: `INSERT INTO ${table}
                  (id, workspace_id, provider, mode, provider_account_ref, status,
                   capabilities_json, account_configuration_version, onboarding_status,
                   details_submitted, charges_enabled, payouts_enabled,
                   requirements_status, requirements_json, last_synced_at,
                   disconnected_at, aggregate_version, created_at, updated_at)
                  VALUES (?, ?, 'stripe', ?, ?, 'active', ?, 1, 'in_progress',
                          0, 0, 0, 'pending', NULL, NULL, NULL, 1, ?, ?)`,
                args: [
                  providerAccountId,
                  workspaceId,
                  mode,
                  updated.provider_account_ref,
                  JSON.stringify({ hostedCheckout: true, refunds: true, connect: true }),
                  timestamp,
                  timestamp,
                ],
              },
            ],
        events: [
          {
            aggregateType: "payment_provider_account",
            aggregateId: providerAccountId,
            eventType: isResume
              ? "payment.connect.onboarding_resumed"
              : "payment.connect.onboarding_started",
            payload: { mode },
          },
        ],
        outboxMessages: [
          {
            messageType: "payment.connect.onboarding_link.create",
            payload: {
              providerAccountId,
              providerAccountRef: existing?.provider_account_ref ?? null,
              mode,
              idempotencyKey: commandId,
            },
          },
        ],
        audit: {
          action: "payment.connect.start",
          entityType: "payment_provider_account",
          entityId: providerAccountId,
          before: existing ?? null,
          after: updated,
        },
        aggregate: { ...updated, onboarding_url: null },
        newVersion: updated.aggregate_version,
      };
    },
  );
}

/**
 * Implements `payment.connect.sync` (Tech Spec §9.3).
 *
 * Refreshes allowlisted account readiness fields from Stripe. The integration
 * layer calls this after polling or receiving a webhook for the Connect
 * account. The command derives the new onboarding_status from the synced data.
 */
export async function syncConnectAccount(
  workspaceId: string,
  providerAccountId: string,
  syncData: ConnectSyncData,
): Promise<CommandResult<PaymentProviderAccountConnect>> {
  const table = businessTable("payment_provider_account");

  const current = await queryOne<PaymentProviderAccountConnect>(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, providerAccountId],
  );
  if (!current) {
    throw new NotFoundError("Connect provider account not found.");
  }
  if (current.provider !== "stripe") {
    throw connectError(
      "PAYMENT_CONNECT_PROVIDER_UNSUPPORTED",
      "Only Stripe Connect accounts can be synced.",
    );
  }
  if (current.onboarding_status === "disconnected") {
    throw connectError(
      "PAYMENT_CONNECT_DISCONNECTED",
      "Cannot sync a disconnected account.",
    );
  }

  const newStatus = resolveOnboardingStatus(syncData, current.onboarding_status);
  const timestamp = now();
  const commandId = `payment.connect.sync:${providerAccountId}:${timestamp}`;

  return executeCommand<PaymentProviderAccountConnect>(
    {
      commandId,
      workspaceId,
      commandType: "payment.connect.sync",
      aggregateType: "payment_provider_account",
      aggregateId: providerAccountId,
      expectedVersion: current.aggregate_version,
      actor: { type: "system", id: "stripe_connect_sync" },
      occurredAt: timestamp,
      input: {
        providerAccountId,
        details_submitted: syncData.details_submitted,
        charges_enabled: syncData.charges_enabled,
        payouts_enabled: syncData.payouts_enabled,
        requirements_status: syncData.requirements_status,
        requirements_json: syncData.requirements_json,
        derived_onboarding_status: newStatus,
      },
    },
    async () => {
      const updated: PaymentProviderAccountConnect = {
        ...current,
        onboarding_status: newStatus,
        details_submitted: syncData.details_submitted,
        charges_enabled: syncData.charges_enabled,
        payouts_enabled: syncData.payouts_enabled,
        requirements_status: syncData.requirements_status,
        requirements_json: syncData.requirements_json,
        last_synced_at: timestamp,
        aggregate_version: current.aggregate_version + 1,
      };

      return {
        statements: [
          {
            sql: `UPDATE ${table}
              SET onboarding_status = ?,
                  details_submitted = ?,
                  charges_enabled = ?,
                  payouts_enabled = ?,
                  requirements_status = ?,
                  requirements_json = ?,
                  last_synced_at = ?,
                  aggregate_version = aggregate_version + 1,
                  updated_at = ?
              WHERE workspace_id = ? AND id = ?`,
            args: [
              newStatus,
              syncData.details_submitted ? 1 : 0,
              syncData.charges_enabled ? 1 : 0,
              syncData.payouts_enabled ? 1 : 0,
              syncData.requirements_status,
              syncData.requirements_json,
              timestamp,
              timestamp,
              workspaceId,
              providerAccountId,
            ],
            expectedRowsAffected: 1,
          },
        ],
        events: [
          {
            aggregateType: "payment_provider_account",
            aggregateId: providerAccountId,
            eventType: "payment.connect.synced",
            payload: {
              onboardingStatus: newStatus,
              chargesEnabled: syncData.charges_enabled,
              payoutsEnabled: syncData.payouts_enabled,
              requirementsStatus: syncData.requirements_status,
            },
          },
        ],
        audit: {
          action: "payment.connect.sync",
          entityType: "payment_provider_account",
          entityId: providerAccountId,
          before: current,
          after: updated,
        },
        aggregate: updated,
        newVersion: updated.aggregate_version,
      };
    },
  );
}

/**
 * Implements `payment.connect.disconnect` (Tech Spec §9.3).
 *
 * Marks the Connect account as disconnected by setting `disconnected_at`
 * and `onboarding_status = 'disconnected'`. The account record is never
 * deleted — full history is retained for audit and reconciliation.
 *
 * Uses optimistic locking via `expectedVersion`.
 */
export async function disconnectConnectAccount(
  workspaceId: string,
  providerAccountId: string,
  actor: CommandActor,
  expectedVersion: number,
): Promise<CommandResult<PaymentProviderAccountConnect>> {
  const table = businessTable("payment_provider_account");

  const current = await queryOne<PaymentProviderAccountConnect>(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, providerAccountId],
  );
  if (!current) {
    throw new NotFoundError("Connect provider account not found.");
  }
  if (current.provider !== "stripe") {
    throw connectError(
      "PAYMENT_CONNECT_PROVIDER_UNSUPPORTED",
      "Only Stripe Connect accounts can be disconnected.",
    );
  }
  if (current.onboarding_status === "disconnected") {
    throw connectError(
      "PAYMENT_CONNECT_ALREADY_DISCONNECTED",
      "Connect account is already disconnected.",
    );
  }

  checkOptimisticLock(current.aggregate_version, expectedVersion);

  const timestamp = now();
  const commandId = `payment.connect.disconnect:${providerAccountId}:${timestamp}`;

  return executeCommand<PaymentProviderAccountConnect>(
    {
      commandId,
      workspaceId,
      commandType: "payment.connect.disconnect",
      aggregateType: "payment_provider_account",
      aggregateId: providerAccountId,
      expectedVersion,
      actor,
      occurredAt: timestamp,
      input: { providerAccountId },
    },
    async () => {
      const updated: PaymentProviderAccountConnect = {
        ...current,
        onboarding_status: "disconnected",
        disconnected_at: timestamp,
        charges_enabled: false,
        payouts_enabled: false,
        status: "disabled",
        aggregate_version: current.aggregate_version + 1,
      };

      return {
        statements: [
          {
            sql: `UPDATE ${table}
              SET onboarding_status = 'disconnected',
                  disconnected_at = ?,
                  charges_enabled = 0,
                  payouts_enabled = 0,
                  status = 'disabled',
                  aggregate_version = aggregate_version + 1,
                  updated_at = ?
              WHERE workspace_id = ? AND id = ?`,
            args: [timestamp, timestamp, workspaceId, providerAccountId],
            expectedRowsAffected: 1,
          },
        ],
        events: [
          {
            aggregateType: "payment_provider_account",
            aggregateId: providerAccountId,
            eventType: "payment.connect.disconnected",
            payload: { disconnectedAt: timestamp },
          },
        ],
        outboxMessages: [
          {
            messageType: "payment.connect.account.deactivate",
            payload: {
              providerAccountId,
              providerAccountRef: current.provider_account_ref,
              mode: current.mode,
            },
          },
        ],
        audit: {
          action: "payment.connect.disconnect",
          entityType: "payment_provider_account",
          entityId: providerAccountId,
          before: current,
          after: updated,
        },
        aggregate: updated,
        newVersion: updated.aggregate_version,
      };
    },
  );
}

// ── Guard (Tech Spec §9.4) ──

/**
 * Assert that a Connect provider account is ready for checkout/refund
 * operations.
 *
 * Throws BusinessError (403) if any of the following are true:
 *   - The provider is not Stripe.
 *   - Onboarding is not complete.
 *   - charges_enabled is false.
 *   - The account is disconnected or restricted.
 *
 * Called by checkout and refund paths before any payment activity.
 */
export function assertConnectReady(
  providerAccount: PaymentProviderAccountConnect,
): void {
  if (providerAccount.provider !== "stripe") {
    throw connectError(
      "PAYMENT_CONNECT_PROVIDER_UNSUPPORTED",
      "Only Stripe Connect accounts are supported for checkout and refund operations.",
      403,
    );
  }
  if (providerAccount.onboarding_status === "disconnected") {
    throw connectError(
      "PAYMENT_CONNECT_DISCONNECTED",
      "Stripe Connect account has been disconnected. Reconnect before processing payments.",
      403,
    );
  }
  if (providerAccount.onboarding_status === "restricted") {
    throw connectError(
      "PAYMENT_CONNECT_RESTRICTED",
      "Stripe Connect account is restricted. Resolve outstanding requirements before processing payments.",
      403,
    );
  }
  if (providerAccount.onboarding_status !== "complete") {
    throw connectError(
      "PAYMENT_CONNECT_ONBOARDING_INCOMPLETE",
      "Stripe Connect onboarding is not complete. Complete onboarding before processing payments.",
      403,
    );
  }
  if (!providerAccount.charges_enabled) {
    throw connectError(
      "PAYMENT_CONNECT_CHARGES_DISABLED",
      "Charges are not enabled on this Stripe Connect account.",
      403,
    );
  }
}
