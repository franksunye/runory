import {
  commandContractSchema,
  type CommandActorType,
  type CommandAvailabilityPredicate,
  type CommandContract,
  type CommandIntent,
} from "@runory/contracts";
import { resolveWorkspaceAggregate } from "./aggregate-lifecycle";
import { TABLES } from "./contracts";
import { queryAll } from "./db";

// ── The record command surface ──
//
// Which Commands a record admits right now is derivable from the Contracts the
// Workspace was provisioned with: `transition.from` says which states admit the
// Command, `availableWhen` covers conditions the state cannot express, and
// `permission` says who may run it.
//
// Deriving it here — from the same snapshots `executeCommand` authorizes against
// — is what lets the office, the field app and the customer portal offer exactly
// the Commands the runtime would accept, instead of each keeping its own copy of
// the rules and drifting from the manifest.

export interface RecordCommandOption {
  key: string;
  intent: CommandIntent;
  /** Presentation token; surfaces map it to a glyph. Null when undeclared. */
  icon: string | null;
  /** The actor must supply a reason before the Command is dispatched. */
  requiresReason: boolean;
  /**
   * False when the Command can leave the record in the state it is already in —
   * adding another visit to a planned Work Order, submitting more work on site.
   * Such a Command is available but is not the step that moves the record on.
   */
  advancesSpine: boolean;
  /** The outcome leaves the lifecycle for good. */
  terminal: boolean;
  /** Aggregate the Command acts on, which for create Commands is not this record. */
  aggregate: string;
  /**
   * Input this record contributes to the Command. Empty for Commands acting on
   * the record itself, since the dispatcher already sends its id as the
   * aggregate; a create Command issued from here carries it as declared input.
   */
  input: Record<string, string>;
}

export interface RecordCommandContext {
  /** Resolved against the caller's own request context, so UI and runtime agree. */
  hasPermission: (permission: string) => Promise<boolean>;
  actorType?: CommandActorType;
}

const INTENT_ORDER: Record<CommandIntent, number> = {
  advance: 0,
  decide: 1,
  escape_hatch: 2,
};

/**
 * Resolve the Commands a record admits, in the order a surface should offer them.
 *
 * Commands without a declared `intent` are fine-grained operations driven by
 * purpose-built UI (editing quote lines, recalculating totals) and are never
 * part of the record command surface.
 */
export async function resolveRecordCommands(
  workspaceId: string,
  objectKey: string,
  record: Record<string, unknown>,
  context: RecordCommandContext,
): Promise<RecordCommandOption[]> {
  const status = String(record.status ?? "");
  const recordId = String(record.id ?? "");
  const resolved = await resolveWorkspaceAggregate(workspaceId, objectKey);
  const terminals = new Set(resolved?.aggregate.lifecycle?.terminals ?? []);
  const contracts = await listWorkspaceCommandContracts(workspaceId);

  const candidates = contracts
    .filter((contract) => contract.intent)
    .map((contract) => evaluate(contract, objectKey, status, recordId, record, terminals))
    .filter((option): option is RecordCommandOption => option !== null);

  const actorType = context.actorType ?? "user";
  const permitted: RecordCommandOption[] = [];
  const decisions = new Map<string, boolean>();
  for (const candidate of candidates) {
    const contract = contracts.find((entry) => entry.key === candidate.key)!;
    if (!contract.allowedActorTypes.includes(actorType)) continue;
    let granted = decisions.get(contract.permission);
    if (granted === undefined) {
      granted = await context.hasPermission(contract.permission);
      decisions.set(contract.permission, granted);
    }
    if (granted) permitted.push(candidate);
  }

  return permitted.sort((left, right) =>
    INTENT_ORDER[left.intent] - INTENT_ORDER[right.intent]
    || Number(right.advancesSpine) - Number(left.advancesSpine)
    || left.key.localeCompare(right.key));
}

function evaluate(
  contract: CommandContract,
  objectKey: string,
  status: string,
  recordId: string,
  record: Record<string, unknown>,
  terminals: Set<string>,
): RecordCommandOption | null {
  const option = {
    key: contract.key,
    intent: contract.intent!,
    icon: contract.icon ?? null,
    requiresReason: contract.requiresReason,
    aggregate: contract.aggregate,
    input: {},
  };

  // A create Command is issued from a record it does not act on, so its surface
  // and its conditions are declared against that other aggregate.
  if (contract.initiatedFrom) {
    if (contract.initiatedFrom.aggregate !== objectKey) return null;
    if (!satisfies(contract.initiatedFrom.when, record)) return null;
    return {
      ...option,
      input: { [contract.initiatedFrom.idField]: recordId },
      advancesSpine: true,
      terminal: false,
    };
  }

  if (contract.aggregate !== objectKey) return null;
  if (!satisfies(contract.availableWhen, record)) return null;

  if (!contract.transition) {
    // An action Command carries no transition; `availableWhen` is its only gate
    // and Catalog validation requires it to declare one.
    return { ...option, advancesSpine: true, terminal: false };
  }
  if (!contract.transition.from.includes(status)) return null;

  const targets = Array.isArray(contract.transition.to)
    ? contract.transition.to
    : [contract.transition.to];
  return {
    ...option,
    advancesSpine: !targets.includes(status),
    terminal: targets.every((target) => terminals.has(target)),
  };
}

function satisfies(
  predicates: CommandAvailabilityPredicate[],
  record: Record<string, unknown>,
): boolean {
  return predicates.every((predicate) => {
    const value = record[predicate.field];
    switch (predicate.operator) {
      case "not_null":
        return value !== null && value !== undefined && value !== "";
      case "is_null":
        return value === null || value === undefined || value === "";
      case "equals":
        return looselyEquals(value, predicate.value);
      case "not_equals":
        return !looselyEquals(value, predicate.value);
    }
  });
}

/**
 * Compare across storage shapes: a minor-unit column may arrive as a number or
 * a string depending on the driver, and a declaration should not have to know.
 */
function looselyEquals(value: unknown, expected: string | number | boolean): boolean {
  if (value === null || value === undefined) return false;
  if (typeof expected === "number") return Number(value) === expected;
  if (typeof expected === "boolean") return Boolean(value) === expected;
  return String(value) === expected;
}

async function listWorkspaceCommandContracts(workspaceId: string): Promise<CommandContract[]> {
  const rows = await queryAll<{ command_key: string; contract_json: string }>(
    `SELECT command_key, contract_json FROM ${TABLES.workspaceCommandContracts}
     WHERE workspace_id = ?`,
    [workspaceId],
  );
  const contracts: CommandContract[] = [];
  for (const row of rows) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(row.contract_json);
    } catch {
      continue;
    }
    const parsed = commandContractSchema.safeParse(decoded);
    // A snapshot that no longer parses is reported by Contract repair; offering
    // no button is the safe reading here, since execution would refuse it too.
    if (parsed.success && parsed.data.key === row.command_key) contracts.push(parsed.data);
  }
  return contracts;
}
