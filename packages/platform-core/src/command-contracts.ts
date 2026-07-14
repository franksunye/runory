import {
  commandContractSchema,
  type CommandCapabilityProviderDeclaration,
  type CommandContract,
  type CommandEffectRequirement,
  type ModuleManifest,
  type PlatformServiceContractManifest,
} from "@runory/contracts";
import { satisfies, valid, validRange } from "semver";
import { TABLES, businessTable } from "./contracts";
import { BusinessError } from "./context";
import { batch as runBatch, genId, now, queryOne } from "./db";
import { ERROR_CODES } from "./errors";
import type { CommandEnvelope, CommandHandlerResult } from "./command-runtime";

export interface CommandEffectProvider extends CommandCapabilityProviderDeclaration {
  prepare(context: {
    envelope: CommandEnvelope;
    requirement: CommandEffectRequirement;
    effectInput: unknown;
  }): Promise<Array<{ sql: string; args?: unknown[] }>> | Array<{ sql: string; args?: unknown[] }>;
}

export interface ResolvedCommandEffect {
  requirement: CommandEffectRequirement;
  provider: CommandEffectProvider;
}

export interface ResolvedCommandPlan {
  contract: CommandContract;
  effects: ResolvedCommandEffect[];
}

const commandContracts = new Map<string, CommandContract>();
const effectProviders = new Map<string, CommandEffectProvider[]>();

function contractError(message: string): BusinessError {
  return new BusinessError(
    ERROR_CODES.COMMAND_CONTRACT_INCOMPLETE,
    `COMMAND_CONTRACT_INCOMPLETE: ${message}`,
    500,
  );
}

export function registerCommandContract(input: CommandContract): void {
  const contract = commandContractSchema.parse(input);
  const existing = commandContracts.get(contract.key);
  if (existing && JSON.stringify(existing) !== JSON.stringify(contract)) {
    throw contractError(`Conflicting registrations for command '${contract.key}'.`);
  }
  commandContracts.set(contract.key, contract);
}

export function registerCommandEffectProvider(provider: CommandEffectProvider): void {
  if (!valid(provider.version)) {
    throw contractError(
      `Provider '${provider.capability}' has invalid version '${provider.version}'.`,
    );
  }
  const providers = effectProviders.get(provider.capability) ?? [];
  const duplicate = providers.find((candidate) => candidate.version === provider.version);
  if (duplicate && duplicate !== provider) {
    throw contractError(
      `Capability '${provider.capability}@${provider.version}' has more than one provider.`,
    );
  }
  if (!duplicate) providers.push(provider);
  effectProviders.set(provider.capability, providers);
}

export function getCommandContract(commandType: string): CommandContract | undefined {
  return commandContracts.get(commandType);
}

export function getRegisteredCommandContracts(): CommandContract[] {
  return [...commandContracts.values()];
}

export function getRegisteredCommandEffectProviders(): CommandEffectProvider[] {
  return [...effectProviders.values()].flat();
}

function providerMatches(
  requirement: CommandEffectRequirement,
  provider: CommandCapabilityProviderDeclaration,
): boolean {
  return provider.capability === requirement.capability
    && provider.consistency === requirement.consistency
    && Boolean(valid(provider.version))
    && Boolean(validRange(requirement.version))
    && satisfies(provider.version, requirement.version);
}

export function resolveCommandPlan(
  contract: CommandContract,
  providers: CommandEffectProvider[] = getRegisteredCommandEffectProviders(),
): ResolvedCommandPlan {
  const effects = contract.requiredEffects.map((requirement) => {
    const provider = providers.find((candidate) => providerMatches(requirement, candidate));
    if (!provider) {
      throw contractError(
        `${contract.key} requires ${requirement.capability}@${requirement.version} `
        + `with ${requirement.consistency} consistency.`,
      );
    }
    return { requirement, provider };
  });
  return { contract, effects };
}

export function resolveRegisteredCommandPlan(commandType: string): ResolvedCommandPlan | undefined {
  const contract = getCommandContract(commandType);
  return contract ? resolveCommandPlan(contract) : undefined;
}

/**
 * Resolve the Contract snapshot belonging to the exact versioned source
 * provisioned in this workspace. The process-level registry is only a
 * temporary bridge for the two contracts that predate persisted snapshots.
 */
