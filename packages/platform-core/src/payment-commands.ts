import { createHash, randomUUID } from "node:crypto";
import { businessTable, TABLES } from "./contracts";
import {
  BusinessError,
  InvalidInputError,
  NotFoundError,
} from "./context";
import { batch, execute, genId, now, queryAll, queryOne } from "./db";
import {
  executeCommand,
  type CommandActor,
  type CommandResult,
} from "./command-runtime";
import { ERROR_CODES } from "./errors";

export type PaymentPurpose = "deposit" | "final" | "general";
export type PaymentSourceType = "quote" | "work_order";
export type PaymentProviderMode = "test" | "live";

export interface PaymentRequestRecord extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  number: string;
  status: "draft" | "open" | "paid" | "partially_paid" | "expired" | "cancelled";
  purpose: PaymentPurpose;
  amount_due_minor: number;
  amount_paid_minor: number;
  currency: string;
  customer_contact_id: string | null;
  source_object_type: PaymentSourceType;
  source_object_id: string;
  provider_account_id: string;
  provider_checkout_id: string | null;
  checkout_url: string | null;
  expires_at: string | null;
  created_by: string;
  aggregate_version: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  payment_request_id: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "cancelled" | "refunded" | "partially_refunded";
  amount_minor: number;
  refunded_amount_minor: number;
  currency: string;
  provider: string;
  provider_account_id: string;
  provider_payment_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  succeeded_at: string | null;
  aggregate_version: number;
  created_at: string;
  updated_at: string;
}

export interface RefundRecord extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  payment_id: string;
  status: "requested" | "processing" | "succeeded" | "failed" | "cancelled";
  amount_minor: number;
  currency: string;
  reason: string | null;
  provider_refund_id: string | null;
  requested_by: string;
  requested_at: string;
  succeeded_at: string | null;
  aggregate_version: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentProviderAccount {
  id: string;
  workspace_id: string;
  provider: string;
  mode: PaymentProviderMode;
  provider_account_ref: string;
  status: "configured" | "restricted" | "active" | "disabled";
}

export type GovernedPaymentObjectKey =
  | "payment_request"
  | "payment"
  | "refund"
  | "payment_provider_account"
  | "payment_provider_reference";

export interface GovernedPaymentRecordOptions {
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  filters?: Record<string, string>;
}

const GOVERNED_PAYMENT_COLUMNS: Record<GovernedPaymentObjectKey, readonly string[]> = {
  payment_request: [
    "id", "workspace_id", "number", "status", "purpose", "amount_due_minor",
    "amount_paid_minor", "currency", "customer_contact_id", "source_object_type",
    "source_object_id", "provider_account_id", "provider_checkout_id", "checkout_url",
    "expires_at", "created_by", "aggregate_version", "created_at", "updated_at",
    "deleted_at", "deleted_by",
  ],
  payment: [
    "id", "workspace_id", "payment_request_id", "status", "amount_minor",
    "refunded_amount_minor", "currency", "provider", "provider_account_id",
    "provider_payment_id", "failure_code", "failure_message", "succeeded_at",
    "aggregate_version", "created_at", "updated_at", "deleted_at", "deleted_by",
  ],
  refund: [
    "id", "workspace_id", "payment_id", "status", "amount_minor", "currency",
    "reason", "provider_refund_id", "requested_by", "requested_at", "succeeded_at",
    "aggregate_version", "created_at", "updated_at", "deleted_at", "deleted_by",
  ],
  payment_provider_account: [
    "id", "workspace_id", "provider", "mode", "provider_account_ref", "status",
    "capabilities_json", "created_at", "updated_at", "deleted_at", "deleted_by",
  ],
  payment_provider_reference: [
    "id", "workspace_id", "provider", "provider_account_id", "event_type",
    "provider_object_type", "provider_object_id", "provider_event_id", "payload_hash",
    "processed_status", "processed_at", "error_code", "created_at", "updated_at",
    "deleted_at", "deleted_by",
  ],
};

const GOVERNED_PAYMENT_SEARCH_COLUMNS: Record<GovernedPaymentObjectKey, readonly string[]> = {
  payment_request: ["number", "status", "purpose", "currency"],
  payment: ["status", "currency", "provider", "provider_payment_id"],
  refund: ["status", "currency", "reason", "provider_refund_id"],
  payment_provider_account: ["provider", "mode", "provider_account_ref", "status"],
  payment_provider_reference: ["provider", "event_type", "provider_event_id", "processed_status"],
};

