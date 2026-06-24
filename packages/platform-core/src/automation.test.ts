import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import {
  createAutomation,
  getAutomations,
  getAutomation,
  updateAutomation,
  deleteAutomation,
  setAutomationEnabled,
  dryRunAutomation,
  runAutomation,
  getAutomationRuns,
  findAutomationsForRecordEvent,
  type AutomationDefinitionInfo,
} from "./automation";
import type { AutomationDefinition } from "@runory/contracts";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;

const ACTOR_ID = "usr_admin";

const SAMPLE_AUTOMATION: AutomationDefinition = {
  id: "overdue-task-reminder",
  name: "逾期任务提醒",
  description: "当任务状态变更为逾期时发送通知",
  trigger: {
    type: "record_field_changed",
    targetObject: "task",
    fieldKey: "status",
  },
  conditions: [
    { field: "status", operator: "eq", value: "overdue" },
  ],
  actions: [
    {
      type: "send_notification",
      message: "任务「{{record.title}}」已逾期，请及时处理",
    },
  ],
  enabled: true,
};

async function resetDatabase() {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;

  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DROP TABLE IF EXISTS "${name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createTestWorkspace() {
  const ts = now();
  workspaceId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, "Automation Test WS", "automation-test-ws", ts, ts]
  );
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await createTestWorkspace();
});

// ── CRUD Tests ──

describe("automation CRUD", () => {
  it("creates an automation definition", async () => {
    const result = await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    expect(result.id).toBeDefined();
    expect(result.automationId).toBe("overdue-task-reminder");
    expect(result.name).toBe("逾期任务提醒");
    expect(result.enabled).toBe(true);
    expect(result.definition.trigger.type).toBe("record_field_changed");
    expect(result.definition.conditions).toHaveLength(1);
    expect(result.definition.actions).toHaveLength(1);
  });

  it("rejects invalid automation (missing actions)", async () => {
    const bad = { ...SAMPLE_AUTOMATION, actions: [] } as unknown as AutomationDefinition;
    await expect(createAutomation(workspaceId, bad, ACTOR_ID)).rejects.toThrow();
  });

  it("rejects record_field_changed without fieldKey", async () => {
    const bad: AutomationDefinition = {
      ...SAMPLE_AUTOMATION,
      trigger: { type: "record_field_changed", targetObject: "task" },
    };
    await expect(createAutomation(workspaceId, bad, ACTOR_ID)).rejects.toThrow();
  });

  it("rejects schedule without cron", async () => {
    const bad: AutomationDefinition = {
      ...SAMPLE_AUTOMATION,
      trigger: { type: "schedule" },
    };
    await expect(createAutomation(workspaceId, bad, ACTOR_ID)).rejects.toThrow();
  });

  it("lists automations", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    await createAutomation(
      workspaceId,
      { ...SAMPLE_AUTOMATION, id: "welcome-email", name: "欢迎邮件" },
      ACTOR_ID
    );
    const list = await getAutomations(workspaceId);
    expect(list).toHaveLength(2);
    expect(list.map(a => a.automationId)).toEqual(
      expect.arrayContaining(["overdue-task-reminder", "welcome-email"])
    );
  });

  it("gets a single automation by id", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    const result = await getAutomation(workspaceId, "overdue-task-reminder");
    expect(result).toBeDefined();
    expect(result!.name).toBe("逾期任务提醒");
  });

  it("returns undefined for non-existent automation", async () => {
    const result = await getAutomation(workspaceId, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("updates an automation", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    const updated = await updateAutomation(
      workspaceId,
      "overdue-task-reminder",
      { name: "逾期任务提醒（已更新）" },
      ACTOR_ID
    );
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("逾期任务提醒（已更新）");
  });

  it("deletes an automation", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    const deleted = await deleteAutomation(workspaceId, "overdue-task-reminder", ACTOR_ID);
    expect(deleted).toBe(true);
    const result = await getAutomation(workspaceId, "overdue-task-reminder");
    expect(result).toBeUndefined();
  });

  it("returns false when deleting non-existent automation", async () => {
    const deleted = await deleteAutomation(workspaceId, "nonexistent", ACTOR_ID);
    expect(deleted).toBe(false);
  });

  it("enables and disables an automation", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    const disabled = await setAutomationEnabled(workspaceId, "overdue-task-reminder", false, ACTOR_ID);
    expect(disabled!.enabled).toBe(false);
    const reenabled = await setAutomationEnabled(workspaceId, "overdue-task-reminder", true, ACTOR_ID);
    expect(reenabled!.enabled).toBe(true);
  });
});

// ── Dry Run Tests ──

