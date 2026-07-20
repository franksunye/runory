import type {
  CommandCapabilityProviderDeclaration,
  CommandContract,
  CommandEffectRequirement,
} from "@runory/contracts";
import type { CommandEnvelope } from "../command-runtime";
import type { BatchStatement } from "../db";

export interface PreparedCommandEffect {
  /**
   * Number of semantic records prepared for this capability. This is distinct
   * from the number of SQL statements needed to persist one effect.
   */
  recordCount: number;
  statements: BatchStatement[];
}

export interface CommandEffectProvider extends CommandCapabilityProviderDeclaration {
  prepare(context: {
    envelope: CommandEnvelope;
    requirement: CommandEffectRequirement;
    effectInput: unknown;
  }): Promise<PreparedCommandEffect> | PreparedCommandEffect;
}

export interface ResolvedCommandEffect {
  requirement: CommandEffectRequirement;
  provider: CommandEffectProvider;
}

export type CommandContractSourceKind = "module" | "platform_service";

export interface ResolvedCommandPlan {
  contract: CommandContract;
  effects: ResolvedCommandEffect[];
  source?: {
    kind: CommandContractSourceKind;
    id: string;
    version: string;
  };
}

export interface WorkspaceCommandContractInventoryEntry {
  commandKey: string;
  sourceKind: CommandContractSourceKind;
  sourceId: string;
  sourceVersion: string;
  contractVersion: string;
  aggregate: string;
  operation: CommandContract["operation"];
  permission: string;
  providers: Array<{
    capability: string;
    requiredVersion: string;
    resolvedVersion: string;
    consistency: string;
  }>;
}
