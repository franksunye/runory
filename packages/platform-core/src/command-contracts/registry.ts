import {
  type CommandCapabilityProviderDeclaration,
  type CommandEffectRequirement,
} from "@runory/contracts";
import { satisfies, valid, validRange } from "semver";
import { commandContractError } from "./errors";
import type { CommandEffectProvider } from "./types";

const effectProviders = new Map<string, CommandEffectProvider[]>();

export function registerCommandEffectProvider(provider: CommandEffectProvider): void {
  if (!valid(provider.version)) {
    throw commandContractError(
      `Provider '${provider.capability}' has invalid version '${provider.version}'.`,
    );
  }
  const providers = effectProviders.get(provider.capability) ?? [];
  const duplicate = providers.find((candidate) => candidate.version === provider.version);
  if (duplicate && duplicate !== provider) {
    throw commandContractError(
      `Capability '${provider.capability}@${provider.version}' has more than one provider.`,
    );
  }
  if (!duplicate) providers.push(provider);
  effectProviders.set(provider.capability, providers);
}

export function getRegisteredCommandEffectProviders(): CommandEffectProvider[] {
  return [...effectProviders.values()].flat();
}

export function commandEffectProviderMatches(
  requirement: CommandEffectRequirement,
  provider: CommandCapabilityProviderDeclaration,
): boolean {
  return provider.capability === requirement.capability
    && provider.consistency === requirement.consistency
    && Boolean(valid(provider.version))
    && Boolean(validRange(requirement.version))
    && satisfies(provider.version, requirement.version);
}
