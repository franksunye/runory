import { beforeEach, describe, expect, it } from "vitest";
import { commandContractSchema } from "@runory/contracts";
import { TABLES } from "./contracts";
import { db, execute, genId, now, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { installPack, loadModuleManifest, uninstallPack } from "./installer";
import { loadPlatformServiceContractManifest } from "./platform-service-contracts";
import { syncWorkspaceCommandContracts } from "./command-contracts";
import { publishWorkflowDefinition } from "./workflow";
import { analyzeWorkspaceCommandContractSourceRemoval } from "./command-contract-removal-analysis";

const workspaceId = "ws_contract_removal";

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows as unknown as Array<{ name: string }>) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${row.name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, 'Removal Analysis', 'removal-analysis', ?, ?)`,
    [workspaceId, ts, ts],
  );
}

describe("Workspace Command Contract source removal analysis", () => {
  beforeEach(resetDatabase);

  it("blocks removal when another Contract consumes a provided capability", async () => {
    const forms = loadPlatformServiceContractManifest("runory.forms");
    await syncWorkspaceCommandContracts(
      workspaceId,
      "platform_service",
      forms.id,
      forms.version,
      forms.domain.commands,
    );
    const consumer = commandContractSchema.parse({
      key: "consumer.publish_report",
      contractVersion: "1.0.0",
      aggregate: "consumer",
      operation: "action",
      permission: "consumer.publish",
      requiresExpectedVersion: false,
      requiredEffects: [{
        capability: "forms.project_service_report",
        version: "^1.0.0",
        scope: "report",
        consistency: "atomic",
        cardinality: "one",
      }],
      emits: ["consumer.report_published"],
      postconditions: ["report exists"],
    });
    await syncWorkspaceCommandContracts(
      workspaceId,
      "module",
      "runory.consumer",
      "1.0.0",
      [consumer],
    );

    const impact = await analyzeWorkspaceCommandContractSourceRemoval({
      workspaceId,
      sourceKind: "platform_service",
      sourceId: forms.id,
      providedCapabilities: forms.domain.capabilities?.provides ?? [],
    });

    expect(impact.capabilityConsumers).toEqual([{
      sourceKind: "module",
      sourceId: "runory.consumer",
      commandKey: "consumer.publish_report",
      capability: "forms.project_service_report",
    }]);
    expect(impact.canRemove).toBe(false);
  });

  it("blocks removal when a retained Workflow invokes an owned Command", async () => {
    const visits = loadModuleManifest("runory.service-visit");
    await syncWorkspaceCommandContracts(
      workspaceId,
      "module",
      visits.id,
      visits.version,
      visits.domain?.commands ?? [],
    );
    await publishWorkflowDefinition(workspaceId, {
      workflowKey: "external-visit-completion",
      name: "External Visit Completion",
      targetObject: "service_visit",
      initialState: "start",
      steps: [
        { id: "start", kind: "start", next: "complete" },
        { id: "complete", kind: "system_command", command: "visit.complete", next: "end" },
        { id: "end", kind: "end" },
      ],
    }, "system");

    const impact = await analyzeWorkspaceCommandContractSourceRemoval({
      workspaceId,
      sourceKind: "module",
      sourceId: visits.id,
    });

    expect(impact.workflowCommandConsumers).toEqual([{
      workflowId: "external-visit-completion",
      commandKeys: ["visit.complete"],
    }]);
    expect(impact.canRemove).toBe(false);
  });

  it("blocks removal when Automation or history retains a source-owned Workflow", async () => {
    await publishWorkflowDefinition(workspaceId, {
      workflowKey: "service-visit-completion",
      name: "Service Visit Completion",
      targetObject: "service_visit",
      initialState: "start",
      steps: [
        { id: "start", kind: "start", next: "end" },
        { id: "end", kind: "end" },
      ],
    }, "system");
    const definition = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.workflowDefinitions}
       WHERE workspace_id = ? AND workflow_id = 'service-visit-completion'`,
      [workspaceId],
    );
    const version = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.workflowDefinitionVersions}
       WHERE workspace_id = ? AND workflow_definition_id = ?`,
      [workspaceId, definition!.id],
    );
    const ts = now();
    await execute(
      `INSERT INTO ${TABLES.workflowInstances}
       (id, workspace_id, workflow_definition_id, definition_version_id,
        object_type, record_id, status, version, started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'service_visit', 'visit_1', 'completed', 1, ?, ?, ?)`,
      [genId("wfi"), workspaceId, definition!.id, version!.id, ts, ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.automationDefinitions}
       (id, workspace_id, automation_id, name, definition_json, enabled, created_at, updated_at)
       VALUES (?, ?, 'auto_visit', 'Visit Automation', ?, 1, ?, ?)`,
      [
        genId("auto"),
        workspaceId,
        JSON.stringify({
          id: "auto_visit",
          name: "Visit Automation",
          trigger: { type: "manual" },
          conditions: [],
          actions: [{
            type: "transition_workflow",
            workflowId: "service-visit-completion",
            transitionId: "end",
          }],
          enabled: true,
        }),
        ts,
        ts,
      ],
    );

    const impact = await analyzeWorkspaceCommandContractSourceRemoval({
      workspaceId,
      sourceKind: "module",
      sourceId: "runory.service-visit",
      ownedWorkflowIds: ["service-visit-completion"],
      ignoredWorkflowIds: ["service-visit-completion"],
    });

    expect(impact.automationWorkflowConsumers).toEqual([{
      automationId: "auto_visit",
      workflowIds: ["service-visit-completion"],
    }]);
    expect(impact.retainedWorkflowInstances).toEqual([{
      workflowId: "service-visit-completion",
      instanceCount: 1,
    }]);
    expect(impact.canRemove).toBe(false);
  });

  it("fails closed when a retained consumer definition is unreadable", async () => {
    const visits = loadModuleManifest("runory.service-visit");
    await syncWorkspaceCommandContracts(
      workspaceId,
      "module",
      visits.id,
      visits.version,
      visits.domain?.commands ?? [],
    );
    const ts = now();
    await execute(
      `INSERT INTO ${TABLES.workflowDefinitions}
       (id, workspace_id, workflow_id, name, target_object, definition_json, created_at, updated_at)
       VALUES (?, ?, 'broken-consumer', 'Broken', 'service_visit', '{', ?, ?)`,
      [genId("wfd"), workspaceId, ts, ts],
    );

    const impact = await analyzeWorkspaceCommandContractSourceRemoval({
      workspaceId,
      sourceKind: "module",
      sourceId: visits.id,
    });

    expect(impact.unreadableConsumers).toEqual([{
      kind: "workflow",
      id: "broken-consumer",
    }]);
    expect(impact.canRemove).toBe(false);
  });

  it("preflights the whole Pack and leaves it installed when an external consumer blocks", async () => {
    await installPack(workspaceId, "fsm-pack");
    await publishWorkflowDefinition(workspaceId, {
      workflowKey: "external-fsm-consumer",
      name: "External FSM Consumer",
      targetObject: "service_visit",
      initialState: "start",
      steps: [
        { id: "start", kind: "start", next: "complete" },
        { id: "complete", kind: "system_command", command: "visit.complete", next: "end" },
        { id: "end", kind: "end" },
      ],
    }, "system");

    await expect(uninstallPack(workspaceId, "fsm-pack"))
      .rejects.toThrow(/PACK_UNINSTALL_BLOCKED/);
    expect(await queryOne(
      `SELECT id FROM ${TABLES.packInstallations} WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "fsm-pack"],
    )).toBeDefined();
  });

  it("removes source-owned Workflow definitions during an otherwise safe uninstall", async () => {
    await installPack(workspaceId, "sales-quote-pack");
    expect(await queryOne(
      `SELECT id FROM ${TABLES.workflowDefinitions}
       WHERE workspace_id = ? AND workflow_id = 'quote-approval'`,
      [workspaceId],
    )).toBeDefined();

    await uninstallPack(workspaceId, "sales-quote-pack");

    expect(await queryOne(
      `SELECT id FROM ${TABLES.workflowDefinitions}
       WHERE workspace_id = ? AND workflow_id = 'quote-approval'`,
      [workspaceId],
    )).toBeUndefined();
  });
});
