import { describe, expect, it } from "vitest";
import { commandContractSchema, type ModuleManifest } from "@runory/contracts";
import { BusinessError } from "./context";
import { ERROR_CODES } from "./errors";
import { loadModuleManifest } from "./installer";
import {
  assertCommandHandlerMatchesContract,
  assertCommandResultMatchesContract,
  prepareCommandContractEffects,
  resolveCommandPlan,
  validateModuleCommandContracts,
  validatePlatformServiceCommandContracts,
} from "./command-contracts";
import { loadPlatformServiceContractManifest } from "./platform-service-contracts";

function getModuleCommand(moduleId: string, commandKey: string) {
  return loadModuleManifest(moduleId).domain?.commands
    .find((command) => command.key === commandKey);
}

describe("Contract-driven command planning", () => {
  const cardinalityEnvelope = {
    commandId: "cmd_cardinality",
    workspaceId: "ws_test",
    commandType: "example.effect",
    aggregateType: "example",
    aggregateId: "example_1",
    expectedVersion: null,
    actor: { type: "system", id: "test" },
    input: {},
    occurredAt: "2026-07-20T00:00:00.000Z",
  } as const;

  function cardinalityContract() {
    return commandContractSchema.parse({
      key: "example.effect",
      contractVersion: "1.0.0",
      aggregate: "example",
      operation: "action",
      permission: "example.effect",
      requiresExpectedVersion: false,
      requiredEffects: [{
        capability: "example.atomic",
        version: "^1.0.0",
        scope: "same_subject",
        consistency: "atomic",
        cardinality: "one",
      }],
      emits: ["example.effect_applied"],
      postconditions: ["The effect is applied once."],
    });
  }

  it("validates Provider cardinality using semantic prepared records, not SQL count", async () => {
    const plan = resolveCommandPlan(cardinalityContract(), [{
      capability: "example.atomic",
      version: "1.0.0",
      consistency: "atomic",
      prepare: () => ({
        recordCount: 1,
        statements: [
          { sql: "UPDATE first SET value = 1", expectedRowsAffected: 1 },
          { sql: "INSERT INTO second(id) VALUES (1)", expectedRowsAffected: 1 },
        ],
      }),
    }]);

    await expect(prepareCommandContractEffects(
      plan,
      cardinalityEnvelope,
      { statements: [], aggregate: {}, newVersion: 1 },
    )).resolves.toHaveLength(2);
  });

  it("rejects a Provider whose prepared record count violates the Contract", async () => {
    const plan = resolveCommandPlan(cardinalityContract(), [{
      capability: "example.atomic",
      version: "1.0.0",
      consistency: "atomic",
      prepare: () => ({ recordCount: 0, statements: [] }),
    }]);

    await expect(prepareCommandContractEffects(
      plan,
      cardinalityEnvelope,
      { statements: [], aggregate: {}, newVersion: 1 },
    )).rejects.toThrow(/expected one prepared 'example.atomic' effect record/);
  });

  it("rejects atomic Provider statements without commit-time row guards", async () => {
    const plan = resolveCommandPlan(cardinalityContract(), [{
      capability: "example.atomic",
      version: "1.0.0",
      consistency: "atomic",
      prepare: () => ({
        recordCount: 1,
        statements: [{ sql: "UPDATE example SET value = 1" }],
      }),
    }]);

    await expect(prepareCommandContractEffects(
      plan,
      cardinalityEnvelope,
      { statements: [], aggregate: {}, newVersion: 1 },
    )).rejects.toThrow(/did not declare commit-time affected-row guards/);
  });

  it.each([
    ["runory.service-visit", "visit.complete"],
    ["runory.work-order", "work_order.complete"],
  ])("keeps runtime contract %s aligned with its official Module manifest", (moduleId, commandKey) => {
    const manifest = loadModuleManifest(moduleId);
    const declared = manifest.domain?.commands.find((command) => command.key === commandKey);

    expect(declared).toBeDefined();
    expect(validateModuleCommandContracts(manifest)).toEqual([]);
  });

  it("resolves the Scheduling provider required by terminal FSM commands", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.service-visit",
      "visit.complete",
    )!);

    expect(plan.effects).toHaveLength(1);
    expect(plan.effects[0].provider.capability).toBe("scheduling.complete_reservation");
    expect(plan.effects[0].provider.version).toBe("1.0.0");
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

  it("does not grant trusted system access unless a Contract declares it", () => {
    const contract = commandContractSchema.parse({
      key: "example.update",
      contractVersion: "1.0.0",
      aggregate: "example",
      operation: "action",
      permission: "example.update",
      emits: ["example.updated"],
      postconditions: ["The example is updated."],
    });

    expect(contract.allowedActorTypes).toEqual(["user", "api_key"]);
  });

  it("reports the Command, Workspace source, missing capability, and remediation", () => {
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

    expect(() => resolveCommandPlan(
      contract,
      [],
      { kind: "module", id: "runory.example", version: "1.2.0" },
      { workspaceId: "ws_example" },
    )).toThrow(
      /Command 'example\.complete'.*Workspace 'ws_example'.*source 'module:runory\.example@1\.2\.0'.*Missing capability 'missing\.atomic_provider@\^1\.0\.0'.*Remediation:/,
    );
  });

  it("models aggregate creation without inventing a source lifecycle state", () => {
    const contract = commandContractSchema.parse({
      key: "example.create",
      contractVersion: "1.0.0",
      aggregate: "example",
      operation: "create",
      permission: "example.create",
      requiresExpectedVersion: false,
      emits: ["example.created"],
      postconditions: ["example.version == 1"],
    });

    expect(contract.operation).toBe("create");
    expect(contract.transition).toBeUndefined();
    expect(() => commandContractSchema.parse({
      ...contract,
      transition: { from: ["missing"], to: "active" },
    })).toThrow(/must not invent a source state/);
  });

  it("rejects a handler that omits a Contract-required event", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.service-visit",
      "visit.complete",
    )!);

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
        before: { status: "on_site" },
        after: { status: "completed" },
      },
      aggregate: { status: "completed", actual_end: "2026-07-14T00:00:00.000Z" },
      newVersion: 4,
    })).toThrow(/did not emit required event/);
  });

  it("accepts a transition whose observed source state is allowed", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.service-visit",
      "visit.complete",
    )!);

    const envelope = {
      commandId: "cmd_source_allowed",
      workspaceId: "ws_test",
      commandType: "visit.complete",
      aggregateType: "service_visit",
      aggregateId: "visit_test",
      expectedVersion: 3,
      actor: { type: "system", id: "test" },
      input: {},
      occurredAt: "2026-07-14T00:00:00.000Z",
    } as const;
    const result = {
      statements: [],
      events: [{
        aggregateType: "service_visit",
        aggregateId: "visit_test",
        eventType: "visit.completed",
        payload: {},
      }],
      audit: {
        action: "visit.complete",
        entityType: "service_visit",
        entityId: "visit_test",
        before: { status: "on_site" },
        after: { status: "completed" },
      },
      aggregate: { status: "completed", actual_end: "2026-07-14T00:00:00.000Z" },
      newVersion: 4,
    };

    expect(() => assertCommandHandlerMatchesContract(plan, envelope, result)).not.toThrow();
    expect(() => assertCommandResultMatchesContract(plan, result)).not.toThrow();
  });

  it("rejects a transition whose observed source state is outside the Contract", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.service-visit",
      "visit.complete",
    )!);

    expect(() => assertCommandHandlerMatchesContract(plan, {
      commandId: "cmd_source_rejected",
      workspaceId: "ws_test",
      commandType: "visit.complete",
      aggregateType: "service_visit",
      aggregateId: "visit_test",
      expectedVersion: 3,
      actor: { type: "system", id: "test" },
      input: {},
      occurredAt: "2026-07-14T00:00:00.000Z",
    }, {
      statements: [],
      events: [{
        aggregateType: "service_visit",
        aggregateId: "visit_test",
        eventType: "visit.completed",
        payload: {},
      }],
      audit: {
        action: "visit.complete",
        entityType: "service_visit",
        entityId: "visit_test",
        before: { status: "scheduled" },
        after: { status: "completed" },
      },
      aggregate: { status: "completed" },
      newVersion: 4,
    })).toThrow(/observed source state 'scheduled'.*allows on_site/);
  });

  it("rejects a transition that omits source-state audit evidence", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.service-visit",
      "visit.complete",
    )!);

    expect(() => assertCommandHandlerMatchesContract(plan, {
      commandId: "cmd_source_missing",
      workspaceId: "ws_test",
      commandType: "visit.complete",
      aggregateType: "service_visit",
      aggregateId: "visit_test",
      expectedVersion: 3,
      actor: { type: "system", id: "test" },
      input: {},
      occurredAt: "2026-07-14T00:00:00.000Z",
    }, {
      statements: [],
      events: [{
        aggregateType: "service_visit",
        aggregateId: "visit_test",
        eventType: "visit.completed",
        payload: {},
      }],
      audit: {
        action: "visit.complete",
        entityType: "service_visit",
        entityId: "visit_test",
      },
      aggregate: { status: "completed" },
      newVersion: 4,
    })).toThrow(/must report its observed source state/);
  });

  it("rejects a transition whose resulting target state is outside the Contract", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.service-visit",
      "visit.complete",
    )!);

    expect(() => assertCommandResultMatchesContract(plan, {
      statements: [],
      audit: {
        action: "visit.complete",
        entityType: "service_visit",
        entityId: "visit_test",
        before: { status: "on_site" },
        after: { status: "cancelled" },
      },
      aggregate: { status: "cancelled" },
      newVersion: 4,
    })).toThrow(/reported target state 'cancelled'.*allows completed/);
  });

  it("rejects a transition that omits target-state audit evidence", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.service-visit",
      "visit.complete",
    )!);

    expect(() => assertCommandResultMatchesContract(plan, {
      statements: [],
      audit: {
        action: "visit.complete",
        entityType: "service_visit",
        entityId: "visit_test",
        before: { status: "on_site" },
      },
      aggregate: {},
      newVersion: 4,
    })).toThrow(/must report its resulting target state/);
  });

  it("keeps target-state validation separate from pre-Provider handler validation", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.service-visit",
      "visit.complete",
    )!);

    expect(() => assertCommandHandlerMatchesContract(plan, {
      commandId: "cmd_target_rejected",
      workspaceId: "ws_test",
      commandType: "visit.complete",
      aggregateType: "service_visit",
      aggregateId: "visit_test",
      expectedVersion: 3,
      actor: { type: "system", id: "test" },
      input: {},
      occurredAt: "2026-07-14T00:00:00.000Z",
    }, {
      statements: [],
      events: [{
        aggregateType: "service_visit",
        aggregateId: "visit_test",
        eventType: "visit.completed",
        payload: {},
      }],
      audit: {
        action: "visit.complete",
        entityType: "service_visit",
        entityId: "visit_test",
        before: { status: "on_site" },
        after: { status: "cancelled" },
      },
      aggregate: { status: "cancelled" },
      newVersion: 4,
    })).not.toThrow();
  });

  it("rejects a missing non-null executable result assertion", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.service-visit",
      "visit.complete",
    )!);

    expect(() => assertCommandResultMatchesContract(plan, {
      statements: [],
      audit: {
        action: "visit.complete",
        entityType: "service_visit",
        entityId: "visit_test",
        before: { status: "on_site" },
        after: { status: "completed" },
      },
      aggregate: { status: "completed" },
      newVersion: 4,
    })).toThrow(/result field 'actual_end' must not be null/);
  });

  it("enforces equality assertions for create Commands", () => {
    const plan = resolveCommandPlan(getModuleCommand(
      "runory.quote",
      "quote.create_draft",
    )!);

    expect(() => assertCommandResultMatchesContract(plan, {
      statements: [],
      aggregate: { status: "approved", aggregate_version: 1 },
      newVersion: 1,
    })).toThrow(/result field 'status' must equal "draft"/);
    expect(() => assertCommandResultMatchesContract(plan, {
      statements: [],
      aggregate: { status: "draft", aggregate_version: 1 },
      newVersion: 1,
    })).not.toThrow();
  });

  it("reports Module capability-closure errors before release", () => {
    const manifest = structuredClone(loadModuleManifest("runory.service-visit")) as ModuleManifest;
    const complete = manifest.domain!.commands.find((command) => command.key === "visit.complete")!;
    complete.requiredEffects[0].capability = "missing.provider";

    expect(validateModuleCommandContracts(manifest, [])).toContain(
      "command 'visit.complete' requires unavailable capability 'missing.provider@^1.0.0' (atomic)",
    );
  });

  // ── Aggregate lifecycle (single source of truth for record progress) ──
  //
  // The point of declaring the lifecycle in the manifest is that a state can no
  // longer be added without deciding what it means for progress. These lock the
  // gate so surfaces never have to keep their own copy of the answer.

  const LIFECYCLE_MODULES = [
    ["runory.work-order", "work_order"],
    ["runory.quote", "quote"],
    ["runory.service-visit", "service_visit"],
    ["runory.invoice", "invoice"],
  ] as const;

  it.each(LIFECYCLE_MODULES)(
    "%s partitions every declared state of '%s' exactly once",
    (moduleId, aggregateKey) => {
      const manifest = loadModuleManifest(moduleId);
      const aggregate = manifest.domain!.aggregates.find((entry) => entry.key === aggregateKey)!;
      const lifecycle = aggregate.lifecycle!;
      const stateField = manifest.objects
        .find((object) => object.key === aggregateKey)!.fields
        .find((field) => field.key === aggregate.stateField)!;

      const classified = [
        ...lifecycle.spine,
        ...Object.keys(lifecycle.aliases),
        ...lifecycle.interrupts,
        ...lifecycle.terminals,
      ];

      expect(new Set(classified).size).toBe(classified.length);
      expect([...classified].sort()).toEqual(
        [...(stateField.validation!.options as string[])].sort(),
      );
      expect(validateModuleCommandContracts(manifest)).toEqual([]);
    },
  );

  it("rejects a state added to the field without a lifecycle classification", () => {
    const manifest = structuredClone(loadModuleManifest("runory.work-order")) as ModuleManifest;
    const status = manifest.objects
      .find((object) => object.key === "work_order")!.fields
      .find((field) => field.key === "status")!;
    (status.validation!.options as string[]).push("awaiting_parts");

    expect(validateModuleCommandContracts(manifest)).toContain(
      "aggregate 'work_order' state 'awaiting_parts' is not classified by the "
      + "lifecycle (spine, aliases, interrupts or terminals)",
    );
  });

  it("rejects a lifecycle that classifies a state twice", () => {
    const manifest = structuredClone(loadModuleManifest("runory.work-order")) as ModuleManifest;
    manifest.domain!.aggregates[0].lifecycle!.terminals.push("blocked");

    expect(validateModuleCommandContracts(manifest)).toContain(
      "aggregate 'work_order' lifecycle classifies state 'blocked' as both interrupts and terminals",
    );
  });

  it("rejects an alias that does not land on the spine", () => {
    const manifest = structuredClone(loadModuleManifest("runory.quote")) as ModuleManifest;
    manifest.domain!.aggregates[0].lifecycle!.aliases.returned = "rejected";

    expect(validateModuleCommandContracts(manifest)).toContain(
      "aggregate 'quote' lifecycle alias 'returned' points at 'rejected', which is not on the spine",
    );
  });

  it("rejects an advance command that ends the record off-spine", () => {
    const manifest = structuredClone(loadModuleManifest("runory.work-order")) as ModuleManifest;
    manifest.domain!.commands.find((command) => command.key === "work_order.cancel")!
      .intent = "advance";

    expect(validateModuleCommandContracts(manifest)).toContain(
      "command 'work_order.cancel' is declared as intent 'advance' but targets "
      + "off-spine state 'cancelled'; use 'decide' or 'escape_hatch'",
    );
  });

  it("rejects a surfaced action command that declares no availability condition", () => {
    const manifest = structuredClone(loadModuleManifest("runory.quote")) as ModuleManifest;
    manifest.domain!.commands.find((command) => command.key === "quote.convert_to_work_order")!
      .availableWhen = [];

    expect(validateModuleCommandContracts(manifest)).toContain(
      "command 'quote.convert_to_work_order' is an action on the record command surface, "
      + "so it must declare availableWhen; a transition would otherwise be implied",
    );
  });

  it("rejects availability predicates that read undeclared fields", () => {
    const manifest = structuredClone(loadModuleManifest("runory.invoice")) as ModuleManifest;
    manifest.domain!.commands.find((command) => command.key === "invoice.void")!
      .availableWhen = [{ field: "settled_minor", operator: "equals", value: 0 }];

    expect(validateModuleCommandContracts(manifest)).toContain(
      "command 'invoice.void' availableWhen reads undeclared field 'invoice.settled_minor'",
    );
  });

  it("rejects lifecycle evidence that reads an undeclared timestamp column", () => {
    const manifest = structuredClone(loadModuleManifest("runory.work-order")) as ModuleManifest;
    manifest.domain!.aggregates[0].lifecycle!.evidence.completed.timestampField = "closed_at";

    expect(validateModuleCommandContracts(manifest)).toContain(
      "aggregate 'work_order' lifecycle evidence for 'completed' reads undeclared field 'closed_at'",
    );
  });

  it.each([
    ["runory.workflow", 6],
    ["runory.forms", 5],
  ])("validates first-class Platform Service contracts for %s", (serviceId, commandCount) => {
    const manifest = loadPlatformServiceContractManifest(serviceId);

    expect(manifest.domain.commands).toHaveLength(commandCount);
    expect(validatePlatformServiceCommandContracts(manifest)).toEqual([]);
  });
});
