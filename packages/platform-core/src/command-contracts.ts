import {
  commandContractSchema,
  type CommandCapabilityProviderDeclaration,
  type CommandContract,
  type CommandEffectRequirement,
  type ModuleManifest,
} from "@runory/contracts";
import { satisfies, valid, validRange } from "semver";
import { TABLES } from "./contracts";
import { BusinessError } from "./context";
import { queryOne } from "./db";
import { ERROR_CODES } from "./errors";
import type { CommandEnvelope, CommandHandlerResult } from "./command-runtime";

export interface CommandEffectProvider extends CommandCapabilityProviderDeclaration {
  prepare(context: {
    envelope: CommandEnvelope;
    requirement: CommandEffectRequirement;
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

export async function prepareCommandContractEffects(
  plan: ResolvedCommandPlan,
  envelope: CommandEnvelope,
): Promise<Array<{ sql: string; args?: unknown[] }>> {
  const statements: Array<{ sql: string; args?: unknown[] }> = [];
  for (const effect of plan.effects) {
    const prepared = await effect.provider.prepare({
      envelope,
      requirement: effect.requirement,
    });
    if (effect.requirement.consistency === "atomic" && prepared.length === 0) {
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
    const stateField = objects.get(aggregate.key)?.fields.find(
      (field) => field.key === aggregate.stateField,
    );
    const options = stateField?.validation?.options;
    if (Array.isArray(options)) {
      const allowedStates = new Set(options.filter((value): value is string => typeof value === "string"));
      for (const state of [...command.transition.from, command.transition.to]) {
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

// ── Initial platform capability providers ──

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
    const cardinalitySatisfied =
      requirement.cardinality === "one" ? count === 1
        : requirement.cardinality === "zero_or_one" ? count <= 1
          : requirement.cardinality === "one_or_more" ? count >= 1
            : true;
    if (!cardinalitySatisfied) {
      throw contractError(
        `${envelope.commandType} expected ${requirement.cardinality} active Schedule reservation(s), found ${count}.`,
      );
    }
    return [{
      sql: `UPDATE ${TABLES.scheduleEntries}
            SET status = 'completed', version = version + 1, updated_at = ?
            WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
              AND status IN ('tentative', 'confirmed')`,
      args: [envelope.occurredAt, envelope.workspaceId, envelope.aggregateType, envelope.aggregateId],
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
    transition: { from: ["on_site"], to: "completed" },
    permission: "visit.execute",
    idempotent: true,
    requiresExpectedVersion: true,
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
    transition: { from: ["in_progress"], to: "completed" },
    permission: "work_order.complete",
    idempotent: true,
    requiresExpectedVersion: true,
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
