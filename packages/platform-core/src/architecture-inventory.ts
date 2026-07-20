import type {
  CommandCapabilityProviderDeclaration,
  CommandContract,
  ModuleManifest,
  PlatformServiceContractManifest,
} from "@runory/contracts";
import { readdirSync } from "node:fs";
import {
  getRegisteredCommandEffectProviders,
  resolveCommandPlan,
  type CommandContractSourceKind,
} from "./command-contracts";
import { MODULES_DIR } from "./contracts";
import { loadModuleManifest } from "./installer";
import { listPlatformServiceContractManifests } from "./platform-service-contracts";

export interface CommandImplementationDeclaration {
  key: string;
  aggregate: string;
  sourceFile: string;
}

export interface CommandContractSourceInventory {
  kind: CommandContractSourceKind;
  id: string;
  version: string;
  commandKeys: string[];
}

export interface CommandInventoryEntry {
  key: string;
  aggregate: string;
  operation: CommandContract["operation"];
  transition: CommandContract["transition"] | null;
  contractVersion: string;
  permission: string;
  sourceKind: CommandContractSourceKind;
  sourceId: string;
  sourceVersion: string;
  implementationFile: string;
  requiredEffects: Array<{
    capability: string;
    versionRange: string;
    providerVersion: string;
    consistency: string;
    cardinality: string;
  }>;
  emittedEvents: string[];
}

export interface ArchitectureInventory {
  generatedAt: string;
  summary: {
    commandCount: number;
    sourceCount: number;
    moduleSourceCount: number;
    platformServiceSourceCount: number;
    providerCount: number;
  };
  sources: CommandContractSourceInventory[];
  commands: CommandInventoryEntry[];
  providers: CommandCapabilityProviderDeclaration[];
  issues: string[];
}

/**
 * Behavior-neutral inventory of the command functions that call
 * executeCommand(). Architecture tests compare this declaration to both the
 * source call sites and the provisionable Module/Platform Service Contracts.
 */
export const COMMAND_IMPLEMENTATIONS: readonly CommandImplementationDeclaration[] = [
  { key: "approval.decide", aggregate: "work_item", sourceFile: "workflow.ts" },
  { key: "work_item.return", aggregate: "work_item", sourceFile: "workflow.ts" },
  { key: "work_item.claim", aggregate: "work_item", sourceFile: "workflow.ts" },
  { key: "work_item.release", aggregate: "work_item", sourceFile: "workflow.ts" },
  { key: "work_item.complete", aggregate: "work_item", sourceFile: "workflow.ts" },
  { key: "work_item.cancel", aggregate: "work_item", sourceFile: "workflow.ts" },
  { key: "form_submission.submit", aggregate: "form_submission", sourceFile: "forms.ts" },
  { key: "form_submission.save_draft", aggregate: "form_submission", sourceFile: "forms.ts" },
  { key: "form_submission.revise", aggregate: "form_submission", sourceFile: "forms.ts" },
  { key: "form_submission.return", aggregate: "form_submission", sourceFile: "forms.ts" },
  { key: "form_submission.accept", aggregate: "form_submission", sourceFile: "forms.ts" },
  { key: "payment.request", aggregate: "payment_request", sourceFile: "payment-commands.ts" },
  {
    key: "payment.confirm_provider_result",
    aggregate: "payment",
    sourceFile: "payment-commands.ts",
  },
  {
    key: "payment.fail_provider_result",
    aggregate: "payment",
    sourceFile: "payment-commands.ts",
  },
  {
    key: "payment.expire_request",
    aggregate: "payment_request",
    sourceFile: "payment-commands.ts",
  },
  { key: "payment.request_refund", aggregate: "refund", sourceFile: "payment-commands.ts" },
  { key: "payment.confirm_refund", aggregate: "refund", sourceFile: "payment-commands.ts" },
  { key: "payment.fail_refund", aggregate: "refund", sourceFile: "payment-commands.ts" },
  { key: "quote.submit_for_approval", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.approve", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.reject", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.return_for_changes", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.withdraw", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.mark_sent", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.accept", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.mark_declined", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.expire", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.recalculate", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.create_revision", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.convert_to_work_order", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "quote.create_draft", aggregate: "quote", sourceFile: "quote-commands.ts" },
  { key: "work_order.triage", aggregate: "work_order", sourceFile: "fsm-commands.ts" },
  { key: "work_order.create_visit", aggregate: "work_order", sourceFile: "fsm-commands.ts" },
  { key: "work_order.block", aggregate: "work_order", sourceFile: "fsm-commands.ts" },
  { key: "work_order.unblock", aggregate: "work_order", sourceFile: "fsm-commands.ts" },
  { key: "work_order.start", aggregate: "work_order", sourceFile: "fsm-commands.ts" },
  { key: "work_order.complete", aggregate: "work_order", sourceFile: "fsm-commands.ts" },
  { key: "work_order.cancel", aggregate: "work_order", sourceFile: "fsm-commands.ts" },
  { key: "work_order.reopen", aggregate: "work_order", sourceFile: "fsm-commands.ts" },
  { key: "visit.start_travel", aggregate: "service_visit", sourceFile: "fsm-commands.ts" },
  { key: "visit.arrive", aggregate: "service_visit", sourceFile: "fsm-commands.ts" },
  { key: "visit.submit_work", aggregate: "service_visit", sourceFile: "fsm-commands.ts" },
  { key: "visit.complete", aggregate: "service_visit", sourceFile: "fsm-commands.ts" },
  { key: "visit.cancel", aggregate: "service_visit", sourceFile: "fsm-commands.ts" },
] as const;

interface ContractOwner {
  kind: CommandContractSourceKind;
  id: string;
  version: string;
  contract: CommandContract;
}

function commandSources(): Array<{
  kind: CommandContractSourceKind;
  manifest: ModuleManifest | PlatformServiceContractManifest;
}> {
  const modules = readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadModuleManifest(entry.name))
    .filter((manifest) => manifest.status !== "retired" && (manifest.domain?.commands.length ?? 0) > 0)
    .map((manifest) => ({ kind: "module" as const, manifest }));
  const platformServices = listPlatformServiceContractManifests()
    .filter((manifest) => manifest.domain.commands.length > 0)
    .map((manifest) => ({ kind: "platform_service" as const, manifest }));
  return [...modules, ...platformServices];
}

