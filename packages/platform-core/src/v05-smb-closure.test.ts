// ── v0.5 SMB Dependency Closure Tests ──
//
// These tests lock the product decision that SMB default execution depends on
// the command kernel, not on Workflow, Automation, MCP, Outbox, Entitlements,
// or Extension. Workflow may be installed and available as an optional overlay,
// but a core FSM pack lifecycle must run without starting a workflow instance.

import { describe, expect, it, beforeEach } from "vitest";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installPack } from "./installer";
import { createRecord, _clearSoftDeleteColumnCache } from "./metadata";
import {
  triageWorkOrder,
  createVisit,
  startWorkOrder,
  startTravel,
  arriveOnSite,
  submitWork,
  completeVisit,
  completeWorkOrder,
  type CommandActor,
} from "./fsm-commands";
import { getCommandHistory } from "./command-runtime";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  _clearSoftDeleteColumnCache();

  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows as unknown as Array<{ name: string }>) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${row.name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createTestWorkspace(): Promise<string> {
  const ts = now();
  const wsId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [wsId, "v0.5 SMB Closure WS", `v05-smb-${wsId}`, ts, ts],
  );
  return wsId;
}

async function countWorkflowInstances(workspaceId: string): Promise<number> {
  const v1 = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.workflowInstances} WHERE workspace_id = ?`,
    [workspaceId],
  );
  const v2 = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.workflowInstancesV2} WHERE workspace_id = ?`,
    [workspaceId],
  );
  return (v1?.count ?? 0) + (v2?.count ?? 0);
}

describe("v0.5 SMB dependency closure", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("runs the core FSM lifecycle through commands without starting workflow", async () => {
    const workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "fsm-pack");

    expect(await countWorkflowInstances(workspaceId)).toBe(0);

    const actor: CommandActor = { type: "user", id: "user_dispatcher" };
    const technicianActor: CommandActor = { type: "user", id: "user_technician" };
    const supervisorActor: CommandActor = { type: "user", id: "user_supervisor" };

    const technician = await createRecord(workspaceId, "technician", {
      name: "Default Technician",
      email: "tech@example.test",
      phone: "555-0201",
      status: "active",
      skill_tags: "general",
      service_area: "Central",
    });

    const workOrder = await createRecord(workspaceId, "work_order", {
      title: "Command-only service call",
      description: "SMB closure fixture",
      status: "new",
      priority: "medium",
      source: "manual",
      notes: "No workflow instance should be required.",
      requested_at: "2026-07-07T09:00:00Z",
    });

    const triage = await triageWorkOrder(workspaceId, workOrder.id, actor, 1, {
      priority: "high",
    });
    expect(triage.status).toBe("succeeded");
    expect(triage.newVersion).toBe(2);

    const visitCreation = await createVisit(
      workspaceId,
      workOrder.id,
      actor,
      2,
      {
        title: "Command-only visit",
        technicianId: technician.id,
        scheduledStart: "2026-07-07T10:00:00Z",
        scheduledEnd: "2026-07-07T12:00:00Z",
        notes: "Scheduled without workflow.",
      },
    );
    expect(visitCreation.status).toBe("succeeded");
    expect(visitCreation.newVersion).toBe(3);
    expect(visitCreation.aggregate.status).toBe("planned");

    const start = await startWorkOrder(workspaceId, workOrder.id, actor, 3);
    expect(start.status).toBe("succeeded");
    expect(start.newVersion).toBe(4);
    expect(start.aggregate.status).toBe("in_progress");

    const visit = await queryOne<{ id: string; aggregate_version: number }>(
      `SELECT id, aggregate_version FROM ${businessTable("service_visit")}
       WHERE workspace_id = ? AND work_order_id = ?`,
      [workspaceId, workOrder.id],
    );
    expect(visit).toBeDefined();

    const travel = await startTravel(workspaceId, visit!.id, technicianActor, 1);
    expect(travel.aggregate.status).toBe("en_route");

    const arrival = await arriveOnSite(workspaceId, visit!.id, technicianActor, 2);
    expect(arrival.aggregate.status).toBe("on_site");

    const submission = await submitWork(workspaceId, visit!.id, technicianActor, 3);
    expect(submission.status).toBe("succeeded");

    const visitCompletion = await completeVisit(workspaceId, visit!.id, technicianActor, 3);
    expect(visitCompletion.aggregate.status).toBe("completed");

    const workOrderCompletion = await completeWorkOrder(
      workspaceId,
      workOrder.id,
      supervisorActor,
      4,
      "Command-only closure path completed.",
    );
    expect(workOrderCompletion.aggregate.status).toBe("completed");
    expect(workOrderCompletion.newVersion).toBe(5);

    expect(await countWorkflowInstances(workspaceId)).toBe(0);

    const workOrderHistory = await getCommandHistory(workspaceId, "work_order", workOrder.id);
    expect(workOrderHistory.map((h) => h.commandType).reverse()).toEqual([
      "work_order.triage",
      "work_order.create_visit",
      "work_order.start",
      "work_order.complete",
    ]);

    const visitHistory = await getCommandHistory(workspaceId, "service_visit", visit!.id);
    const visitCommands = visitHistory.map((h) => h.commandType);
    expect(visitCommands).toEqual(expect.arrayContaining([
      "visit.start_travel",
      "visit.arrive",
      "visit.submit_work",
      "visit.complete",
    ]));
    expect(visitCommands).toHaveLength(4);
  });

  it("keeps v0.5 journey fixtures from directly SQL-mutating work order lifecycle", () => {
    const checkedFiles = [
      "packages/platform-core/src/fsm-pack.test.ts",
      "packages/platform-core/src/v05-journey.test.ts",
      "packages/platform-core/src/v05-smb-closure.test.ts",
    ];

    for (const file of checkedFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/UPDATE\s+\$\{businessTable\("work_order"\)\}[\s\S]*SET\s+status\s*=\s*'in_progress'/);
    }
  });
});