export async function resolveWorkspaceCommandPlan(
  workspaceId: string,
  commandType: string,
): Promise<ResolvedCommandPlan | undefined> {
  const row = await queryOne<{ contract_json: string }>(
    `SELECT contract_json FROM ${TABLES.workspaceCommandContracts}
     WHERE workspace_id = ? AND command_key = ?`,
    [workspaceId, commandType],
  );
  if (!row) return resolveRegisteredCommandPlan(commandType);

  let decoded: unknown;
  try {
    decoded = JSON.parse(row.contract_json);
  } catch {
    throw contractError(
      `Workspace '${workspaceId}' has invalid persisted JSON for '${commandType}'.`,
    );
  }
  const contract = commandContractSchema.safeParse(decoded);
  if (!contract.success || contract.data.key !== commandType) {
    throw contractError(
      `Workspace '${workspaceId}' has an invalid persisted Contract for '${commandType}'.`,
    );
  }
  for (const requirement of contract.data.requiresModules) {
    const installation = await queryOne<{ module_version: string }>(
      `SELECT module_version FROM ${TABLES.installations}
       WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
      [workspaceId, requirement.id],
    );
    if (!installation || !validRange(requirement.version)
      || !satisfies(installation.module_version, requirement.version)) {
      throw contractError(
        `${commandType} requires installed Module '${requirement.id}@${requirement.version}'.`,
      );
    }
  }
  return resolveCommandPlan(contract.data);
}

export type CommandContractSourceKind = "module" | "platform_service";

/** Snapshot all contracts owned by one versioned Contract source. */
export async function syncWorkspaceCommandContracts(
  workspaceId: string,
  sourceKind: CommandContractSourceKind,
  sourceId: string,
  sourceVersion: string,
  inputs: CommandContract[],
): Promise<void> {
  const contracts = inputs.map((input) => commandContractSchema.parse(input));
  for (const contract of contracts) {
    const owner = await queryOne<{ source_kind: string; source_id: string }>(
      `SELECT source_kind, source_id FROM ${TABLES.workspaceCommandContracts}
       WHERE workspace_id = ? AND command_key = ?
         AND (source_kind != ? OR source_id != ?)`,
      [workspaceId, contract.key, sourceKind, sourceId],
    );
    if (owner) {
      throw contractError(
        `Command '${contract.key}' is already owned by ${owner.source_kind} '${owner.source_id}' in workspace '${workspaceId}'.`,
      );
    }
  }

  const installedAt = now();
  await runBatch([
    {
      sql: `DELETE FROM ${TABLES.workspaceCommandContracts}
            WHERE workspace_id = ? AND source_kind = ? AND source_id = ?`,
      args: [workspaceId, sourceKind, sourceId],
    },
    ...contracts.map((contract) => ({
      sql: `INSERT INTO ${TABLES.workspaceCommandContracts}
            (workspace_id, command_key, source_kind, source_id, source_version,
             contract_version, contract_json, installed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        workspaceId,
        contract.key,
        sourceKind,
        sourceId,
        sourceVersion,
        contract.contractVersion,
        JSON.stringify(contract),
        installedAt,
      ],
    })),
  ]);
}

export async function removeWorkspaceCommandContracts(
  workspaceId: string,
  sourceKind: CommandContractSourceKind,
  sourceId: string,
): Promise<void> {
  await runBatch([{
    sql: `DELETE FROM ${TABLES.workspaceCommandContracts}
          WHERE workspace_id = ? AND source_kind = ? AND source_id = ?`,
    args: [workspaceId, sourceKind, sourceId],
  }]);
}

export async function prepareCommandContractEffects(
  plan: ResolvedCommandPlan,
  envelope: CommandEnvelope,
  result: CommandHandlerResult<unknown>,
): Promise<Array<{ sql: string; args?: unknown[] }>> {
  const statements: Array<{ sql: string; args?: unknown[] }> = [];
  for (const effect of plan.effects) {
    const prepared = await effect.provider.prepare({
      envelope,
      requirement: effect.requirement,
      effectInput: result.effectInputs?.[effect.requirement.capability],
    });
    if (
      effect.requirement.consistency === "atomic"
      && prepared.length === 0
      && (effect.requirement.cardinality === "one"
        || effect.requirement.cardinality === "one_or_more")
    ) {
      throw contractError(
        `${effect.provider.capability}@${effect.provider.version} prepared no atomic effect for ${envelope.commandType}.`,
      );
    }
    statements.push(...prepared);
  }
  return statements;
}

export function assertCommandHandlerMatchesContract(
  plan: ResolvedCommandPlan,
  envelope: CommandEnvelope,
  result: CommandHandlerResult<unknown>,
): void {
  const { contract } = plan;
  if (contract.aggregate !== envelope.aggregateType) {
    throw contractError(
      `${contract.key} targets aggregate '${contract.aggregate}', not '${envelope.aggregateType}'.`,
    );
  }
  if (contract.requiresExpectedVersion && envelope.expectedVersion === null) {
    throw contractError(`${contract.key} requires expectedVersion.`);
  }
  if (contract.auditRequired && !result.audit) {
    throw contractError(`${contract.key} must write an audit fact.`);
  }
  const emitted = new Set((result.events ?? []).map((event) => event.eventType));
  const missingEvents = contract.emits.filter((eventType) => !emitted.has(eventType));
  if (missingEvents.length > 0) {
    throw contractError(
      `${contract.key} did not emit required event(s): ${missingEvents.join(", ")}.`,
    );
  }
}

/**
 * Pure structural/capability validation used by Catalog and SDK tests.
 */