export type ProviderPaymentEvent =
  | {
      type: "payment.succeeded";
      provider: string;
      providerEventId: string;
      providerAccountId?: string;
      providerPaymentId: string;
      paymentRequestRef: string;
      amountMinor: number;
      currency: string;
      occurredAt: string;
    }
  | {
      type: "payment.failed";
      provider: string;
      providerEventId: string;
      providerAccountId?: string;
      providerPaymentId: string;
      paymentRequestRef?: string;
      safeFailureCode?: string;
      occurredAt: string;
    }
  | {
      type: "checkout.expired";
      provider: string;
      providerEventId: string;
      providerAccountId?: string;
      checkoutId: string;
      paymentRequestRef: string;
      occurredAt: string;
    }
  | {
      type: "refund.succeeded";
      provider: string;
      providerEventId: string;
      providerAccountId?: string;
      providerRefundId: string;
      providerPaymentId: string;
      amountMinor: number;
      currency: string;
      occurredAt: string;
    }
  | {
      type: "refund.failed";
      provider: string;
      providerEventId: string;
      providerAccountId?: string;
      providerRefundId: string;
      providerPaymentId?: string;
      occurredAt: string;
    };

function paymentError(code: string, message: string, status = 409): BusinessError {
  return new BusinessError(code, `${code}: ${message}`, status);
}

export function normalizePaymentCurrency(currency: string): string {
  const value = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new InvalidInputError("Currency must be a three-letter ISO code.");
  }
  return value;
}

export function assertPaymentAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new InvalidInputError("Payment amount must be a positive integer in minor units.");
  }
}

function assertIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
    throw new InvalidInputError("Payment expiration must be a valid future date.");
  }
  return date.toISOString();
}

