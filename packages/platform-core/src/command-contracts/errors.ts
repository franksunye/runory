import { BusinessError } from "../context";
import { ERROR_CODES } from "../errors";
import type { ResolvedCommandPlan } from "./types";

export function commandContractError(message: string): BusinessError {
  return new BusinessError(
    ERROR_CODES.COMMAND_CONTRACT_INCOMPLETE,
    `COMMAND_CONTRACT_INCOMPLETE: ${message}`,
    500,
  );
}

export function commandContractOperationalError(input: {
  command: string;
  workspaceId?: string;
  source?: ResolvedCommandPlan["source"];
  missingCapability?: {
    capability: string;
    version: string;
    consistency: string;
  };
  problem: string;
  remediation: string;
}): BusinessError {
  const context = [
    `Command '${input.command}'`,
    input.workspaceId ? `Workspace '${input.workspaceId}'` : undefined,
    input.source
      ? `source '${input.source.kind}:${input.source.id}@${input.source.version}'`
      : undefined,
  ].filter(Boolean).join(", ");
  const capability = input.missingCapability
    ? ` Missing capability '${input.missingCapability.capability}@${input.missingCapability.version}' `
      + `(${input.missingCapability.consistency}).`
    : "";

  return commandContractError(
    `${context}: ${input.problem}.${capability} Remediation: ${input.remediation}.`,
  );
}