export function validateModuleCommandContracts(
  manifest: ModuleManifest,
  availableCapabilities: CommandCapabilityProviderDeclaration[] = [
    ...getRegisteredCommandEffectProviders(),
    ...(manifest.domain?.capabilities?.provides ?? []),
  ],
): string[] {
  if (!manifest.domain) return [];
  const issues: string[] = [];
  const objects = new Map(manifest.objects.map((object) => [object.key, object]));
  const permissions = new Set(manifest.permissions ?? []);
  const aggregates = new Map<string, (typeof manifest.domain.aggregates)[number]>();
  const commandKeys = new Set<string>();

  for (const aggregate of manifest.domain.aggregates) {
    if (aggregates.has(aggregate.key)) {
      issues.push(`duplicate aggregate contract '${aggregate.key}'`);
      continue;
    }
    aggregates.set(aggregate.key, aggregate);
    const object = objects.get(aggregate.key);
    if (!object) {
      issues.push(`aggregate '${aggregate.key}' is not declared in objects[]`);
      continue;
    }
    for (const field of [aggregate.stateField, aggregate.versionField]) {
      if (!object.fields.some((candidate) => candidate.key === field)) {
        issues.push(`aggregate '${aggregate.key}' field '${field}' is not declared`);
      }
    }
  }

  for (const command of manifest.domain.commands) {
    if (commandKeys.has(command.key)) issues.push(`duplicate command contract '${command.key}'`);
    commandKeys.add(command.key);
    if (!valid(command.contractVersion)) {
      issues.push(`command '${command.key}' has invalid contractVersion '${command.contractVersion}'`);
    }
    const aggregate = aggregates.get(command.aggregate);
    if (!aggregate) {
      issues.push(`command '${command.key}' references undeclared aggregate '${command.aggregate}'`);
      continue;
    }
    if (!permissions.has(command.permission)) {
      issues.push(`command '${command.key}' references undeclared permission '${command.permission}'`);
    }
    for (const requirement of command.requiresModules) {
      if (!validRange(requirement.version)) {
        issues.push(
          `command '${command.key}' has invalid Module range '${requirement.id}@${requirement.version}'`,
        );
      }
    }
    const stateField = objects.get(aggregate.key)?.fields.find(
      (field) => field.key === aggregate.stateField,
    );
    const options = stateField?.validation?.options;
    if (Array.isArray(options) && command.transition) {
      const allowedStates = new Set(options.filter((value): value is string => typeof value === "string"));
      const targetStates = Array.isArray(command.transition.to)
        ? command.transition.to
        : [command.transition.to];
      for (const state of [...command.transition.from, ...targetStates]) {
        if (!allowedStates.has(state)) {
          issues.push(`command '${command.key}' uses undeclared state '${state}'`);
        }
      }
    }
    for (const requirement of command.requiredEffects) {
      if (!validRange(requirement.version)) {
        issues.push(
          `command '${command.key}' has invalid capability range '${requirement.capability}@${requirement.version}'`,
        );
        continue;
      }
      if (!availableCapabilities.some((provider) => providerMatches(requirement, provider))) {
        issues.push(
          `command '${command.key}' requires unavailable capability `
          + `'${requirement.capability}@${requirement.version}' (${requirement.consistency})`,
        );
      }
    }
  }
  return issues;
}

/** Validate a Platform Service manifest without requiring catalog objects. */
export function validatePlatformServiceCommandContracts(
  manifest: PlatformServiceContractManifest,
  availableCapabilities: CommandCapabilityProviderDeclaration[] = [
    ...getRegisteredCommandEffectProviders(),
    ...(manifest.domain.capabilities?.provides ?? []),
  ],
): string[] {
  const issues: string[] = [];
  const permissions = new Set(manifest.permissions);
  const aggregates = new Map<string, (typeof manifest.domain.aggregates)[number]>();
  const commandKeys = new Set<string>();

  for (const aggregate of manifest.domain.aggregates) {
    if (aggregates.has(aggregate.key)) {
      issues.push(`duplicate aggregate contract '${aggregate.key}'`);
      continue;
    }
    aggregates.set(aggregate.key, aggregate);
  }

  for (const command of manifest.domain.commands) {
    if (commandKeys.has(command.key)) issues.push(`duplicate command contract '${command.key}'`);
    commandKeys.add(command.key);
    if (!valid(command.contractVersion)) {
      issues.push(`command '${command.key}' has invalid contractVersion '${command.contractVersion}'`);
    }
    const aggregate = aggregates.get(command.aggregate);
    if (!aggregate) {
      issues.push(`command '${command.key}' references undeclared aggregate '${command.aggregate}'`);
      continue;
    }
    if (!permissions.has(command.permission)) {
      issues.push(`command '${command.key}' references undeclared permission '${command.permission}'`);
    }
    if (command.transition) {
      const states = new Set(aggregate.states);
      const targets = Array.isArray(command.transition.to)
        ? command.transition.to
        : [command.transition.to];
      for (const state of [...command.transition.from, ...targets]) {
        if (!states.has(state)) {
          issues.push(`command '${command.key}' uses undeclared state '${state}'`);
        }
      }
    }
    for (const requirement of command.requiresModules) {
      if (!validRange(requirement.version)) {
        issues.push(
          `command '${command.key}' has invalid Module range '${requirement.id}@${requirement.version}'`,
        );
      }
    }
    for (const requirement of command.requiredEffects) {
      if (!validRange(requirement.version)) {
        issues.push(
          `command '${command.key}' has invalid capability range '${requirement.capability}@${requirement.version}'`,
        );
      } else if (!availableCapabilities.some((provider) => providerMatches(requirement, provider))) {
        issues.push(
          `command '${command.key}' requires unavailable capability `
          + `'${requirement.capability}@${requirement.version}' (${requirement.consistency})`,
        );
      }
    }
  }
  return issues;
}