async function assertSourceEligible(
  workspaceId: string,
  sourceType: PaymentSourceType,
  sourceId: string,
): Promise<void> {
  const table = businessTable(sourceType);
  const source = await queryOne<{ status: string }>(
    `SELECT status FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, sourceId],
  );
  if (!source) throw new NotFoundError(`${sourceType} source record not found.`);
  const allowed = sourceType === "quote"
    ? new Set(["accepted"])
    : new Set(["completed"]);
  if (!allowed.has(source.status)) {
    throw paymentError(
      "PAYMENT_SOURCE_INELIGIBLE",
      `${sourceType} must be ${[...allowed].join(" or ")} before payment can be requested.`,
    );
  }
}

export async function upsertPaymentProviderAccount(input: {
  workspaceId: string;
  id: string;
  provider: string;
  mode: PaymentProviderMode;
  providerAccountRef: string;
}): Promise<PaymentProviderAccount> {
  const table = businessTable("payment_provider_account");
  const timestamp = now();
  const existing = await queryOne<PaymentProviderAccount>(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [input.workspaceId, input.id],
  );
  if (existing && (
    existing.provider !== input.provider
    || existing.mode !== input.mode
    || existing.provider_account_ref !== input.providerAccountRef
  )) {
    throw paymentError("PAYMENT_PROVIDER_ACCOUNT_CONFLICT", "Provider account configuration changed.");
  }
  await execute(
    `INSERT INTO ${table}
      (id, workspace_id, provider, mode, provider_account_ref, status, capabilities_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = 'active', updated_at = excluded.updated_at`,
    [
      input.id,
      input.workspaceId,
      input.provider,
      input.mode,
      input.providerAccountRef,
      JSON.stringify({ hostedCheckout: true, refunds: true }),
      timestamp,
      timestamp,
    ],
  );
  return (await queryOne<PaymentProviderAccount>(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [input.workspaceId, input.id],
  ))!;
}

export async function getPaymentProviderAccount(
  workspaceId: string,
  providerAccountId: string,
): Promise<PaymentProviderAccount> {
  const row = await queryOne<PaymentProviderAccount>(
    `SELECT * FROM ${businessTable("payment_provider_account")}
     WHERE workspace_id = ? AND id = ? AND status = 'active'`,
    [workspaceId, providerAccountId],
  );
  if (!row) throw new NotFoundError("Active payment provider account not found.");
  return row;
}

export async function requestPayment(
  workspaceId: string,
  input: {
    sourceObjectType: PaymentSourceType;
    sourceObjectId: string;
    purpose: PaymentPurpose;
    amountMinor: number;
    currency: string;
    providerAccountId: string;
    customerContactId?: string;
    customerEmail?: string;
    description?: string;
    expiresAt?: string;
    successUrl: string;
    cancelUrl: string;
  },
  actor: CommandActor,
  idempotencyKey?: string,
  requestId?: string,
): Promise<CommandResult<PaymentRequestRecord & { paymentId: string }>> {
  assertPaymentAmount(input.amountMinor);
  const currency = normalizePaymentCurrency(input.currency);
  const expiresAt = assertIsoDate(input.expiresAt);
  await assertSourceEligible(workspaceId, input.sourceObjectType, input.sourceObjectId);
  const providerAccount = await getPaymentProviderAccount(workspaceId, input.providerAccountId);
  if (providerAccount.provider !== "stripe") {
    throw paymentError("PAYMENT_PROVIDER_UNSUPPORTED", "Only Stripe is enabled for the v0.5 payment closure.");
  }

  const requestIdValue = `payreq_${randomUUID()}`;
  const paymentId = `pay_${randomUUID()}`;
  const commandId = idempotencyKey ?? `payment.request:${requestIdValue}`;
  const timestamp = now();
  const requestNumber = `PAY-${timestamp.slice(0, 10).replaceAll("-", "")}-${requestIdValue.slice(-8).toUpperCase()}`;

  return executeCommand({
    commandId,
    workspaceId,
    commandType: "payment.request",
    aggregateType: "payment_request",
    aggregateId: requestIdValue,
    expectedVersion: null,
    actor,
    occurredAt: timestamp,
    requestId,
    input: {
      ...input,
      currency,
      expiresAt,
      providerMode: providerAccount.mode,
    },
  }, async () => {
    const request: PaymentRequestRecord & { paymentId: string } = {
      id: requestIdValue,
      workspace_id: workspaceId,
      number: requestNumber,
      status: "open",
      purpose: input.purpose,
      amount_due_minor: input.amountMinor,
      amount_paid_minor: 0,
      currency,
      customer_contact_id: input.customerContactId ?? null,
      source_object_type: input.sourceObjectType,
      source_object_id: input.sourceObjectId,
      provider_account_id: input.providerAccountId,
      provider_checkout_id: null,
      checkout_url: null,
      expires_at: expiresAt,
      created_by: actor.id,
      aggregate_version: 1,
      created_at: timestamp,
      updated_at: timestamp,
      paymentId,
    };
    return {
      statements: [
        {
          sql: `INSERT INTO ${businessTable("payment_request")}
            (id, workspace_id, number, status, purpose, amount_due_minor, amount_paid_minor,
             currency, customer_contact_id, source_object_type, source_object_id,
             provider_account_id, provider_checkout_id, checkout_url, expires_at, created_by,
             aggregate_version, created_at, updated_at)
            VALUES (?, ?, ?, 'open', ?, ?, 0, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 1, ?, ?)`,
          args: [
            requestIdValue, workspaceId, requestNumber, input.purpose, input.amountMinor,
            currency, input.customerContactId ?? null, input.sourceObjectType,
            input.sourceObjectId, input.providerAccountId, expiresAt, actor.id,
            timestamp, timestamp,
          ],
        },
        {
          sql: `INSERT INTO ${businessTable("payment")}
            (id, workspace_id, payment_request_id, status, amount_minor, refunded_amount_minor,
             currency, provider, provider_account_id, provider_payment_id, aggregate_version,
             created_at, updated_at)
            VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?, NULL, 1, ?, ?)`,
          args: [
            paymentId, workspaceId, requestIdValue, input.amountMinor, currency,
            providerAccount.provider, input.providerAccountId, timestamp, timestamp,
          ],
        },
      ],
      events: [
        {
          aggregateType: "payment_request",
          aggregateId: requestIdValue,
          eventType: "payment_request.created",
          payload: { sourceObjectType: input.sourceObjectType, sourceObjectId: input.sourceObjectId },
        },
        {
          aggregateType: "payment_request",
          aggregateId: requestIdValue,
          eventType: "payment_request.opened",
          payload: { amountMinor: input.amountMinor, currency },
        },
      ],
      outboxMessages: [{
        messageType: "payment.checkout.create",
        payload: {
          paymentRequestId: requestIdValue,
          paymentId,
          provider: providerAccount.provider,
          providerAccountId: input.providerAccountId,
          providerMode: providerAccount.mode,
          amountMinor: input.amountMinor,
          currency,
          description: input.description ?? `${input.purpose} payment ${requestNumber}`,
          customerEmail: input.customerEmail ?? null,
          expiresAt,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          idempotencyKey: commandId,
        },
      }],
      audit: {
        action: "payment.request",
        entityType: "payment_request",
        entityId: requestIdValue,
        after: request,
      },
      aggregate: request,
      newVersion: 1,
    };
  });
}

export async function attachCheckoutToPaymentRequest(input: {
  workspaceId: string;
  paymentRequestId: string;
  providerAccountId: string;
  providerCheckoutId: string;
  checkoutUrl: string;
  expiresAt?: string;
}): Promise<PaymentRequestRecord> {
  if (!input.checkoutUrl.startsWith("https://")) {
    throw new InvalidInputError("Hosted Checkout URL must use HTTPS.");
  }
  const table = businessTable("payment_request");
  const current = await queryOne<PaymentRequestRecord>(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [input.workspaceId, input.paymentRequestId],
  );
  if (!current) throw new NotFoundError("Payment Request not found.");
  if (current.provider_account_id !== input.providerAccountId) {
    throw paymentError("PAYMENT_PROVIDER_ACCOUNT_MISMATCH", "Checkout provider account does not match request.");
  }
  if (current.provider_checkout_id && current.provider_checkout_id !== input.providerCheckoutId) {
    throw paymentError("PAYMENT_CHECKOUT_CONFLICT", "Payment Request is already attached to another Checkout.");
  }
  await execute(
    `UPDATE ${table}
     SET provider_checkout_id = ?, checkout_url = ?, expires_at = COALESCE(?, expires_at),
         updated_at = ?
     WHERE workspace_id = ? AND id = ?`,
    [
      input.providerCheckoutId,
      input.checkoutUrl,
      input.expiresAt ?? null,
      now(),
      input.workspaceId,
      input.paymentRequestId,
    ],
  );
  return (await queryOne<PaymentRequestRecord>(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [input.workspaceId, input.paymentRequestId],
  ))!;
}

function providerReferenceStatement(input: {
  workspaceId: string;
  provider: string;
  providerAccountId: string;
  eventType: string;
  providerObjectType: string;
  providerObjectId: string;
  providerEventId: string;
  payloadHash?: string;
  status?: "processed" | "ignored" | "failed";
  errorCode?: string;
  occurredAt: string;
}) {
  return {
    sql: `INSERT INTO ${businessTable("payment_provider_reference")}
      (id, workspace_id, provider, provider_account_id, event_type, provider_object_type,
       provider_object_id, provider_event_id, payload_hash, processed_status, processed_at,
       error_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      genId("ppr"), input.workspaceId, input.provider, input.providerAccountId,
      input.eventType, input.providerObjectType, input.providerObjectId,
      input.providerEventId, input.payloadHash ?? null, input.status ?? "processed",
      input.occurredAt, input.errorCode ?? null, now(), now(),
    ],
  };
}