function sourceCommands(
  source: ReturnType<typeof commandSources>[number],
): CommandContract[] {
  return source.manifest.domain?.commands ?? [];
}

function providerDeclaration(
  provider: ReturnType<typeof getRegisteredCommandEffectProviders>[number],
): CommandCapabilityProviderDeclaration {
  return {
    capability: provider.capability,
    version: provider.version,
    consistency: provider.consistency,
  };
}

export function buildArchitectureInventory(): ArchitectureInventory {
  const issues: string[] = [];
  const sources = commandSources();
  const providers = getRegisteredCommandEffectProviders()
    .map(providerDeclaration)
    .sort((left, right) => (
      `${left.capability}@${left.version}`.localeCompare(`${right.capability}@${right.version}`)
    ));
  const owners = new Map<string, ContractOwner[]>();
  const implementations = new Map<string, CommandImplementationDeclaration[]>();

  for (const declaration of COMMAND_IMPLEMENTATIONS) {
    const existing = implementations.get(declaration.key) ?? [];
    existing.push(declaration);
    implementations.set(declaration.key, existing);
  }

  for (const source of sources) {
    for (const contract of sourceCommands(source)) {
      const existing = owners.get(contract.key) ?? [];
      existing.push({
        kind: source.kind,
        id: source.manifest.id,
        version: source.manifest.version,
        contract,
      });
      owners.set(contract.key, existing);
    }
  }

  for (const [key, matches] of owners) {
    if (matches.length !== 1) {
      issues.push(
        `Command '${key}' has ${matches.length} provisionable owners: `
        + matches.map((owner) => `${owner.kind}:${owner.id}@${owner.version}`).join(", "),
      );
    }
  }
  for (const [key, matches] of implementations) {
    if (matches.length !== 1) {
      issues.push(
        `Command '${key}' has ${matches.length} callable implementations: `
        + matches.map((implementation) => implementation.sourceFile).join(", "),
      );
    }
    if (!owners.has(key)) {
      issues.push(`Callable Command '${key}' has no provisionable Contract owner.`);
    }
  }
  for (const key of owners.keys()) {
    if (!implementations.has(key)) {
      issues.push(`Provisionable Command '${key}' has no callable implementation.`);
    }
  }

  const commands: CommandInventoryEntry[] = [];
  for (const key of [...owners.keys()].sort()) {
    const ownerMatches = owners.get(key) ?? [];
    const implementationMatches = implementations.get(key) ?? [];
    if (ownerMatches.length !== 1 || implementationMatches.length !== 1) continue;
    const owner = ownerMatches[0];
    const implementation = implementationMatches[0];
    if (owner.contract.aggregate !== implementation.aggregate) {
      issues.push(
        `Command '${key}' implementation aggregate '${implementation.aggregate}' does not match `
        + `Contract aggregate '${owner.contract.aggregate}'.`,
      );
    }

    let resolvedEffects: CommandInventoryEntry["requiredEffects"] = [];
    try {
      const plan = resolveCommandPlan(
        owner.contract,
        getRegisteredCommandEffectProviders(),
      );
      resolvedEffects = plan.effects.map(({ requirement, provider }) => ({
        capability: requirement.capability,
        versionRange: requirement.version,
        providerVersion: provider.version,
        consistency: requirement.consistency,
        cardinality: requirement.cardinality,
      }));
    } catch (error) {
      issues.push(
        `Command '${key}' Provider closure failed: `
        + (error instanceof Error ? error.message : String(error)),
      );
    }

    commands.push({
      key,
      aggregate: owner.contract.aggregate,
      operation: owner.contract.operation,
      transition: owner.contract.transition ?? null,
      contractVersion: owner.contract.contractVersion,
      permission: owner.contract.permission,
      sourceKind: owner.kind,
      sourceId: owner.id,
      sourceVersion: owner.version,
      implementationFile: implementation.sourceFile,
      requiredEffects: resolvedEffects,
      emittedEvents: [...owner.contract.emits],
    });
  }

  const sourceInventory = sources
    .map((source): CommandContractSourceInventory => ({
      kind: source.kind,
      id: source.manifest.id,
      version: source.manifest.version,
      commandKeys: sourceCommands(source).map((contract) => contract.key).sort(),
    }))
    .sort((left, right) => (
      `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)
    ));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      commandCount: commands.length,
      sourceCount: sourceInventory.length,
      moduleSourceCount: sourceInventory.filter((source) => source.kind === "module").length,
      platformServiceSourceCount: sourceInventory.filter(
        (source) => source.kind === "platform_service",
      ).length,
      providerCount: providers.length,
    },
    sources: sourceInventory,
    commands,
    providers,
    issues: issues.sort(),
  };
}

export function assertArchitectureInventory(
  inventory: ArchitectureInventory = buildArchitectureInventory(),
): ArchitectureInventory {
  if (inventory.issues.length > 0) {
    throw new Error(
      `ARCHITECTURE_INVENTORY_INVALID:\n- ${inventory.issues.join("\n- ")}`,
    );
  }
  return inventory;
}