// ── Initial platform capability providers ──

function assertEffectCardinality(
  commandType: string,
  requirement: CommandEffectRequirement,
  count: number,
  noun: string,
): void {
  const satisfied =
    requirement.cardinality === "one" ? count === 1
      : requirement.cardinality === "zero_or_one" ? count <= 1
        : requirement.cardinality === "one_or_more" ? count >= 1
          : true;
  if (!satisfied) {
    throw contractError(
      `${commandType} expected ${requirement.cardinality} ${noun}, found ${count}.`,
    );
  }
}

registerCommandEffectProvider({
  capability: "scheduling.complete_reservation",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const active = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.scheduleEntries}
       WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
         AND status IN ('tentative', 'confirmed')`,
      [envelope.workspaceId, envelope.aggregateType, envelope.aggregateId],
    );
    const count = active?.count ?? 0;
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      count,
      "active Schedule reservation(s)",
    );
    return [{
      sql: `UPDATE ${TABLES.scheduleEntries}
            SET status = 'completed', version = version + 1, updated_at = ?
            WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
              AND status IN ('tentative', 'confirmed')`,
      args: [envelope.occurredAt, envelope.workspaceId, envelope.aggregateType, envelope.aggregateId],
    }];
  },
});

registerCommandEffectProvider({
  capability: "fsm.activate_visit_execution",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.visitExecutionItems}
       WHERE workspace_id = ? AND visit_id = ? AND status = 'ready'`,
      [envelope.workspaceId, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "ready Visit execution item(s)",
    );
    return [{
      sql: `UPDATE ${TABLES.visitExecutionItems}
            SET status = 'active', updated_at = ?
            WHERE workspace_id = ? AND visit_id = ? AND status = 'ready'`,
      args: [envelope.occurredAt, envelope.workspaceId, envelope.aggregateId],
    }];
  },
});

registerCommandEffectProvider({
  capability: "fsm.cancel_visit_execution",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.visitExecutionItems}
       WHERE workspace_id = ? AND visit_id = ? AND status IN ('ready', 'active')`,
      [envelope.workspaceId, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "active Visit execution item(s)",
    );
    return [{
      sql: `UPDATE ${TABLES.visitExecutionItems}
            SET status = 'cancelled', updated_at = ?
            WHERE workspace_id = ? AND visit_id = ? AND status IN ('ready', 'active')`,
      args: [envelope.occurredAt, envelope.workspaceId, envelope.aggregateId],
    }];
  },
});

registerCommandEffectProvider({
  capability: "scheduling.cancel_reservation",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.scheduleEntries}
       WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
         AND status IN ('tentative', 'confirmed')`,
      [envelope.workspaceId, envelope.aggregateType, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "active Schedule reservation(s)",
    );
    return [{
      sql: `UPDATE ${TABLES.scheduleEntries}
            SET status = 'cancelled', version = version + 1, updated_at = ?
            WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
              AND status IN ('tentative', 'confirmed')`,
      args: [
        envelope.occurredAt,
        envelope.workspaceId,
        envelope.aggregateType,
        envelope.aggregateId,
      ],
    }];
  },
});

registerCommandEffectProvider({
  capability: "assignment.release_subject",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.assignments}
       WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
         AND status IN ('proposed', 'assigned', 'accepted')`,
      [envelope.workspaceId, envelope.aggregateType, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "active Assignment(s)",
    );
    return [{
      sql: `UPDATE ${TABLES.assignments}
            SET status = 'released', effective_to = ?, version = version + 1, updated_at = ?
            WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
              AND status IN ('proposed', 'assigned', 'accepted')`,
      args: [
        envelope.occurredAt,
        envelope.occurredAt,
        envelope.workspaceId,
        envelope.aggregateType,
        envelope.aggregateId,
      ],
    }];
  },
});

registerCommandEffectProvider({
  capability: "fsm.cancel_work_order_visits",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${businessTable("service_visit")}
       WHERE workspace_id = ? AND work_order_id = ?
         AND status NOT IN ('completed', 'cancelled')`,
      [envelope.workspaceId, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "non-terminal Service Visit(s)",
    );
    return [{
      sql: `UPDATE ${businessTable("service_visit")}
            SET status = 'cancelled', aggregate_version = aggregate_version + 1, updated_at = ?
            WHERE workspace_id = ? AND work_order_id = ?
              AND status NOT IN ('completed', 'cancelled')`,
      args: [envelope.occurredAt, envelope.workspaceId, envelope.aggregateId],
    }];
  },
});

interface CreateDispatchedVisitRequirementInput {
  requirementId: string;
  workItemId: string;
  bindingId: string;
  formDefinitionId: string;
  formVersionId: string;
  label: string;
}