function eventCommandId(providerAccountId: string, providerEventId: string): string {
  return `payment.provider:${providerAccountId}:${providerEventId}`;
}

export async function applyProviderPaymentEvent(
  workspaceId: string,
  providerAccountId: string,
  event: ProviderPaymentEvent,
  payloadHash?: string,
): Promise<CommandResult<Record<string, unknown>>> {
  const account = await getPaymentProviderAccount(workspaceId, providerAccountId);
  if (account.provider !== event.provider) {
    throw paymentError("PAYMENT_PROVIDER_ACCOUNT_MISMATCH", "Webhook provider does not match account.");
  }
  if (event.providerAccountId && event.providerAccountId !== account.provider_account_ref) {
    throw paymentError("PAYMENT_PROVIDER_ACCOUNT_MISMATCH", "Webhook account does not match workspace account.");
  }
  const actor: CommandActor = { type: "system", id: `${event.provider}:${providerAccountId}` };
  if (event.type === "payment.succeeded") {
    return confirmPayment(workspaceId, providerAccountId, event, actor, payloadHash);
  }
  if (event.type === "payment.failed") {
    return failPayment(workspaceId, providerAccountId, event, actor, payloadHash);
  }
  if (event.type === "checkout.expired") {
    return expirePaymentRequest(workspaceId, providerAccountId, event, actor, payloadHash);
  }
  if (event.type === "refund.succeeded") {
    return confirmRefund(workspaceId, providerAccountId, event, actor, payloadHash);
  }
  return failRefund(workspaceId, providerAccountId, event, actor, payloadHash);
}

