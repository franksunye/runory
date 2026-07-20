import type { CommandContract } from "@runory/contracts";
import type { CommandEnvelope, CommandHandlerResult } from "../command-runtime";
import {
  commandContractError,
  commandContractOperationalError,
} from "./errors";
import {
  commandEffectProviderMatches,
  getRegisteredCommandEffectProviders,
} from "./registry";
import { assertEffectCardinality } from "./providers/cardinality";
import type { CommandEffectProvider, ResolvedCommandPlan } from "./types";
import type { BatchStatement } from "../db";

export function resolveCommandPlan(
  contract: CommandContract,
  providers: CommandEffectProvider[] = getRegisteredCommandEffectProviders(),
  source?: ResolvedCommandPlan["source"],
  context?: { workspaceId?: string },
): ResolvedCommandPlan {
  const effects = contract.requiredEffects.map((requirement) => {
    const provider = providers.find(
      (candidate) => commandEffectProviderMatches(requirement, candidate),
    );
    if (!provider) {
      throw commandContractOperationalError({
        command: contract.key,
        workspaceId: context?.workspaceId,
        source,
        missingCapability: requirement,
        problem: "no compatible Provider is registered",
        remediation: "install or repair a compatible Provider, then rerun Workspace Contract repair",
      });
    }
    return { requirement, provider };
  });
  return { contract, effects, source };
}

export async function prepareCommandContractEffects(
  plan: ResolvedCommandPlan,
  envelope: CommandEnvelope,
  result: CommandHandlerResult<unknown>,
): Promise<BatchStatement[]> {
  const statements: BatchStatement[] = [];
  for (const effect of plan.effects) {
    const prepared = await effect.provider.prepare({
      envelope,
      requirement: effect.requirement,
      effectInput: result.effectInputs?.[effect.requirement.capability],
    });
    assertEffectCardinality(
      envelope.commandType,
      effect.requirement,
      prepared.recordCount,
      `prepared '${effect.requirement.capability}' effect record(s)`,
    );
    if (
      effect.requirement.consistency === "atomic"
      && prepared.statements.length === 0
      && (effect.requirement.cardinality === "one"
        || effect.requirement.cardinality === "one_or_more")
    ) {
      throw commandContractError(
        `${effect.provider.capability}@${effect.provider.version} prepared no atomic effect for ${envelope.commandType}.`,
      );
    }
    if (
      effect.requirement.consistency === "atomic"
      && prepared.statements.some(
        (statement) => statement.expectedRowsAffected === undefined,
      )
    ) {
      throw commandContractError(
        `${effect.provider.capability}@${effect.provider.version} did not declare `
        + `commit-time affected-row guards for every atomic statement.`,
      );
    }
    statements.push(...prepared.statements);
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
    throw commandContractError(
      `${contract.key} targets aggregate '${contract.aggregate}', not '${envelope.aggregateType}'.`,
    );
  }
  if (contract.requiresExpectedVersion && envelope.expectedVersion === null) {
    throw commandContractError(`${contract.key} requires expectedVersion.`);
  }
  if (contract.auditRequired && !result.audit) {
    throw commandContractError(`${contract.key} must write an audit fact.`);
  }
  if (contract.operation === "transition") {
    const sourceState = result.audit?.before?.status;
    if (typeof sourceState !== "string") {
      throw commandContractError(
        `${contract.key} must report its observed source state in audit.before.status.`,
      );
    }
    if (!contract.transition!.from.includes(sourceState)) {
      throw commandContractError(
        `${contract.key} observed source state '${sourceState}', but its Contract allows `
        + `${contract.transition!.from.join(", ")}.`,
      );
    }
  }
  const emitted = new Set((result.events ?? []).map((event) => event.eventType));
  const missingEvents = contract.emits.filter((eventType) => !emitted.has(eventType));
  if (missingEvents.length > 0) {
    throw commandContractError(
      `${contract.key} did not emit required event(s): ${missingEvents.join(", ")}.`,
    );
  }
}

/**
 * Validate the handler's resulting lifecycle state after every Provider has
 * successfully prepared its atomic statements, but before the batch commits.
 */
export function assertCommandResultMatchesContract(
  plan: ResolvedCommandPlan,
  result: CommandHandlerResult<unknown>,
): void {
  const { contract } = plan;
  if (contract.operation === "transition") {
    const targetState = result.audit?.after?.status;
    if (typeof targetState !== "string") {
      throw commandContractError(
        `${contract.key} must report its resulting target state in audit.after.status.`,
      );
    }
    const allowedTargets = Array.isArray(contract.transition!.to)
      ? contract.transition!.to
      : [contract.transition!.to];
    if (!allowedTargets.includes(targetState)) {
      throw commandContractError(
        `${contract.key} reported target state '${targetState}', but its Contract allows `
        + `${allowedTargets.join(", ")}.`,
      );
    }
  }

  const aggregate = result.aggregate;
  if (contract.resultAssertions.length > 0
    && (aggregate === null || typeof aggregate !== "object" || Array.isArray(aggregate))) {
    throw commandContractError(
      `${contract.key} must return an aggregate object for executable result assertions.`,
    );
  }
  const fields = aggregate as Record<string, unknown>;
  for (const assertion of contract.resultAssertions) {
    const actual = fields[assertion.field];
    if (assertion.operator === "not_null" && (actual === null || actual === undefined)) {
      throw commandContractError(
        `${contract.key} result field '${assertion.field}' must not be null.`,
      );
    }
    if (assertion.operator === "equals" && !Object.is(actual, assertion.value)) {
      throw commandContractError(
        `${contract.key} result field '${assertion.field}' must equal `
        + `${JSON.stringify(assertion.value)}; received ${JSON.stringify(actual)}.`,
      );
    }
  }
}