interface CreateDispatchedVisitEffectInput {
  visitId: string;
  assignmentId: string;
  scheduleEntryId: string;
  executionItemId: string;
  workOrderId: string;
  technicianId: string;
  resourceId: string;
  resourceUserId: string | null;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  notes: string | null;
  scheduleStatus: "tentative" | "confirmed";
  conflictState: "conflict" | "none";
  requirements: CreateDispatchedVisitRequirementInput[];
}

function parseCreateDispatchedVisitEffectInput(
  commandType: string,
  input: unknown,
): CreateDispatchedVisitEffectInput {
  const invalid = (): never => {
    throw contractError(
      `${commandType} did not provide a valid effect input for fsm.create_dispatched_visit.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  const requiredStrings = [
    "visitId", "assignmentId", "scheduleEntryId", "executionItemId",
    "workOrderId", "technicianId", "resourceId", "title",
    "scheduledStart", "scheduledEnd",
  ];
  if (requiredStrings.some((key) => typeof value[key] !== "string" || value[key] === "")) invalid();
  if (value.resourceUserId !== null && typeof value.resourceUserId !== "string") invalid();
  if (value.notes !== null && typeof value.notes !== "string") invalid();
  if (!(["tentative", "confirmed"] as unknown[]).includes(value.scheduleStatus)) invalid();
  if (!(["conflict", "none"] as unknown[]).includes(value.conflictState)) invalid();
  if (!Array.isArray(value.requirements)) invalid();
  const requirements = value.requirements as unknown[];
  if (requirements.length === 0) invalid();
  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) invalid();
    const row = requirement as Record<string, unknown>;
    if ([
      "requirementId", "workItemId", "bindingId", "formDefinitionId",
      "formVersionId", "label",
    ].some((key) => typeof row[key] !== "string" || row[key] === "")) invalid();
  }
  return value as unknown as CreateDispatchedVisitEffectInput;
}

registerCommandEffectProvider({
  capability: "fsm.create_dispatched_visit",
  version: "1.0.0",
  consistency: "atomic",
  prepare: ({ envelope, requirement, effectInput }) => {
    const input = parseCreateDispatchedVisitEffectInput(envelope.commandType, effectInput);
    assertEffectCardinality(envelope.commandType, requirement, 1, "Service Visit creation request(s)");
    const ts = envelope.occurredAt;
    return [
      {
        sql: `INSERT INTO ${TABLES.assignments}
              (id, workspace_id, subject_type, subject_id, resource_id, role_key,
               status, proposed_by, effective_from, version, created_at, updated_at)
              VALUES (?, ?, 'service_visit', ?, ?, 'primary', 'assigned', ?, ?, 1, ?, ?)`,
        args: [
          input.assignmentId, envelope.workspaceId, input.visitId, input.resourceId,
          envelope.actor.id, input.scheduledStart, ts, ts,
        ],
      },
      {
        sql: `INSERT INTO ${TABLES.scheduleEntries}
              (id, workspace_id, subject_type, subject_id, resource_id, start_at, end_at,
               timezone, status, conflict_state, version, created_at, updated_at)
              VALUES (?, ?, 'service_visit', ?, ?, ?, ?, 'UTC', ?, ?, 1, ?, ?)`,
        args: [
          input.scheduleEntryId, envelope.workspaceId, input.visitId, input.resourceId,
          input.scheduledStart, input.scheduledEnd, input.scheduleStatus,
          input.conflictState, ts, ts,
        ],
      },
      {
        sql: `INSERT INTO ${businessTable("service_visit")}
              (id, workspace_id, title, work_order_id, technician_id,
               scheduled_start, scheduled_end, actual_start, actual_end,
               status, notes, aggregate_version, assignment_id, schedule_entry_id, outcome,
               created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'scheduled', ?, 1, ?, ?, NULL, ?, ?)`,
        args: [
          input.visitId, envelope.workspaceId, input.title, input.workOrderId,
          input.technicianId, input.scheduledStart, input.scheduledEnd, input.notes,
          input.assignmentId, input.scheduleEntryId, ts, ts,
        ],
      },
      {
        sql: `INSERT INTO ${TABLES.visitExecutionItems}
              (id, workspace_id, visit_id, resource_id, assignment_id, schedule_entry_id,
               status, due_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)`,
        args: [
          input.executionItemId, envelope.workspaceId, input.visitId, input.resourceId,
          input.assignmentId, input.scheduleEntryId, input.scheduledEnd, ts, ts,
        ],
      },
      ...input.requirements.flatMap((item) => [
        {
          sql: `INSERT INTO ${TABLES.workItems}
                (id, workspace_id, instance_id, step_id, kind, status,
                 subject_type, subject_id, assignee_type, assignee_id,
                 candidate_rule_json, form_binding_id, due_at, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'human_task', 'ready', 'service_visit', ?, ?, ?, NULL, ?, ?, 1, ?, ?)`,
          args: [
            item.workItemId, envelope.workspaceId, `visit_execution:${input.visitId}`,
            item.requirementId, input.visitId, input.resourceUserId ? "user" : null,
            input.resourceUserId, item.bindingId, input.scheduledEnd, ts, ts,
          ],
        },
        {
          sql: `INSERT INTO ${TABLES.visitExecutionRequirements}
                (id, workspace_id, visit_id, binding_id, form_definition_id, form_version_id,
                 label, requirement_policy, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'required', ?)`,
          args: [
            item.requirementId, envelope.workspaceId, input.visitId, item.bindingId,
            item.formDefinitionId, item.formVersionId, item.label, ts,
          ],
        },
      ]),
    ];
  },
});

interface PersistQuoteCalculationEffectInput {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  lineTotals: Array<{ lineId: string; lineTotal: number }>;
}

function parsePersistQuoteCalculationEffectInput(
  commandType: string,
  input: unknown,
): PersistQuoteCalculationEffectInput {
  const invalid = (): never => {
    throw contractError(
      `${commandType} did not provide a valid effect input for quote.persist_calculation.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  for (const key of ["subtotal", "discountTotal", "taxTotal", "grandTotal"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) invalid();
  }
  if (!Array.isArray(value.lineTotals)) invalid();
  const lineTotals = value.lineTotals as unknown[];
  for (const item of lineTotals) {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid();
    const row = item as Record<string, unknown>;
    if (typeof row.lineId !== "string" || row.lineId === "") invalid();
    if (typeof row.lineTotal !== "number" || !Number.isFinite(row.lineTotal)) invalid();
  }
  return value as unknown as PersistQuoteCalculationEffectInput;
}

registerCommandEffectProvider({
  capability: "quote.persist_calculation",
  version: "1.0.0",
  consistency: "atomic",
  prepare: ({ envelope, requirement, effectInput }) => {
    const input = parsePersistQuoteCalculationEffectInput(envelope.commandType, effectInput);
    assertEffectCardinality(envelope.commandType, requirement, 1, "Quote calculation(s)");
    return [
      ...input.lineTotals.map((line) => ({
        sql: `UPDATE ${businessTable("quote_line")}
              SET line_total = ?, updated_at = ?
              WHERE workspace_id = ? AND quote_id = ? AND id = ?`,
        args: [
          line.lineTotal, envelope.occurredAt, envelope.workspaceId,
          envelope.aggregateId, line.lineId,
        ],
      })),
      {
        sql: `UPDATE ${businessTable("quote")}
              SET subtotal = ?, discount_total = ?, tax_total = ?, grand_total = ?, updated_at = ?
              WHERE workspace_id = ? AND id = ?`,
        args: [
          input.subtotal, input.discountTotal, input.taxTotal, input.grandTotal,
          envelope.occurredAt, envelope.workspaceId, envelope.aggregateId,
        ],
      },
    ];
  },
});

interface CreateQuoteRevisionCopyEffectInput {
  newQuoteId: string;
  newQuoteNumber: string;
  rootQuoteId: string;
  newRevisionNumber: number;
  lineCopies: Array<{ sourceLineId: string; newLineId: string }>;
}

function parseCreateQuoteRevisionCopyEffectInput(
  commandType: string,
  input: unknown,
): CreateQuoteRevisionCopyEffectInput {
  const invalid = (): never => {
    throw contractError(
      `${commandType} did not provide a valid effect input for quote.create_revision_copy.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  for (const key of ["newQuoteId", "newQuoteNumber", "rootQuoteId"]) {
    if (typeof value[key] !== "string" || value[key] === "") invalid();
  }
  if (!Number.isInteger(value.newRevisionNumber) || (value.newRevisionNumber as number) < 1) invalid();
  if (!Array.isArray(value.lineCopies)) invalid();
  const lineCopies = value.lineCopies as unknown[];
  for (const item of lineCopies) {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid();
    const row = item as Record<string, unknown>;
    if (typeof row.sourceLineId !== "string" || row.sourceLineId === "") invalid();
    if (typeof row.newLineId !== "string" || row.newLineId === "") invalid();
  }
  return value as unknown as CreateQuoteRevisionCopyEffectInput;
}

registerCommandEffectProvider({
  capability: "quote.create_revision_copy",
  version: "1.0.0",
  consistency: "atomic",
  prepare: ({ envelope, requirement, effectInput }) => {
    const input = parseCreateQuoteRevisionCopyEffectInput(envelope.commandType, effectInput);
    assertEffectCardinality(envelope.commandType, requirement, 1, "Quote revision copy request(s)");
    const ts = envelope.occurredAt;
    return [
      {
        sql: `INSERT INTO ${businessTable("quote")}
              (id, workspace_id, quote_number, title, status, version, aggregate_version,
               company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id,
               currency, subtotal, discount_total, tax_total, grand_total,
               valid_until, owner, terms, notes,
               root_quote_id, previous_version_id, revision_number,
               price_book_id, approved_at, accepted_at, rejected_reason, withdrawn_at,
               snapshot_hash, locked_at, created_at, updated_at)
              SELECT ?, ?, ?, title, 'draft', 1, 1,
               company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id,
               currency, NULL, NULL, NULL, NULL,
               valid_until, owner, terms, notes,
               ?, ?, ?, price_book_id, NULL, NULL, NULL, NULL,
               NULL, NULL, ?, ?
              FROM ${businessTable("quote")}
              WHERE workspace_id = ? AND id = ?`,
        args: [
          input.newQuoteId, envelope.workspaceId, input.newQuoteNumber,
          input.rootQuoteId, envelope.aggregateId, input.newRevisionNumber,
          ts, ts, envelope.workspaceId, envelope.aggregateId,
        ],
      },
      ...input.lineCopies.map((line) => ({
        sql: `INSERT INTO ${businessTable("quote_line")}
              (id, workspace_id, quote_id, product_service_id, description, quantity, unit,
               unit_price, discount_amount, tax_amount, line_total, sort_order, created_at, updated_at)
              SELECT ?, workspace_id, ?, product_service_id, description, quantity, unit,
               unit_price, discount_amount, tax_amount, line_total, sort_order, ?, ?
              FROM ${businessTable("quote_line")}
              WHERE workspace_id = ? AND quote_id = ? AND id = ?`,
        args: [
          line.newLineId, input.newQuoteId, ts, ts, envelope.workspaceId,
          envelope.aggregateId, line.sourceLineId,
        ],
      })),
    ];
  },
});

interface StartWorkflowProcessEffectInput {
  workflowKey: string;
  instanceId: string;
  workItemId: string;
}

function parseStartWorkflowProcessEffectInput(
  commandType: string,
  input: unknown,
): StartWorkflowProcessEffectInput {
  const invalid = (): never => {
    throw contractError(
      `${commandType} did not provide a valid effect input for workflow.start_process.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  for (const key of ["workflowKey", "instanceId", "workItemId"]) {
    if (typeof value[key] !== "string" || value[key] === "") invalid();
  }
  return value as unknown as StartWorkflowProcessEffectInput;
}

registerCommandEffectProvider({
  capability: "workflow.start_process",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement, effectInput }) => {
    const input = parseStartWorkflowProcessEffectInput(envelope.commandType, effectInput);
    assertEffectCardinality(envelope.commandType, requirement, 1, "Workflow start request(s)");
    const definition = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.workflowDefinitions}
       WHERE workspace_id = ? AND workflow_id = ?`,
      [envelope.workspaceId, input.workflowKey],
    );
    if (!definition) {
      throw contractError(
        `${envelope.commandType} requires installed Workflow '${input.workflowKey}'.`,
      );
    }
    const version = await queryOne<{ id: string; definition_json: string }>(
      `SELECT id, definition_json FROM ${TABLES.workflowDefinitionVersions}
       WHERE workflow_definition_id = ? ORDER BY version_number DESC LIMIT 1`,
      [definition.id],
    );
    if (!version) {
      throw contractError(
        `${envelope.commandType} requires a published version of Workflow '${input.workflowKey}'.`,
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(version.definition_json);
    } catch {
      throw contractError(`Workflow '${input.workflowKey}' has invalid definition JSON.`);
    }
    if (!decoded || typeof decoded !== "object" || !Array.isArray((decoded as { steps?: unknown }).steps)) {
      throw contractError(`Workflow '${input.workflowKey}' has no executable steps.`);
    }
    type WorkflowStep = {
      id?: string;
      kind?: string;
      next?: string;
      command?: string;
      assigneeRule?: { permissionGroup?: string; userId?: string };
      formBindingId?: string;
    };
    const steps = (decoded as { steps: WorkflowStep[] }).steps;
    const start = steps.find((step) => step.kind === "start");
    let actionable = start?.next ? steps.find((step) => step.id === start.next) : undefined;
    if (actionable?.kind === "system_command" && actionable.command === envelope.commandType) {
      actionable = actionable.next ? steps.find((step) => step.id === actionable!.next) : undefined;
    }
    if (!actionable?.id || !["approval", "human_task"].includes(actionable.kind ?? "")) {
      throw contractError(
        `Workflow '${input.workflowKey}' does not lead ${envelope.commandType} to an actionable step.`,
      );
    }
    const assigneeRule = actionable.assigneeRule;
    const assigneeType = assigneeRule?.permissionGroup
      ? "permission_group"
      : assigneeRule?.userId ? "user" : null;
    const assigneeId = assigneeRule?.permissionGroup ?? assigneeRule?.userId ?? null;
    const ts = envelope.occurredAt;
    return [
      {
        sql: `INSERT INTO ${TABLES.workflowInstances}
              (id, workspace_id, workflow_definition_id, definition_version_id,
               object_type, record_id, status, current_step_id, version,
               started_by, started_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'running', ?, 1, ?, ?, ?, ?)`,
        args: [
          input.instanceId, envelope.workspaceId, definition.id, version.id,
          envelope.aggregateType, envelope.aggregateId, actionable.id,
          envelope.actor.id, ts, ts, ts,
        ],
      },
      {
        sql: `INSERT INTO ${TABLES.workflowEvents}
              (id, workspace_id, instance_id, sequence, event_type, step_id,
               actor_type, actor_id, payload_json, occurred_at)
              VALUES (?, ?, ?, 1, 'workflow.started', ?, ?, ?, ?, ?)`,
        args: [
          genId("wfe"), envelope.workspaceId, input.instanceId, "start",
          envelope.actor.type, envelope.actor.id,
          JSON.stringify({
            workflowKey: input.workflowKey,
            objectType: envelope.aggregateType,
            recordId: envelope.aggregateId,
          }),
          ts,
        ],
      },
      {
        sql: `INSERT INTO ${TABLES.workItems}
              (id, workspace_id, instance_id, step_id, kind, status,
               subject_type, subject_id, assignee_type, assignee_id,
               candidate_rule_json, form_binding_id, due_at, version, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
        args: [
          input.workItemId, envelope.workspaceId, input.instanceId, actionable.id,
          actionable.kind, envelope.aggregateType, envelope.aggregateId,
          assigneeType, assigneeId, assigneeRule ? JSON.stringify(assigneeRule) : null,
          actionable.formBindingId ?? null, ts, ts,
        ],
      },
    ];
  },
});