async function confirmPayment(
  workspaceId: string,
  providerAccountId: string,
  event: Extract<ProviderPaymentEvent, { type: "payment.succeeded" }>,
  actor: CommandActor,
  payloadHash?: string,
) {
  const request = await queryOne<PaymentRequestRecord>(
    `SELECT * FROM ${businessTable("payment_request")} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, event.paymentRequestRef],
  );
  if (!request) throw new NotFoundError("Payment Request referenced by Stripe was not found.");
  const payment = await queryOne<PaymentRecord>(
    `SELECT * FROM ${businessTable("payment")}
     WHERE workspace_id = ? AND payment_request_id = ?`,
    [workspaceId, request.id],
  );
  if (!payment) throw new NotFoundError("Payment record was not found.");
  if (request.provider_account_id !== providerAccountId || payment.provider_account_id !== providerAccountId) {
    throw paymentError("PAYMENT_PROVIDER_ACCOUNT_MISMATCH", "Payment belongs to another provider account.");
  }
  if (event.amountMinor !== request.amount_due_minor || event.amountMinor !== payment.amount_minor) {
    throw paymentError("PAYMENT_AMOUNT_MISMATCH", "Provider amount does not match Payment Request.");
  }
  if (normalizePaymentCurrency(event.currency) !== request.currency || request.currency !== payment.currency) {
    throw paymentError("PAYMENT_CURRENCY_MISMATCH", "Provider currency does not match Payment Request.");
  }
  if (request.status === "expired" || request.status === "cancelled" || payment.status === "cancelled") {
    throw paymentError("PAYMENT_INVALID_TRANSITION", "Expired or cancelled payment cannot become succeeded.");
  }

  return executeCommand({
    commandId: eventCommandId(providerAccountId, event.providerEventId),
    workspaceId,
    commandType: "payment.confirm_provider_result",
    aggregateType: "payment",
    aggregateId: payment.id,
    expectedVersion: null,
    actor,
    occurredAt: event.occurredAt,
    input: event,
  }, async () => {
    const succeeded = {
      ...payment,
      status: "succeeded" as const,
      provider_payment_id: event.providerPaymentId,
      failure_code: null,
      failure_message: null,
      succeeded_at: event.occurredAt,
      aggregate_version: payment.aggregate_version + 1,
      updated_at: now(),
    };
    return {
      statements: [
        {
          sql: `UPDATE ${businessTable("payment")}
            SET status = 'succeeded', provider_payment_id = ?, failure_code = NULL,
                failure_message = NULL, succeeded_at = ?, aggregate_version = aggregate_version + 1,
                updated_at = ?
            WHERE workspace_id = ? AND id = ?`,
          args: [event.providerPaymentId, event.occurredAt, now(), workspaceId, payment.id],
        },
        {
          sql: `UPDATE ${businessTable("payment_request")}
            SET status = 'paid', amount_paid_minor = amount_due_minor,
                aggregate_version = aggregate_version + 1, updated_at = ?
            WHERE workspace_id = ? AND id = ?`,
          args: [now(), workspaceId, request.id],
        },
        providerReferenceStatement({
          workspaceId,
          provider: event.provider,
          providerAccountId,
          eventType: event.type,
          providerObjectType: "payment_intent",
          providerObjectId: event.providerPaymentId,
          providerEventId: event.providerEventId,
          payloadHash,
          occurredAt: event.occurredAt,
        }),
      ],
      events: [{
        aggregateType: "payment",
        aggregateId: payment.id,
        eventType: "payment.succeeded",
        payload: {
          paymentRequestId: request.id,
          amountMinor: event.amountMinor,
          currency: request.currency,
        },
      }],
      audit: {
        action: "payment.confirm_provider_result",
        entityType: "payment",
        entityId: payment.id,
        before: payment,
        after: succeeded,
      },
      aggregate: succeeded,
      newVersion: succeeded.aggregate_version,
    };
  });
}

async function failPayment(
  workspaceId: string,
  providerAccountId: string,
  event: Extract<ProviderPaymentEvent, { type: "payment.failed" }>,
  actor: CommandActor,
  payloadHash?: string,
) {
  const payment = event.paymentRequestRef
    ? await queryOne<PaymentRecord>(
        `SELECT * FROM ${businessTable("payment")} WHERE workspace_id = ? AND payment_request_id = ?`,
        [workspaceId, event.paymentRequestRef],
      )
    : await queryOne<PaymentRecord>(
        `SELECT * FROM ${businessTable("payment")}
         WHERE workspace_id = ? AND provider_account_id = ? AND provider_payment_id = ?`,
        [workspaceId, providerAccountId, event.providerPaymentId],
      );
  if (!payment) throw new NotFoundError("Payment referenced by Stripe was not found.");
  if (payment.provider_account_id !== providerAccountId) {
    throw paymentError("PAYMENT_PROVIDER_ACCOUNT_MISMATCH", "Payment belongs to another provider account.");
  }
  const ignored = payment.status === "succeeded"
    || payment.status === "refunded"
    || payment.status === "partially_refunded";
  const next = ignored ? payment : {
    ...payment,
    status: "failed" as const,
    provider_payment_id: event.providerPaymentId,
    failure_code: event.safeFailureCode ?? "payment_failed",
    failure_message: "The payment attempt failed. The customer can retry the open Checkout.",
    aggregate_version: payment.aggregate_version + 1,
    updated_at: now(),
  };
  return executeCommand({
    commandId: eventCommandId(providerAccountId, event.providerEventId),
    workspaceId,
    commandType: "payment.fail_provider_result",
    aggregateType: "payment",
    aggregateId: payment.id,
    expectedVersion: null,
    actor,
    occurredAt: event.occurredAt,
    input: event,
  }, async () => ({
    statements: [
      ...(ignored ? [] : [{
        sql: `UPDATE ${businessTable("payment")}
          SET status = 'failed', provider_payment_id = ?, failure_code = ?,
              failure_message = ?, aggregate_version = aggregate_version + 1, updated_at = ?
          WHERE workspace_id = ? AND id = ?`,
        args: [
          event.providerPaymentId, event.safeFailureCode ?? "payment_failed",
          "The payment attempt failed. The customer can retry the open Checkout.",
          now(), workspaceId, payment.id,
        ],
      }]),
      providerReferenceStatement({
        workspaceId,
        provider: event.provider,
        providerAccountId,
        eventType: event.type,
        providerObjectType: "payment_intent",
        providerObjectId: event.providerPaymentId,
        providerEventId: event.providerEventId,
        payloadHash,
        status: ignored ? "ignored" : "processed",
        occurredAt: event.occurredAt,
      }),
    ],
    events: [{
      aggregateType: "payment",
      aggregateId: payment.id,
      eventType: "payment.failed",
      payload: { ignored, failureCode: event.safeFailureCode ?? "payment_failed" },
    }],
    audit: {
      action: ignored ? "payment.fail_provider_result.ignored" : "payment.fail_provider_result",
      entityType: "payment",
      entityId: payment.id,
      before: payment,
      after: next,
    },
    aggregate: next,
    newVersion: next.aggregate_version,
  }));
}

async function expirePaymentRequest(
  workspaceId: string,
  providerAccountId: string,
  event: Extract<ProviderPaymentEvent, { type: "checkout.expired" }>,
  actor: CommandActor,
  payloadHash?: string,
) {
  const request = await queryOne<PaymentRequestRecord>(
    `SELECT * FROM ${businessTable("payment_request")} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, event.paymentRequestRef],
  );
  if (!request) throw new NotFoundError("Payment Request referenced by Stripe was not found.");
  if (request.provider_account_id !== providerAccountId) {
    throw paymentError("PAYMENT_PROVIDER_ACCOUNT_MISMATCH", "Payment Request belongs to another provider account.");
  }
  const ignored = request.status === "paid" || request.status === "cancelled";
  const next = ignored ? request : {
    ...request,
    status: "expired" as const,
    aggregate_version: request.aggregate_version + 1,
    updated_at: now(),
  };
  return executeCommand({
    commandId: eventCommandId(providerAccountId, event.providerEventId),
    workspaceId,
    commandType: "payment.expire_request",
    aggregateType: "payment_request",
    aggregateId: request.id,
    expectedVersion: request.aggregate_version,
    actor,
    occurredAt: event.occurredAt,
    input: event,
  }, async () => ({
    statements: [
      ...(ignored ? [] : [
        {
          sql: `UPDATE ${businessTable("payment_request")}
            SET status = 'expired', aggregate_version = aggregate_version + 1, updated_at = ?
            WHERE workspace_id = ? AND id = ?`,
          args: [now(), workspaceId, request.id],
        },
        {
          sql: `UPDATE ${businessTable("payment")}
            SET status = CASE WHEN status IN ('pending', 'failed') THEN 'cancelled' ELSE status END,
                aggregate_version = CASE WHEN status IN ('pending', 'failed') THEN aggregate_version + 1 ELSE aggregate_version END,
                updated_at = ?
            WHERE workspace_id = ? AND payment_request_id = ?`,
          args: [now(), workspaceId, request.id],
        },
      ]),
      providerReferenceStatement({
        workspaceId,
        provider: event.provider,
        providerAccountId,
        eventType: event.type,
        providerObjectType: "checkout_session",
        providerObjectId: event.checkoutId,
        providerEventId: event.providerEventId,
        payloadHash,
        status: ignored ? "ignored" : "processed",
        occurredAt: event.occurredAt,
      }),
    ],
    events: [{
      aggregateType: "payment_request",
      aggregateId: request.id,
      eventType: "payment_request.expired",
      payload: { ignored, checkoutId: event.checkoutId },
    }],
    audit: {
      action: ignored ? "payment.expire_request.ignored" : "payment.expire_request",
      entityType: "payment_request",
      entityId: request.id,
      before: request,
      after: next,
    },
    aggregate: next,
    newVersion: next.aggregate_version,
  }));
}

