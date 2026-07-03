// ── Governed Fields Metadata (v0.5 Slice 0) ──
//
// Per v0.5 Commercial FSM Technical Specification §AD-02:
// Generic record CRUD MAY maintain drafts and non-governed descriptive fields.
// It MUST NOT directly change governed lifecycle, pricing totals, accepted
// snapshots, assignments, schedules, approvals, completion, cancellation, or reopening.
//
// This module maintains a registry of governed fields per aggregate type and
// provides a guard function that updateRecord() calls before applying changes.

import { ConflictError } from "./context";

// ── Registry ──

const GOVERNED_FIELDS: Map<string, Set<string>> = new Map();

/**
 * Register governed fields for an aggregate type.
 * Governed fields can only be changed through named commands, not via generic CRUD.
 */
export function registerGovernedFields(aggregateType: string, fields: string[]): void {
  let set = GOVERNED_FIELDS.get(aggregateType);
  if (!set) {
    set = new Set();
    GOVERNED_FIELDS.set(aggregateType, set);
  }
  for (const f of fields) set.add(f);
}

/**
 * Check whether a field is governed for the given aggregate type.
 */
export function isGovernedField(aggregateType: string, fieldName: string): boolean {
  const set = GOVERNED_FIELDS.get(aggregateType);
  return set ? set.has(fieldName) : false;
}

/**
 * Get all governed fields for an aggregate type (returns a copy).
 */
export function getGovernedFields(aggregateType: string): string[] {
  const set = GOVERNED_FIELDS.get(aggregateType);
  return set ? [...set] : [];
}

/**
 * Assert that a generic record update does not touch governed fields.
 * If any governed field is in the update, throw a ConflictError with
 * the GOVERNED_FIELD_REQUIRES_COMMAND code and list the allowed commands.
 */
export function assertNotGovernedUpdate(
  aggregateType: string,
  updates: Record<string, unknown>
): void {
  const set = GOVERNED_FIELDS.get(aggregateType);
  if (!set) return;

  const violations: string[] = [];
  for (const key of Object.keys(updates)) {
    if (set.has(key)) {
      violations.push(key);
    }
  }

  if (violations.length > 0) {
    const commands = getCommandsForAggregate(aggregateType);
    throw new ConflictError(
      `GOVERNED_FIELD_REQUIRES_COMMAND: Fields [${violations.join(", ")}] on "${aggregateType}" ` +
      `are governed and cannot be updated via generic CRUD. ` +
      `Use one of these commands instead: ${commands.join(", ")}`
    );
  }
}

// ── Command Registry (maps aggregate types to their available commands) ──

const AGGREGATE_COMMANDS: Map<string, string[]> = new Map();

/**
 * Register the commands available for an aggregate type.
 * Used to provide helpful error messages when governed field updates are rejected.
 */
export function registerAggregateCommands(aggregateType: string, commands: string[]): void {
  AGGREGATE_COMMANDS.set(aggregateType, commands);
}

/**
 * Get the list of commands available for an aggregate type.
 */
export function getCommandsForAggregate(aggregateType: string): string[] {
  return AGGREGATE_COMMANDS.get(aggregateType) ?? [];
}

// ── Default Registrations ──
// These are registered at module load time so they are always in effect.

// Quote governed fields (per v0.5 Technical Spec §5.6)
registerGovernedFields("quote", [
  "status",
  "aggregate_version",
  "subtotal",
  "discount_total",
  "tax_total",
  "grand_total",
  "approved_at",
  "accepted_at",
  "rejected_reason",
  "withdrawn_at",
  "snapshot_hash",
  "locked_at",
  "root_quote_id",
  "previous_version_id",
  "revision_number",
  "price_book_id",
  "currency",
]);

registerAggregateCommands("quote", [
  "quote.create_draft",
  "quote.recalculate",
  "quote.submit_for_approval",
  "quote.approve",
  "quote.reject",
  "quote.return_for_changes",
  "quote.withdraw",
  "quote.create_revision",
  "quote.mark_sent",
  "quote.accept",
  "quote.mark_declined",
  "quote.expire",
  "quote.convert_to_work_order",
]);

// Work Order governed fields (per v0.5 Technical Spec §5.6)
registerGovernedFields("work_order", [
  "status",
  "aggregate_version",
  "source_type",
  "source_id",
  "source_snapshot_hash",
  "owner_resource_id",
  "completed_at",
  "cancelled_at",
  "reopened_at",
  "completion_reason",
  "cancellation_reason",
  "reopen_reason",
]);

registerAggregateCommands("work_order", [
  "work_order.triage",
  "work_order.create_visit",
  "work_order.block",
  "work_order.unblock",
  "work_order.complete",
  "work_order.cancel",
  "work_order.reopen",
]);

// Service Visit governed fields
registerGovernedFields("service_visit", [
  "status",
  "aggregate_version",
  "assignment_id",
  "schedule_entry_id",
  "outcome",
  "actual_start",
  "actual_end",
]);

registerAggregateCommands("service_visit", [
  "visit.start_travel",
  "visit.arrive",
  "visit.submit_work",
  "visit.complete",
  "visit.cancel",
]);