interface CreateWorkOrderFromQuoteEffectInput {
  workOrderId: string;
  workOrderNumber: string;
  title: string;
  description: string;
  companyId: string | null;
  contactId: string | null;
  snapshotHash: string;
}

function parseCreateWorkOrderFromQuoteEffectInput(
  commandType: string,
  input: unknown,
): CreateWorkOrderFromQuoteEffectInput {
  const invalid = (): never => {
    throw contractError(
      `${commandType} did not provide a valid effect input for fsm.create_work_order_from_quote.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  for (const key of ["workOrderId", "workOrderNumber", "title", "description", "snapshotHash"]) {
    if (typeof value[key] !== "string" || value[key] === "") invalid();
  }
  for (const key of ["companyId", "contactId"]) {
    if (value[key] !== null && typeof value[key] !== "string") invalid();
  }
  return value as unknown as CreateWorkOrderFromQuoteEffectInput;
}

registerCommandEffectProvider({
  capability: "fsm.create_work_order_from_quote",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement, effectInput }) => {
    const existing = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${businessTable("work_order")}
       WHERE workspace_id = ? AND source_type = 'quote' AND source_id = ?`,
      [envelope.workspaceId, envelope.aggregateId],
    );
    const count = existing?.count ?? 0;
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      count,
      "existing Work Order conversion(s)",
    );
    if (effectInput === undefined) {
      if (count !== 1) {
        throw contractError(
          `${envelope.commandType} omitted its creation input without an existing Work Order.`,
        );
      }
      return [];
    }
    if (count !== 0) {
      throw contractError(
        `${envelope.commandType} cannot create a duplicate Work Order for Quote '${envelope.aggregateId}'.`,
      );
    }
    const input = parseCreateWorkOrderFromQuoteEffectInput(envelope.commandType, effectInput);
    const ts = envelope.occurredAt;
    return [{
      sql: `INSERT INTO ${businessTable("work_order")}
            (id, workspace_id, title, description, status, priority,
             company_id, contact_id, service_site_id, asset_id,
             source_type, source_id, source_snapshot_hash,
             work_order_number, aggregate_version,
             requested_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'new', 'medium',
             ?, ?, NULL, NULL,
             'quote', ?, ?,
             ?, 1,
             ?, ?, ?)`,
      args: [
        input.workOrderId, envelope.workspaceId, input.title, input.description,
        input.companyId, input.contactId, envelope.aggregateId, input.snapshotHash,
        input.workOrderNumber, ts, ts, ts,
      ],
    }];
  },
});

