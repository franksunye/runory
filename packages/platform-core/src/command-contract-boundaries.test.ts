import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as facade from "./command-contracts";
import {
  registerCommandEffectProvider,
} from "./command-contracts/registry";
import {
  assertCommandHandlerMatchesContract,
  prepareCommandContractEffects,
  resolveCommandPlan,
} from "./command-contracts/runtime-plan";
import {
  getWorkspaceCommandContractInventory,
  resolveWorkspaceCommandPlan,
  syncWorkspaceCommandContracts,
} from "./command-contracts/workspace";
import {
  getWorkspaceCommandContractInventory as getWorkspaceInventoryDirect,
} from "./command-contracts/workspace-diagnostics";
import {
  resolveWorkspaceCommandPlan as resolveWorkspacePlanDirect,
} from "./command-contracts/workspace-resolution";
import {
  syncWorkspaceCommandContracts as syncWorkspaceContractsDirect,
} from "./command-contracts/workspace-snapshots";

describe("Command Contract module boundaries", () => {
  it("keeps one compatibility facade for existing callers", () => {
    expect(facade.registerCommandEffectProvider).toBe(registerCommandEffectProvider);
    expect(facade.resolveCommandPlan).toBe(resolveCommandPlan);
    expect(facade.prepareCommandContractEffects).toBe(prepareCommandContractEffects);
    expect(facade.assertCommandHandlerMatchesContract).toBe(assertCommandHandlerMatchesContract);
    expect(facade.resolveWorkspaceCommandPlan).toBe(resolveWorkspaceCommandPlan);
    expect(facade.getWorkspaceCommandContractInventory)
      .toBe(getWorkspaceCommandContractInventory);
    expect(facade.syncWorkspaceCommandContracts).toBe(syncWorkspaceCommandContracts);
  });

  it("keeps registry and Runtime planning independent from Workspace persistence", () => {
    for (const file of ["registry.ts", "runtime-plan.ts"]) {
      const source = readFileSync(
        resolve(import.meta.dirname, "command-contracts", file),
        "utf8",
      );
      expect(source).not.toContain("workspaceCommandContracts");
      expect(source).not.toContain("workspace_command_contract");
    }
  });

  it("keeps the Workspace facade while separating resolution, diagnostics, and snapshots", () => {
    expect(resolveWorkspaceCommandPlan).toBe(resolveWorkspacePlanDirect);
    expect(getWorkspaceCommandContractInventory).toBe(getWorkspaceInventoryDirect);
    expect(syncWorkspaceCommandContracts).toBe(syncWorkspaceContractsDirect);

    const directory = resolve(import.meta.dirname, "command-contracts");
    const resolution = readFileSync(resolve(directory, "workspace-resolution.ts"), "utf8");
    const diagnostics = readFileSync(resolve(directory, "workspace-diagnostics.ts"), "utf8");
    const snapshots = readFileSync(resolve(directory, "workspace-snapshots.ts"), "utf8");

    expect(resolution).not.toContain("queryAll");
    expect(resolution).not.toContain("runBatch");
    expect(resolution).not.toContain("resolveRegisteredCommandPlan");
    expect(diagnostics).not.toContain("runBatch");
    expect(diagnostics).not.toContain("resolveRegisteredCommandPlan");
    expect(snapshots).not.toContain("resolveCommandPlan");
    expect(snapshots).not.toContain("queryAll");
  });

  it("does not retain a process-level Command Contract registry", () => {
    const facadeSource = readFileSync(resolve(import.meta.dirname, "command-contracts.ts"), "utf8");
    const registrySource = readFileSync(
      resolve(import.meta.dirname, "command-contracts", "registry.ts"),
      "utf8",
    );

    expect(facadeSource).not.toContain("registerCommandContract");
    expect(registrySource).not.toContain("commandContracts");
    expect(registrySource).not.toContain("getCommandContract");
  });

  it("keeps structural validation independent from persistence and Runtime handlers", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "command-contracts", "validation.ts"),
      "utf8",
    );
    expect(source).not.toContain('from "../db"');
    expect(source).not.toContain('from "../command-runtime"');
  });

  it("loads all built-in Providers through one explicit composition root", () => {
    const providerDirectory = resolve(import.meta.dirname, "command-contracts", "providers");
    const compositionRoot = readFileSync(resolve(providerDirectory, "index.ts"), "utf8");
    const contexts = ["assignment", "forms", "fsm", "invoice", "quote", "scheduling", "workflow"];

    for (const context of contexts) {
      expect(compositionRoot).toContain(`import "./${context}"`);
    }

    const registrations = contexts.flatMap((context) => {
      const source = readFileSync(resolve(providerDirectory, `${context}.ts`), "utf8");
      return [...source.matchAll(/capability:\s*"([^"]+)"/g)].map((match) => match[1]);
    });
    expect(registrations).toHaveLength(15);
    expect(new Set(registrations).size).toBe(15);

    const formsRuntime = readFileSync(resolve(import.meta.dirname, "forms.ts"), "utf8");
    expect(formsRuntime).not.toContain("registerCommandEffectProvider");
  });

  it("keeps physical business-table writes inside their owning command context", () => {
    const boundaries: Record<string, string[]> = {
      "quote-commands.ts": ["quote"],
      "fsm-commands.ts": ["work_order", "service_visit"],
      "payment-commands.ts": [
        "payment",
        "payment_request",
        "payment_provider_reference",
        "refund",
      ],
      "invoice-commands.ts": ["invoice", "invoice_line"],
      "forms.ts": [],
      "workflow.ts": [],
    };
    const physicalWrite = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+\$\{businessTable\("([^"]+)"\)\}/gi;

    for (const [file, allowedTables] of Object.entries(boundaries)) {
      const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
      const writtenTables = [...source.matchAll(physicalWrite)]
        .map((match) => match[1]);
      const unexpectedTables = writtenTables.filter(
        (table) => !allowedTables.includes(table),
      );

      expect(
        unexpectedTables,
        `${file} writes business table(s) owned by another context`,
      ).toEqual([]);
    }
  });
});
