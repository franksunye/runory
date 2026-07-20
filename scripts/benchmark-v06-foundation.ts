import { rmSync } from "node:fs";
import { performance } from "node:perf_hooks";

const databasePath = "/tmp/runory-v06-foundation-benchmark.db";
rmSync(databasePath, { force: true });
process.env.LIBSQL_URL = `file:${databasePath}`;
process.env.LIBSQL_AUTH_TOKEN = "";

const {
  TABLES,
  batch,
  businessTable,
  createVisit,
  db,
  execute,
  getAuditEvents,
  getMyWork,
  getScheduleEntries,
  installPack,
  queryAll,
  queryOne,
  runMigrations,
  triageWorkOrder,
} = await import("../packages/platform-core/src/index.ts");

type Statement = { sql: string; args: unknown[] };
type Sample = { name: string; samples: number[] };

const workspaceId = "ws_foundation_benchmark";
const timestamp = "2026-07-20T00:00:00.000Z";

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function summarize(sample: Sample) {
  return {
    scenario: sample.name,
    samples: sample.samples.length,
    p50Ms: Number(percentile(sample.samples, 0.5).toFixed(2)),
    p95Ms: Number(percentile(sample.samples, 0.95).toFixed(2)),
    p99Ms: Number(percentile(sample.samples, 0.99).toFixed(2)),
  };
}

async function insertChunks(statements: Statement[], size = 500): Promise<void> {
  for (let index = 0; index < statements.length; index += size) {
    await batch(statements.slice(index, index + size));
  }
}

async function measure(name: string, runs: number, operation: () => Promise<unknown>): Promise<Sample> {
  await operation();
  const samples: number[] = [];
  for (let index = 0; index < runs; index++) {
    const startedAt = performance.now();
    await operation();
    samples.push(performance.now() - startedAt);
  }
  return { name, samples };
}