// Static registration is the compatibility bridge while installed Manifest
// contracts are moved into a workspace-scoped registry. Architecture tests
// require these definitions to match the official Module manifests.
for (const contract of [
  {
    key: "visit.complete",
    contractVersion: "1.0.0",
    aggregate: "service_visit",
    operation: "transition" as const,
    transition: { from: ["on_site"], to: "completed" },
    permission: "visit.execute",
    idempotent: true,
    requiresExpectedVersion: true,
    requiresModules: [],
    requiredEffects: [{
      capability: "scheduling.complete_reservation",
      version: "^1.0.0",
      scope: "linked_schedule",
      consistency: "atomic" as const,
      cardinality: "one" as const,
    }],
    emits: ["visit.completed"],
    auditRequired: true,
    postconditions: [
      "service_visit.status == completed",
      "service_visit.actual_end != null",
      "visit_execution.status == completed",
      "linked_schedule.status == completed",
    ],
  },
  {
    key: "work_order.complete",
    contractVersion: "1.0.0",
    aggregate: "work_order",
    operation: "transition" as const,
    transition: { from: ["in_progress"], to: "completed" },
    permission: "work_order.complete",
    idempotent: true,
    requiresExpectedVersion: true,
    requiresModules: [],
    requiredEffects: [{
      capability: "scheduling.complete_reservation",
      version: "^1.0.0",
      scope: "subject_schedule",
      consistency: "atomic" as const,
      cardinality: "zero_or_more" as const,
    }],
    emits: ["work_order.completed"],
    auditRequired: true,
    postconditions: [
      "work_order.status == completed",
      "work_order.completed_at != null",
      "subject_schedule.status == completed",
    ],
  },
] satisfies CommandContract[]) {
  registerCommandContract(contract);
}
