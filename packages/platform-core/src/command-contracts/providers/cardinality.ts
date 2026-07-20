import type { CommandEffectRequirement } from "@runory/contracts";
import { commandContractError } from "../errors";

export function assertEffectCardinality(
  commandType: string,
  requirement: CommandEffectRequirement,
  count: number,
  noun: string,
): void {
  if (!Number.isInteger(count) || count < 0) {
    throw commandContractError(
      `${commandType} reported an invalid ${noun} count: ${count}.`,
    );
  }
  const satisfied =
    requirement.cardinality === "one" ? count === 1
      : requirement.cardinality === "zero_or_one" ? count <= 1
        : requirement.cardinality === "one_or_more" ? count >= 1
          : true;
  if (!satisfied) {
    throw commandContractError(
      `${commandType} expected ${requirement.cardinality} ${noun}, found ${count}.`,
    );
  }
}
