import type {
  AggregateLifecycle,
  CommandAvailabilityPredicate,
  CommandCapabilityProviderDeclaration,
  ModuleManifest,
  PlatformServiceContractManifest,
} from "@runory/contracts";

type CatalogObject = ModuleManifest["objects"][number];
import { valid, validRange } from "semver";
import {
  commandEffectProviderMatches,
  getRegisteredCommandEffectProviders,
} from "./registry";

/** Pure structural/capability validation used by Catalog and SDK tests. */
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
      if (field === null || field === undefined) continue;
      if (!object.fields.some((candidate) => candidate.key === field)) {
        issues.push(`aggregate '${aggregate.key}' field '${field}' is not declared`);
      }
    }
    if (aggregate.lifecycle) {
      issues.push(...validateAggregateLifecycle(
        aggregate.key,
        aggregate.lifecycle,
        object,
        aggregate.stateField,
        declaredStates(object, aggregate.stateField),
      ));
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
      const allowedStates = new Set(options.filter(
        (value): value is string => typeof value === "string",
      ));
      const targetStates = Array.isArray(command.transition.to)
        ? command.transition.to
        : [command.transition.to];
      for (const state of [...command.transition.from, ...targetStates]) {
        if (!allowedStates.has(state)) {
          issues.push(`command '${command.key}' uses undeclared state '${state}'`);
        }
      }
    }
    const object = objects.get(aggregate.key);
    if (command.intent === "advance" && aggregate.lifecycle && command.transition) {
      const offSpine = new Set([
        ...aggregate.lifecycle.interrupts,
        ...aggregate.lifecycle.terminals,
      ]);
      const targets = Array.isArray(command.transition.to)
        ? command.transition.to
        : [command.transition.to];
      for (const target of targets.filter((state) => offSpine.has(state))) {
        issues.push(
          `command '${command.key}' is declared as intent 'advance' but targets `
          + `off-spine state '${target}'; use 'decide' or 'escape_hatch'`,
        );
      }
    }
    if (command.intent && command.operation === "action" && command.availableWhen.length === 0) {
      issues.push(
        `command '${command.key}' is an action on the record command surface, so it `
        + "must declare availableWhen; a transition would otherwise be implied",
      );
    }
    if (object) {
      issues.push(...validatePredicateFields(
        command.key,
        "availableWhen",
        command.availableWhen,
        object,
      ));
    }
    if (command.initiatedFrom) {
      const source = objects.get(command.initiatedFrom.aggregate);
      // A create Command may be initiated from an aggregate owned by another
      // Module, which this manifest cannot see; cross-module field checks
      // belong to catalog-wide validation.
      if (source) {
        issues.push(...validatePredicateFields(
          command.key,
          "initiatedFrom.when",
          command.initiatedFrom.when,
          source,
        ));
      }
    }
    for (const requirement of command.requiredEffects) {
      if (!validRange(requirement.version)) {
        issues.push(
          `command '${command.key}' has invalid capability range '${requirement.capability}@${requirement.version}'`,
        );
        continue;
      }
      if (!availableCapabilities.some(
        (provider) => commandEffectProviderMatches(requirement, provider),
      )) {
        issues.push(
          `command '${command.key}' requires unavailable capability `
          + `'${requirement.capability}@${requirement.version}' (${requirement.consistency})`,
        );
      }
    }
  }
  return issues;
}

function declaredStates(object: CatalogObject, stateField: string): string[] | null {
  const field = object.fields.find((candidate) => candidate.key === stateField);
  const options = field?.validation?.options;
  if (!Array.isArray(options)) return null;
  return options.filter((value): value is string => typeof value === "string");
}

/**
 * A lifecycle must partition the declared states exactly once each.
 *
 * This is the check that keeps the declaration honest over time: adding a state
 * to the field without deciding whether it advances, pauses or ends the record
 * fails the Catalog build instead of silently leaving surfaces to guess.
 */
function validateAggregateLifecycle(
  aggregateKey: string,
  lifecycle: AggregateLifecycle,
  object: CatalogObject,
  stateField: string,
  states: string[] | null,
): string[] {
  const issues: string[] = [];
  const aliasKeys = Object.keys(lifecycle.aliases);
  const classified = new Map<string, string>();
  for (const [group, members] of [
    ["spine", lifecycle.spine],
    ["aliases", aliasKeys],
    ["interrupts", lifecycle.interrupts],
    ["terminals", lifecycle.terminals],
  ] as const) {
    for (const state of members) {
      const existing = classified.get(state);
      if (existing) {
        issues.push(
          `aggregate '${aggregateKey}' lifecycle classifies state '${state}' as both `
          + `${existing} and ${group}`,
        );
        continue;
      }
      classified.set(state, group);
    }
  }

  const spine = new Set(lifecycle.spine);
  for (const [alias, target] of Object.entries(lifecycle.aliases)) {
    if (!spine.has(target)) {
      issues.push(
        `aggregate '${aggregateKey}' lifecycle alias '${alias}' points at '${target}', `
        + "which is not on the spine",
      );
    }
  }

  if (!states) {
    issues.push(
      `aggregate '${aggregateKey}' declares a lifecycle but state field `
      + `'${object.key}.${stateField}' declares no closed option list`,
    );
  } else {
    const declared = new Set(states);
    for (const state of classified.keys()) {
      if (!declared.has(state)) {
        issues.push(
          `aggregate '${aggregateKey}' lifecycle classifies undeclared state '${state}'`,
        );
      }
    }
    for (const state of declared) {
      if (!classified.has(state)) {
        issues.push(
          `aggregate '${aggregateKey}' state '${state}' is not classified by the `
          + "lifecycle (spine, aliases, interrupts or terminals)",
        );
      }
    }
  }

  for (const [state, evidence] of Object.entries(lifecycle.evidence)) {
    if (!classified.has(state)) {
      issues.push(
        `aggregate '${aggregateKey}' lifecycle evidence targets unclassified state '${state}'`,
      );
    }
    if (evidence.timestampField
      && !object.fields.some((field) => field.key === evidence.timestampField)) {
      issues.push(
        `aggregate '${aggregateKey}' lifecycle evidence for '${state}' reads undeclared `
        + `field '${evidence.timestampField}'`,
      );
    }
  }
  return issues;
}

function validatePredicateFields(
  commandKey: string,
  declaration: string,
  predicates: CommandAvailabilityPredicate[],
  object: CatalogObject,
): string[] {
  return predicates
    .filter((predicate) => !object.fields.some((field) => field.key === predicate.field))
    .map((predicate) =>
      `command '${commandKey}' ${declaration} reads undeclared field `
      + `'${object.key}.${predicate.field}'`);
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
      } else if (!availableCapabilities.some(
        (provider) => commandEffectProviderMatches(requirement, provider),
      )) {
        issues.push(
          `command '${command.key}' requires unavailable capability `
          + `'${requirement.capability}@${requirement.version}' (${requirement.consistency})`,
        );
      }
    }
  }
  return issues;
}
