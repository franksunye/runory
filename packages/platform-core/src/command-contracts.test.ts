import { describe, expect, it } from "vitest";
import { commandContractSchema, type ModuleManifest } from "@runory/contracts";
import { BusinessError } from "./context";
import { ERROR_CODES } from "./errors";
import { loadModuleManifest } from "./installer";
import {
  assertCommandHandlerMatchesContract,
  getCommandContract,
  resolveCommandPlan,
  resolveRegisteredCommandPlan,
  validateModuleCommandContracts,
} from "./command-contracts";

describe("Contract-driven command registry", () => {
  it.each([
    ["runory.service-visit", "visit.complete"],
    ["runory.work-order", "work_order.complete"],
  ])("keeps runtime contract %s aligned with its official Module manifest", (moduleId, commandKey) => {
    const manifest = loadModuleManifest(moduleId);
    const declared = manifest.domain?.commands.find((command) => command.key === commandKey);

    expect(declared).toBeDefined();
    expect(getCommandContract(commandKey)).toEqual(declared);
    expect(validateModuleCommandContracts(manifest)).toEqual([]);
  });

  it("resolves the Scheduling provider required by terminal FSM commands", () => {
    const plan = resolveRegisteredCommandPlan("visit.complete");

    expect(plan?.effects).toHaveLength(1);
    expect(plan?.effects[0].provider.capability).toBe("scheduling.complete_reservation");
    expect(plan?.effects[0].provider.version).toBe("1.0.0");
  });

  it("fails closed when a required atomic capability has no compatible provider", () => {
    const contract = commandContractSchema.parse({
      key: "example.complete",
      contractVersion: "1.0.0",
      aggregate: "example",
      transition: { from: ["active"], to: "completed" },
      permission: "example.complete",
      requiredEffects: [{
        capability: "missing.atomic_provider",
        version: "^1.0.0",
        scope: "same_subject",
        consistency: "atomic",
      }],
      emits: ["example.completed"],
      postconditions: ["example.status == completed"],
    });

    expect(() => resolveCommandPlan(contract, [])).toThrowError(
      expect.objectContaining<Partial<BusinessError>>({
        code: ERROR_CODES.COMMAND_CONTRACT_INCOMPLETE,
      }),
    );
  });

  it("rejects a handler that omits a Contract-required event", () => {
    const plan = resolveRegisteredCommandPlan("visit.complete")!;

    expect(() => assertCommandHandlerMatchesContract(plan, {
      commandId: "cmd_test",
      workspaceId: "ws_test",
      commandType: "visit.complete",
      aggregateType: "service_visit",
      aggregateId: "visit_test",
      expectedVersion: 3,
      actor: { type: "system", id: "test" },
      input: { visitId: "visit_test" },
      occurredAt: "2026-07-14T00:00:00.000Z",
    }, {
      statements: [],
      events: [],
      audit: {
        action: "visit.complete",
        entityType: "service_visit",
        entityId: "visit_test",
      },
      aggregate: { status: "completed" },
      newVersion: 4,
    })).toThrow(/did not emit required event/);
  });

  it("reports Module capability-closure errors before release", () => {
    const manifest = structuredClone(loadModuleManifest("runory.service-visit")) as ModuleManifest;
    manifest.domain!.commands[0].requiredEffects[0].capability = "missing.provider";

    expect(validateModuleCommandContracts(manifest, [])).toContain(
      "command 'visit.complete' requires unavailable capability 'missing.provider@^1.0.0' (atomic)",
    );
  });
});