async function main() {
  const setupStartedAt = performance.now();
  await runMigrations();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, "Foundation benchmark", "foundation-benchmark", timestamp, timestamp],
  );
  await installPack(workspaceId, "fsm-pack", { includeDemoData: true });
  const technician = await queryOne<{ id: string }>(
    `SELECT id FROM ${businessTable("technician")}
     WHERE workspace_id = ? AND resource_id IS NOT NULL LIMIT 1`,
    [workspaceId],
  );
  if (!technician) throw new Error("Benchmark technician was not provisioned");

  const users: Statement[] = [];
  for (let index = 0; index < 50; index++) {
    users.push({
      sql: `INSERT INTO ${TABLES.users}
            (id, external_id, email, display_name, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [`usr_perf_${index}`, `perf-user-${index}`, `perf-${index}@example.com`, `Perf User ${index}`, timestamp, timestamp],
    });
    users.push({
      sql: `INSERT INTO ${TABLES.workspaceMemberships}
            (id, workspace_id, user_id, role, status, created_at, updated_at)
            VALUES (?, ?, ?, 'member', 'active', ?, ?)`,
      args: [`wsm_perf_${index}`, workspaceId, `usr_perf_${index}`, timestamp, timestamp],
    });
  }
  await insertChunks(users);

  const workOrders: Statement[] = [];
  for (let index = 0; index < 10_000; index++) {
    workOrders.push({
      sql: `INSERT INTO ${businessTable("work_order")}
            (id, workspace_id, title, status, priority, aggregate_version, created_at, updated_at)
            VALUES (?, ?, ?, 'new', 'medium', 1, ?, ?)`,
      args: [`wo_perf_${index}`, workspaceId, `Benchmark work order ${index}`, timestamp, timestamp],
    });
  }
  await insertChunks(workOrders);

  const schedules: Statement[] = [];
  for (let index = 0; index < 25_000; index++) {
    const day = index % 365;
    const startAt = new Date(Date.UTC(2026, 0, 1 + day, 8 + (index % 8))).toISOString();
    const endAt = new Date(Date.parse(startAt) + 3_600_000).toISOString();
    schedules.push({
      sql: `INSERT INTO ${TABLES.scheduleEntries}
            (id, workspace_id, subject_type, subject_id, resource_id, start_at, end_at,
             timezone, status, conflict_state, version, created_at, updated_at)
            VALUES (?, ?, 'work_order', ?, ?, ?, ?, 'UTC', 'confirmed', 'none', 1, ?, ?)`,
      args: [`sch_perf_${index}`, workspaceId, `wo_perf_${index % 10_000}`, `resource_perf_${index % 50}`, startAt, endAt, timestamp, timestamp],
    });
  }
  await insertChunks(schedules);

  const activity: Statement[] = [];
  for (let index = 0; index < 50_000; index++) {
    activity.push({
      sql: `INSERT INTO ${TABLES.auditLogs}
            (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id,
             before_json, after_json, request_id, created_at)
            VALUES (?, ?, 'user', ?, 'work_order.updated', 'work_order', ?, NULL, '{}', ?, ?)`,
      args: [`aud_perf_${index}`, workspaceId, `usr_perf_${index % 50}`, `wo_perf_${index % 10_000}`, `req_perf_${index}`, new Date(Date.parse(timestamp) + index).toISOString()],
    });
  }
  await insertChunks(activity);

  const forms: Statement[] = [];
  for (let index = 0; index < 10_000; index++) {
    forms.push({
      sql: `INSERT INTO ${TABLES.formSubmissions}
            (id, workspace_id, form_definition_id, form_version_id, subject_type, subject_id,
             revision_number, status, answers_json, submitted_by, submitted_at, created_at, updated_at)
            VALUES (?, ?, 'form_perf', 'form_version_perf', 'work_order', ?, 1, 'submitted', '{}', ?, ?, ?, ?)`,
      args: [`sub_perf_${index}`, workspaceId, `wo_perf_${index}`, `usr_perf_${index % 50}`, timestamp, timestamp, timestamp, timestamp],
    });
  }
  await insertChunks(forms);

  const workItems: Statement[] = [];
  for (let index = 0; index < 5_000; index++) {
    workItems.push({
      sql: `INSERT INTO ${TABLES.workItems}
            (id, workspace_id, instance_id, step_id, kind, status, subject_type, subject_id,
             assignee_type, assignee_id, due_at, version, created_at, updated_at)
            VALUES (?, ?, ?, 'approval', 'approval', 'ready', 'work_order', ?, 'user', ?, ?, 1, ?, ?)`,
      args: [`wi_perf_${index}`, workspaceId, `wfi_perf_${index}`, `wo_perf_${index}`, `perf-user-${index % 50}`, new Date(Date.parse(timestamp) + index * 60_000).toISOString(), timestamp, timestamp],
    });
  }
  await insertChunks(workItems);

  let complexCommandIndex = 0;
  const results = [
    summarize(await measure("planning_week", 30, () => getScheduleEntries(workspaceId, {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-08T00:00:00.000Z",
      limit: 2_000,
    }))),
    summarize(await measure("activity_first_page", 30, () => getAuditEvents(workspaceId, { limit: 100 }))),
    summarize(await measure("my_work_first_page", 30, () => getMyWork(workspaceId, "perf-user-0", { limit: 50 }))),
    summarize(await measure("simple_state_command", 30, async () => {
      const index = 100 + Math.floor(Math.random() * 8_000);
      await execute(
        `UPDATE ${businessTable("work_order")} SET status = 'new', aggregate_version = 1 WHERE workspace_id = ? AND id = ?`,
        [workspaceId, `wo_perf_${index}`],
      );
      await execute(`DELETE FROM ${TABLES.commandExecutions} WHERE workspace_id = ? AND aggregate_id = ?`, [workspaceId, `wo_perf_${index}`]);
      return triageWorkOrder(workspaceId, `wo_perf_${index}`, { type: "system", id: "test-runner" }, 1);
    })),
    summarize(await measure("create_visit_and_assign", 30, async () => {
      const index = 8_000 + complexCommandIndex++;
      const startAt = new Date(Date.UTC(2028, 0, 1 + complexCommandIndex, 8)).toISOString();
      const endAt = new Date(Date.parse(startAt) + 3_600_000).toISOString();
      await execute(
        `UPDATE ${businessTable("work_order")}
         SET status = 'triaged', aggregate_version = 2
         WHERE workspace_id = ? AND id = ?`,
        [workspaceId, `wo_perf_${index}`],
      );
      const result = await createVisit(
        workspaceId,
        `wo_perf_${index}`,
        { type: "system", id: "test-runner" },
        2,
        {
          technicianId: technician.id,
          scheduledStart: startAt,
          scheduledEnd: endAt,
        },
      );
      const projection = await queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM ${businessTable("service_visit")} visit
         JOIN ${TABLES.scheduleEntries} schedule
           ON schedule.workspace_id = visit.workspace_id
          AND schedule.id = visit.schedule_entry_id
         WHERE visit.workspace_id = ? AND visit.work_order_id = ?`,
        [workspaceId, `wo_perf_${index}`],
      );
      if (projection?.count !== 1) {
        throw new Error(`Projection was not fresh for wo_perf_${index}`);
      }
      return result;
    })),
  ];

  async function concurrentCommands(usersCount: number, offset: number) {
    const aggregateIds = Array.from({ length: usersCount }, (_, index) => `wo_perf_${offset + index}`);
    const startedAt = performance.now();
    const settled = await Promise.allSettled(
      aggregateIds.map((aggregateId) =>
        triageWorkOrder(workspaceId, aggregateId, { type: "system", id: "test-runner" }, 1),
      ),
    );
    const placeholders = aggregateIds.map(() => "?").join(", ");
    const [stateCount, executionCount, eventCount, auditCount] = await Promise.all([
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${businessTable("work_order")}
         WHERE workspace_id = ? AND id IN (${placeholders}) AND status = 'triaged' AND aggregate_version = 2`,
        [workspaceId, ...aggregateIds],
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${TABLES.commandExecutions}
         WHERE workspace_id = ? AND aggregate_id IN (${placeholders}) AND status = 'succeeded'`,
        [workspaceId, ...aggregateIds],
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${TABLES.domainEvents}
         WHERE workspace_id = ? AND aggregate_id IN (${placeholders}) AND event_type = 'work_order.triaged'`,
        [workspaceId, ...aggregateIds],
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${TABLES.auditLogs}
         WHERE workspace_id = ? AND entity_id IN (${placeholders}) AND action = 'work_order.triage'`,
        [workspaceId, ...aggregateIds],
      ),
    ]);
    const completeCommits = Math.min(
      executionCount?.count ?? 0,
      eventCount?.count ?? 0,
      auditCount?.count ?? 0,
    );
    return {
      users: usersCount,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      failures: settled.filter((result) => result.status === "rejected").length,
      lostUpdates: usersCount - (stateCount?.count ?? 0),
      partialCommits: usersCount - completeCommits,
    };
  }

  const queryPlans = {
    planning: await queryAll(
      `EXPLAIN QUERY PLAN SELECT * FROM ${TABLES.scheduleEntries}
       WHERE workspace_id = ? AND start_at >= ? AND end_at <= ?
       ORDER BY start_at ASC LIMIT 2000`,
      [workspaceId, "2026-07-01T00:00:00.000Z", "2026-07-08T00:00:00.000Z"],
    ),
    activity: await queryAll(
      `EXPLAIN QUERY PLAN SELECT * FROM ${TABLES.auditLogs}
       WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100`,
      [workspaceId],
    ),
  };

  console.log(JSON.stringify({
    commit: process.env.BENCHMARK_COMMIT ?? "working-tree",
    topology: { applicationRegion: "local", databaseRegion: "local", databaseMode: "SQLite/libSQL local file" },
    dataset: { users: 50, workOrders: 10_000, schedules: 25_000, activityEntries: 50_000, formSubmissions: 10_000, workItems: 5_000 },
    setupDurationMs: Number((performance.now() - setupStartedAt).toFixed(2)),
    results,
    concurrency: [
      await concurrentCommands(20, 8_500),
      await concurrentCommands(50, 9_000),
    ],
    queryPlans,
  }, null, 2));
  db.close();
}

await main();