export async function requestPaymentRefund(
  workspaceId: string,
  paymentId: string,
  amountMinor: number,
  reason: string | undefined,
  actor: CommandActor,
  idempotencyKey?: string,
  requestId?: string,
): Promise<CommandResult<RefundRecord>> {
  assertPaymentAmount(amountMinor);
  const payment = await queryOne<PaymentRecord>(
    `SELECT * FROM ${businessTable("payment")} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, paymentId],
  );
  if (!payment) throw new NotFoundError("Payment not found.");
  if (!["succeeded", "partially_refunded"].includes(payment.status)) {
    throw paymentError("PAYMENT_NOT_REFUNDABLE", "Only succeeded payments can be refunded.");
  }
  const pending = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM ${businessTable("refund")}
     WHERE workspace_id = ? AND payment_id = ? AND status IN ('requested', 'processing', 'succeeded')`,
    [workspaceId, paymentId],
  );
  const reserved = Number(pending?.total ?? 0);
  if (amountMinor > payment.amount_minor - reserved) {
    throw paymentError("PAYMENT_REFUND_EXCEEDS_BALANCE", "Refund exceeds the remaining refundable balance.");
  }
  const refundId = `ref_${randomUUID()}`;
  const timestamp = now();
  const commandId = idempotencyKey ?? `payment.refund:${refundId}`;
  const refund: RefundRecord = {
    id: refundId,
    workspace_id: workspaceId,
    payment_id: paymentId,
    status: "processing",
    amount_minor: amountMinor,
    currency: payment.currency,
    reason: reason?.trim() || null,
    provider_refund_id: null,
    requested_by: actor.id,
    requested_at: timestamp,
    succeeded_at: null,
    aggregate_version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  };
  return executeCommand({
    commandId,
    workspaceId,
    commandType: "payment.request_refund",
    aggregateType: "refund",
    aggregateId: refundId,
    expectedVersion: null,
    actor,
    occurredAt: timestamp,
    requestId,
    input: { paymentId, amountMinor, reason: refund.reason, currency: payment.currency },
  }, async () => ({
    statements: [{
      sql: `INSERT INTO ${businessTable("refund")}
        (id, workspace_id, payment_id, status, amount_minor, currency, reason,
         provider_refund_id, requested_by, requested_at, succeeded_at, aggregate_version,
         created_at, updated_at)
        VALUES (?, ?, ?, 'processing', ?, ?, ?, NULL, ?, ?, NULL, 1, ?, ?)`,
      args: [
        refundId, workspaceId, paymentId, amountMinor, payment.currency,
        refund.reason, actor.id, timestamp, timestamp, timestamp,
      ],
    }],
    events: [{
      aggregateType: "refund",
      aggregateId: refundId,
      eventType: "payment.refund_requested",
      payload: { paymentId, amountMinor, currency: payment.currency },
    }],
    outboxMessages: [{
      messageType: "payment.refund.create",
      payload: {
        refundId,
        paymentId,
        provider: payment.provider,
        providerAccountId: payment.provider_account_id,
        providerPaymentId: payment.provider_payment_id,
        amountMinor,
        currency: payment.currency,
        reason: refund.reason,
        idempotencyKey: commandId,
      },
    }],
    audit: {
      action: "payment.request_refund",
      entityType: "refund",
      entityId: refundId,
      after: refund,
    },
    aggregate: refund,
    newVersion: 1,
  }));
}