describe("automation dry run", () => {
  it("previews a would-fire automation", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    const result = await dryRunAutomation(workspaceId, "overdue-task-reminder", {
      record: { id: "rec1", title: "跟进客户", status: "overdue" },
    });
    expect(result.wouldFire).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.actionsPreview).toHaveLength(1);
    expect(result.actionsPreview[0].actionType).toBe("send_notification");
    expect(result.actionsPreview[0].description).toContain("跟进客户");
  });

  it("reports conditions not met", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    const result = await dryRunAutomation(workspaceId, "overdue-task-reminder", {
      record: { id: "rec1", title: "跟进客户", status: "in_progress" },
    });
    expect(result.wouldFire).toBe(false);
    expect(result.reason).toBe("Conditions not met");
    expect(result.actionsPreview).toHaveLength(0);
  });

  it("throws for non-existent automation", async () => {
    await expect(
      dryRunAutomation(workspaceId, "nonexistent", {})
    ).rejects.toThrow();
  });
});

// ── Execution Tests ──

describe("automation run", () => {
  it("skips when conditions not met", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    const run = await runAutomation(
      workspaceId,
      "overdue-task-reminder",
      "record_field_changed",
      { record: { id: "rec1", title: "跟进客户", status: "in_progress" } }
    );
    expect(run.status).toBe("skipped");
    expect(run.actionsTaken).toHaveLength(0);
    expect(run.dryRun).toBe(false);
  });

  it("executes actions when conditions met", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    const run = await runAutomation(
      workspaceId,
      "overdue-task-reminder",
      "record_field_changed",
      { record: { id: "rec1", title: "跟进客户", status: "overdue" } }
    );
    expect(run.status).toBe("success");
    expect(run.actionsTaken).toHaveLength(1);
    expect(run.actionsTaken[0].actionType).toBe("send_notification");
    expect(run.actionsTaken[0].error).toBeNull();
  });

  it("dry run does not execute actions", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    const run = await runAutomation(
      workspaceId,
      "overdue-task-reminder",
      "manual",
      { record: { id: "rec1", title: "跟进客户", status: "overdue" } },
      { dryRun: true }
    );
    expect(run.status).toBe("dry_run");
    expect(run.dryRun).toBe(true);
    expect(run.actionsTaken).toHaveLength(1);
    // Dry run should not have actual results with recordId
    expect(run.actionsTaken[0].result).toEqual({
      description: expect.stringContaining("跟进客户"),
    });
  });

  it("records run history", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    await runAutomation(workspaceId, "overdue-task-reminder", "manual", {
      record: { id: "rec1", title: "任务1", status: "overdue" },
    });
    await runAutomation(workspaceId, "overdue-task-reminder", "manual", {
      record: { id: "rec2", title: "任务2", status: "in_progress" },
    });

    const runs = await getAutomationRuns(workspaceId, "overdue-task-reminder");
    expect(runs).toHaveLength(2);
    // Most recent first
    expect(runs[0].status).toBe("skipped");
    expect(runs[1].status).toBe("success");
  });

  it("updates last run info on definition", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    let info = await getAutomation(workspaceId, "overdue-task-reminder");
    expect(info!.lastRunAt).toBeNull();
    expect(info!.lastRunStatus).toBeNull();

    await runAutomation(workspaceId, "overdue-task-reminder", "manual", {
      record: { id: "rec1", title: "任务1", status: "overdue" },
    });

    info = await getAutomation(workspaceId, "overdue-task-reminder");
    expect(info!.lastRunAt).not.toBeNull();
    expect(info!.lastRunStatus).toBe("success");
  });
});

// ── Trigger Matching Tests ──

describe("findAutomationsForRecordEvent", () => {
  it("finds matching automations for record_field_changed", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    await createAutomation(
      workspaceId,
      {
        ...SAMPLE_AUTOMATION,
        id: "deal-stage-change",
        name: "商机阶段变更",
        trigger: { type: "record_field_changed", targetObject: "deal", fieldKey: "stage" },
      },
      ACTOR_ID
    );

    const matches = await findAutomationsForRecordEvent(
      workspaceId,
      "record_field_changed",
      "task",
      "status"
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].automationId).toBe("overdue-task-reminder");
  });

  it("finds matching automations for record_created", async () => {
    await createAutomation(
      workspaceId,
      {
        ...SAMPLE_AUTOMATION,
        id: "new-deal-alert",
        name: "新商机提醒",
        trigger: { type: "record_created", targetObject: "deal" },
        conditions: [],
      },
      ACTOR_ID
    );

    const matches = await findAutomationsForRecordEvent(
      workspaceId,
      "record_created",
      "deal"
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].automationId).toBe("new-deal-alert");
  });

  it("excludes disabled automations", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    await setAutomationEnabled(workspaceId, "overdue-task-reminder", false, ACTOR_ID);

    const matches = await findAutomationsForRecordEvent(
      workspaceId,
      "record_field_changed",
      "task",
      "status"
    );
    expect(matches).toHaveLength(0);
  });

  it("filters by targetObject", async () => {
    await createAutomation(workspaceId, SAMPLE_AUTOMATION, ACTOR_ID);
    // Should not match because targetObject is "task" not "deal"
    const matches = await findAutomationsForRecordEvent(
      workspaceId,
      "record_field_changed",
      "deal",
      "status"
    );
    expect(matches).toHaveLength(0);
  });
});
