import type {
  CommandCapabilityProviderDeclaration,
  ModuleManifest,
  PlatformServiceContractManifest,
} from "@runory/contracts";
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