export async function attachProviderRefund(input: {
  workspaceId: string;
  refundId: string;
  providerRefundId: string;
}): Promise<RefundRecord> {
  const table = businessTable("refund");
  const current = await queryOne<RefundRecord>(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [input.workspaceId, input.refundId],
  );
  if (!current) throw new NotFoundError("Refund not found.");
  if (current.provider_refund_id && current.provider_refund_id !== input.providerRefundId) {
    throw paymentError("PAYMENT_REFUND_CONFLICT", "Refund is already attached to another provider refund.");
  }
  await execute(
    `UPDATE ${table} SET provider_refund_id = ?, updated_at = ?
     WHERE workspace_id = ? AND id = ?`,
    [input.providerRefundId, now(), input.workspaceId, input.refundId],
  );
  return (await queryOne<RefundRecord>(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [input.workspaceId, input.refundId],
  ))!;
}

async function confirmRefund(
  workspaceId: string,
  providerAccountId: string,
  event: Extract<ProviderPaymentEvent, { type: "refund.succeeded" }>,
  actor: CommandActor,
  payloadHash?: string,
) {
  const payment = await queryOne<PaymentRecord>(
    `SELECT * FROM ${businessTable("payment")}
     WHERE workspace_id = ? AND provider_account_id = ? AND provider_payment_id = ?`,
    [workspaceId, providerAccountId, event.providerPaymentId],
  );
  if (!payment) throw new NotFoundError("Payment for refund was not found.");
  const refund = await queryOne<RefundRecord>(
    `SELECT * FROM ${businessTable("refund")}
     WHERE workspace_id = ? AND payment_id = ? AND provider_refund_id = ?`,
    [workspaceId, payment.id, event.providerRefundId],
  );
  if (!refund) throw new NotFoundError("Requested Refund was not found.");
  if (normalizePaymentCurrency(event.currency) !== payment.currency || event.amountMinor !== refund.amount_minor) {
    throw paymentError("PAYMENT_REFUND_MISMATCH", "Provider refund amount or currency does not match request.");
  }
  const total = payment.refunded_amount_minor + refund.amount_minor;
  if (total > payment.amount_minor) {
    throw paymentError("PAYMENT_REFUND_EXCEEDS_BALANCE", "Provider refund exceeds payment balance.");
  }
  const paymentStatus = total === payment.amount_minor ? "refunded" : "partially_refunded";
  const completed = {
    ...refund,
    status: "succeeded" as const,
    succeeded_at: event.occurredAt,
    aggregate_version: refund.aggregate_version + 1,
    updated_at: now(),
  };
  return executeCommand({
    commandId: eventCommandId(providerAccountId, event.providerEventId),
    workspaceId,
    commandType: "payment.confirm_refund",
    aggregateType: "refund",
    aggregateId: refund.id,
    expectedVersion: null,
    actor,
    occurredAt: event.occurredAt,
    input: event,
  }, async () => ({
    statements: [
      {
        sql: `UPDATE ${businessTable("refund")}
          SET status = 'succeeded', succeeded_at = ?, aggregate_version = aggregate_version + 1,
              updated_at = ?
          WHERE workspace_id = ? AND id = ?`,
        args: [event.occurredAt, now(), workspaceId, refund.id],
      },
      {
        sql: `UPDATE ${businessTable("payment")}
          SET status = ?, refunded_amount_minor = ?, aggregate_version = aggregate_version + 1,
              updated_at = ?
          WHERE workspace_id = ? AND id = ?`,
        args: [paymentStatus, total, now(), workspaceId, payment.id],
      },
      providerReferenceStatement({
        workspaceId,
        provider: event.provider,
        providerAccountId,
        eventType: event.type,
        providerObjectType: "refund",
        providerObjectId: event.providerRefundId,
        providerEventId: event.providerEventId,
        payloadHash,
        occurredAt: event.occurredAt,
      }),
    ],
    events: [{
      aggregateType: "refund",
      aggregateId: refund.id,
      eventType: "payment.refunded",
      payload: { paymentId: payment.id, amountMinor: refund.amount_minor, paymentStatus },
    }],
    audit: {
      action: "payment.confirm_refund",
      entityType: "refund",
      entityId: refund.id,
      before: refund,
      after: completed,
    },
    aggregate: completed,
    newVersion: completed.aggregate_version,
  }));
}

async function failRefund(
  workspaceId: string,
  providerAccountId: string,
  event: Extract<ProviderPaymentEvent, { type: "refund.failed" }>,
  actor: CommandActor,
  payloadHash?: string,
) {
  const refund = await queryOne<RefundRecord>(
    `SELECT * FROM ${businessTable("refund")}
     WHERE workspace_id = ? AND provider_refund_id = ?`,
    [workspaceId, event.providerRefundId],
  );
  if (!refund) throw new NotFoundError("Requested Refund was not found.");
  const failed = {
    ...refund,
    status: "failed" as const,
    aggregate_version: refund.aggregate_version + 1,
    updated_at: now(),
  };
  return executeCommand({
    commandId: eventCommandId(providerAccountId, event.providerEventId),
    workspaceId,
    commandType: "payment.fail_refund",
    aggregateType: "refund",
    aggregateId: refund.id,
    expectedVersion: null,
    actor,
    occurredAt: event.occurredAt,
    input: event,
  }, async () => ({
    statements: [
      {
        sql: `UPDATE ${businessTable("refund")}
          SET status = 'failed', aggregate_version = aggregate_version + 1, updated_at = ?
          WHERE workspace_id = ? AND id = ?`,
        args: [now(), workspaceId, refund.id],
      },
      providerReferenceStatement({
        workspaceId,
        provider: event.provider,
        providerAccountId,
        eventType: event.type,
        providerObjectType: "refund",
        providerObjectId: event.providerRefundId,
        providerEventId: event.providerEventId,
        payloadHash,
        status: "failed",
        errorCode: "refund_failed",
        occurredAt: event.occurredAt,
      }),
    ],
    events: [{
      aggregateType: "refund",
      aggregateId: refund.id,
      eventType: "payment.refund_failed",
      payload: { paymentId: refund.payment_id, providerRefundId: event.providerRefundId },
    }],
    audit: {
      action: "payment.refund_failed",
      entityType: "refund",
      entityId: refund.id,
      before: refund,
      after: failed,
    },
    aggregate: failed,
    newVersion: failed.aggregate_version,
  }));
}

export async function listPaymentsForSource(
  workspaceId: string,
  sourceObjectType: PaymentSourceType,
  sourceObjectId: string,
): Promise<Array<PaymentRequestRecord & { payment: PaymentRecord | null }>> {
  const requests = await queryAll<PaymentRequestRecord>(
    `SELECT * FROM ${businessTable("payment_request")}
     WHERE workspace_id = ? AND source_object_type = ? AND source_object_id = ?
     ORDER BY created_at DESC`,
    [workspaceId, sourceObjectType, sourceObjectId],
  );
  const result: Array<PaymentRequestRecord & { payment: PaymentRecord | null }> = [];
  for (const request of requests) {
    const payment = await queryOne<PaymentRecord>(
      `SELECT * FROM ${businessTable("payment")}
       WHERE workspace_id = ? AND payment_request_id = ?`,
      [workspaceId, request.id],
    );
    result.push({ ...request, payment: payment ?? null });
  }
  return result;
}

export async function listGovernedPaymentRecords(
  workspaceId: string,
  objectKey: GovernedPaymentObjectKey,
  options: GovernedPaymentRecordOptions = {},
): Promise<Array<Record<string, unknown>>> {
  const columns = new Set(GOVERNED_PAYMENT_COLUMNS[objectKey]);
  const clauses = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (options.onlyDeleted) clauses.push("deleted_at IS NOT NULL");
  else if (!options.includeDeleted) clauses.push("deleted_at IS NULL");

  const search = options.search?.trim();
  if (search) {
    const searchColumns = GOVERNED_PAYMENT_SEARCH_COLUMNS[objectKey];
    clauses.push(`(${searchColumns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    for (const _column of searchColumns) args.push(`%${search}%`);
  }

  for (const [field, value] of Object.entries(options.filters ?? {})) {
    if (!columns.has(field) || field === "workspace_id") continue;
    clauses.push(`${field} = ?`);
    args.push(value);
  }

  const sortBy = options.sortBy && columns.has(options.sortBy)
    ? options.sortBy
    : "created_at";
  const sortOrder = options.sortOrder === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  args.push(limit, offset);

  return queryAll<Record<string, unknown>>(
    `SELECT * FROM ${businessTable(objectKey)}
     WHERE ${clauses.join(" AND ")}
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT ? OFFSET ?`,
    args,
  );
}

export async function getGovernedPaymentRecord(
  workspaceId: string,
  objectKey: GovernedPaymentObjectKey,
  recordId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Record<string, unknown> | undefined> {
  return queryOne<Record<string, unknown>>(
    `SELECT * FROM ${businessTable(objectKey)}
     WHERE workspace_id = ? AND id = ?${options.includeDeleted ? "" : " AND deleted_at IS NULL"}`,
    [workspaceId, recordId],
  );
}

export function hashProviderPayload(rawBody: Uint8Array): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
