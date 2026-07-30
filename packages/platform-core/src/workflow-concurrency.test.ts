// ── Workflow Concurrency & Atomicity Tests ──
//
// Validates the three architectural decisions from the design spec:
//   1. Event sequence allocator: unique sequential numbers, no gaps.
//   2. Lease mutual exclusion: ON CONFLICT DO UPDATE WHERE atomicity.
//   3. Crash recovery: transaction rollback + dedupe_key idempotency.
//
// Testing strategy:
//   SQLite (via libsql) uses a single-writer model — true concurrent write
//   transactions on the same connection are not possible, and busy_timeout
//   does not apply to BEGIN IMMEDIATE in the libsql native binding.
//
//   Instead of testing true concurrency, we validate the SQL-level atomicity
//   guarantees that UNDERPIN concurrent safety:
//     - The subquery + UPDATE pattern allocates correct sequences
//     - dedupe_key prevents duplicate events on retry
//     - ON CONFLICT DO UPDATE WHERE provides atomic lease arbitration
//     - Transaction rollback prevents partial writes on crash
//
//   In production (PostgreSQL/cloud mode), these same SQL patterns execute
//   within transactions that benefit from MVCC row-level locking, providing
//   the concurrent safety guarantees validated here at the SQL level.

import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TABLES } from "./contracts";
import {
  batch,
  db,
  execute,
  genId,
  now,
  queryAll,
  queryOne,
  runInTransaction,
  type BatchStatement,
} from "./db";
import { runMigrations } from "./migrations";
import {
  fireOverdueTimers,
  fireSlaWarnings,
  publishWorkflowDefinition,
  type WorkflowDefinition,
  type WorkflowInstanceRow,
} from "./workflow";
import {
  acquireLease,
  releaseLease,
  runWorkflowTimerCron,
} from "./cron-coordinator";

// ── Test DB Setup ──

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;
let definitionId: string;
let versionId: string;

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  // Use db.execute() directly (not execute()) to avoid triggering ensureSchema()
  // which would run migrations before we drop the tables.
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows as unknown as Array<{ name: string }>) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${row.name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
  globalThis.__platformSchemaReady = Promise.resolve();
}

async function setupWorkspace(): Promise<void> {
  workspaceId = genId("ws");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, 'Workflow Atomicity Test', ?, ?, ?)`,
    [workspaceId, `wf-atomicity-${workspaceId}`, ts, ts],
  );
}

/** Create and publish a minimal workflow definition, then return IDs. */
async function setupWorkflowDefinition(): Promise<void> {
  const def: WorkflowDefinition = {
    workflowKey: "atomicity-test",
    name: "Atomicity Test Workflow",
    targetObject: "test_record",
    initialState: "draft",
    steps: [
      { id: "start", kind: "start", next: "task" },
      { id: "task", kind: "human_task", next: "end" },
      { id: "end", kind: "end" },
    ],
  };
  const result = await publishWorkflowDefinition(workspaceId, def, null);
  definitionId = result.definitionId;
  versionId = result.versionId;
}

/**
 * Create a workflow instance directly via SQL, with a `workflow.started`
 * event at sequence 1 (matching what `startWorkflow` / effect provider does).
 *
 * Returns the instance ID.
 */
async function createInstance(recordId?: string): Promise<string> {
  const instanceId = genId("wfi");
  const ts = now();
  const recId = recordId ?? genId("rec");

  await batch([
    {
      sql: `INSERT INTO ${TABLES.workflowInstances}
            (id, workspace_id, workflow_definition_id, definition_version_id,
             object_type, record_id, status, current_step_id, version,
             next_event_sequence, started_by, started_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'test_record', ?, 'running', 'task', 1,
                    2, 'system', ?, ?, ?)`,
      args: [instanceId, workspaceId, definitionId, versionId, recId, ts, ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at, dedupe_key)
            VALUES (?, ?, ?, 1, 'workflow.started', 'start', 'system', 'system', ?, ?, NULL)`,
      args: [genId("wfe"), workspaceId, instanceId, JSON.stringify({}), ts],
    },
  ]);

  return instanceId;
}

/** Create an overdue SLA timer on a given instance. */
async function createOverdueTimer(
  instanceId: string,
  workItemId?: string,
): Promise<string> {
  const timerId = genId("wft");
  const ts = now();
  // due_at is 1 hour in the past -> already overdue
  const dueAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  await execute(
    `INSERT INTO ${TABLES.workflowTimers}
     (id, workspace_id, instance_id, work_item_id, timer_type,
      due_at, status, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'sla', ?, 'active', ?, ?, ?)`,
    [
      timerId, workspaceId, instanceId, workItemId ?? null,
      dueAt,
      JSON.stringify({ stepId: "task", sla: "1h" }),
      new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      ts,
    ],
  );

  return timerId;
}

/** Read all events for an instance, ordered by sequence. */
async function getEvents(instanceId: string) {
  return queryAll<{
    sequence: number;
    event_type: string;
    dedupe_key: string | null;
  }>(
    `SELECT sequence, event_type, dedupe_key
     FROM ${TABLES.workflowEvents}
     WHERE instance_id = ?
     ORDER BY sequence ASC`,
    [instanceId],
  );
}

// ── Tests ──

describe("Workflow Atomicity & Concurrency Guarantees", () => {
  beforeEach(async () => {
    await resetDatabase();
    await setupWorkspace();
    await setupWorkflowDefinition();
  });

  // ────────────────────────────────────────────────────────────
  // §1 Event Sequence Allocator
  //
  // Validates that the subquery + UPDATE pattern allocates unique,
  // sequential event numbers with no gaps or duplicates.
  // ────────────────────────────────────────────────────────────

  describe("§1 Event sequence allocator", () => {
    it("should allocate unique sequential numbers for 60 sequential timer events", async () => {
      const instanceId = await createInstance();

      // Create 60 overdue timers
      const timerIds: string[] = [];
      for (let i = 0; i < 60; i++) {
        timerIds.push(await createOverdueTimer(instanceId));
      }

      // Fire all timers in a single call (processes sequentially within fireOverdueTimers)
      const result = await fireOverdueTimers(workspaceId, 100);
      expect(result.fired).toBe(60);

      // Verify events: 1 (started) + 60 (overdue) = 61
      const events = await getEvents(instanceId);
      expect(events.length).toBe(61);

      // Verify sequences are 1..61 with no gaps or duplicates
      const sequences = events.map((e) => e.sequence);
      for (let i = 0; i < sequences.length; i++) {
        expect(sequences[i]).toBe(i + 1);
      }

      // All overdue events have unique dedupe_keys matching timer IDs
      const overdueEvents = events.filter((e) => e.event_type === "timer.overdue");
      expect(overdueEvents.length).toBe(60);

      const dedupeKeys = overdueEvents.map((e) => e.dedupe_key);
      const uniqueKeys = new Set(dedupeKeys);
      expect(uniqueKeys.size).toBe(60);

      for (const timerId of timerIds) {
        expect(dedupeKeys).toContain(`timer:${timerId}:overdue`);
      }

      // All timers should be in 'fired' status
      const timers = await queryAll<{ status: string }>(
        `SELECT status FROM ${TABLES.workflowTimers} WHERE instance_id = ?`,
        [instanceId],
      );
      for (const timer of timers) {
        expect(timer.status).toBe("fired");
      }
    });

    it("should not modify instance business version when allocating event sequences", async () => {
      const instanceId = await createInstance();
      const before = await queryOne<WorkflowInstanceRow>(
        `SELECT * FROM ${TABLES.workflowInstances} WHERE id = ?`,
        [instanceId],
      );
      expect(before?.version).toBe(1);
      expect(before?.next_event_sequence).toBe(2);

      // Append an event via fireOverdueTimers
      await createOverdueTimer(instanceId);
      await fireOverdueTimers(workspaceId, 100);

      const after = await queryOne<WorkflowInstanceRow>(
        `SELECT * FROM ${TABLES.workflowInstances} WHERE id = ?`,
        [instanceId],
      );

      // Business version should NOT change (sequence allocation is internal)
      expect(after?.version).toBe(1);
      // Counter should have incremented
      expect(after?.next_event_sequence).toBe(3);
    });

    it("should produce correct sequences when two event allocations execute sequentially", async () => {
      const instanceId = await createInstance();

      // Prepare two sets of event statements (simulating two business commands)
      // Each uses the subquery pattern: INSERT with (SELECT next_event_sequence) + UPDATE counter
      const makeEventStmts = (): BatchStatement[] => [
        {
          sql: `INSERT INTO ${TABLES.workflowEvents}
                (id, workspace_id, instance_id, sequence, event_type, step_id,
                 actor_type, actor_id, payload_json, occurred_at, dedupe_key)
                VALUES (?, ?, ?,
                  (SELECT next_event_sequence FROM ${TABLES.workflowInstances} WHERE id = ?),
                  'workflow.manual_event', 'task', 'user', 'test-user', ?, ?, NULL)`,
          args: [
            genId("wfe"), workspaceId, instanceId, instanceId,
            JSON.stringify({ source: "manual" }), now(),
          ],
        },
        {
          sql: `UPDATE ${TABLES.workflowInstances}
                SET next_event_sequence = next_event_sequence + 1
                WHERE id = ?`,
          args: [instanceId],
          expectedRowsAffected: 1,
        },
      ];

      // Execute first allocation
      await batch(makeEventStmts());

      // Execute second allocation
      await batch(makeEventStmts());

      // Verify both events got unique sequential numbers
      const events = await getEvents(instanceId);
      expect(events.length).toBe(3); // started + 2 manual

      expect(events[0].sequence).toBe(1); // workflow.started
      expect(events[1].sequence).toBe(2); // first manual
      expect(events[2].sequence).toBe(3); // second manual

      // Counter should now be 4
      const instance = await queryOne<WorkflowInstanceRow>(
        `SELECT * FROM ${TABLES.workflowInstances} WHERE id = ?`,
        [instanceId],
      );
      expect(instance?.next_event_sequence).toBe(4);
    });

    it("should rollback the entire batch when the UPDATE guard fails", async () => {
      const instanceId = await createInstance();

      // Prepare event statements targeting a non-existent instance
      // The INSERT subquery returns NULL (no row), so the INSERT succeeds with sequence=NULL
      // but the UPDATE affects 0 rows, triggering the guard
      const badStmts: BatchStatement[] = [
        {
          sql: `INSERT INTO ${TABLES.workflowEvents}
                (id, workspace_id, instance_id, sequence, event_type, step_id,
                 actor_type, actor_id, payload_json, occurred_at, dedupe_key)
                VALUES (?, ?, ?,
                  (SELECT next_event_sequence FROM ${TABLES.workflowInstances} WHERE id = ?),
                  'workflow.bad', 'task', 'user', 'test', ?, ?, NULL)`,
          args: [
            genId("wfe"), workspaceId, "nonexistent-instance", "nonexistent-instance",
            JSON.stringify({}), now(),
          ],
        },
        {
          sql: `UPDATE ${TABLES.workflowInstances}
                SET next_event_sequence = next_event_sequence + 1
                WHERE id = ?`,
          args: ["nonexistent-instance"],
          expectedRowsAffected: 1,
        },
      ];

      // Should fail because UPDATE affects 0 rows
      await expect(batch(badStmts)).rejects.toThrow();

      // Verify no event was written (transaction rolled back)
      const events = await queryAll<{ id: string }>(
        `SELECT id FROM ${TABLES.workflowEvents} WHERE instance_id = 'nonexistent-instance'`,
      );
      expect(events.length).toBe(0);

      // Original instance should be unaffected
      const instanceEvents = await getEvents(instanceId);
      expect(instanceEvents.length).toBe(1); // only workflow.started
    });
  });

  // ────────────────────────────────────────────────────────────
  // §2 Lease Mutual Exclusion
  //
  // Validates that the INSERT ... ON CONFLICT DO UPDATE ... WHERE
  // SQL pattern provides atomic lease arbitration.
  // ────────────────────────────────────────────────────────────

  describe("§2 Cron lease mutual exclusion", () => {
    beforeEach(async () => {
      await execute(`DELETE FROM ${TABLES.scheduledJobLeases}`);
    });

    it("should allow only the first acquireLease to succeed; second returns null", async () => {
      const owner1 = await acquireLease();
      expect(owner1).not.toBeNull();

      // Second acquire should fail (lease is still held, not expired)
      const owner2 = await acquireLease();
      expect(owner2).toBeNull();

      // Third acquire should also fail
      const owner3 = await acquireLease();
      expect(owner3).toBeNull();

      await releaseLease(owner1!);
    });

    it("should allow a new instance to acquire after release", async () => {
      const owner1 = await acquireLease();
      expect(owner1).not.toBeNull();

      // Cannot acquire while held
      const owner2 = await acquireLease();
      expect(owner2).toBeNull();

      // Release and try again
      await releaseLease(owner1!);
      const owner3 = await acquireLease();
      expect(owner3).not.toBeNull();
      expect(owner3).not.toBe(owner1);

      await releaseLease(owner3!);
    });

    it("should allow stealing an expired lease", async () => {
      // Insert a lease that's already expired
      const expiredTs = new Date(Date.now() - 10 * 1000).toISOString();
      await execute(
        `INSERT INTO ${TABLES.scheduledJobLeases}
         (job_key, owner_id, lease_until, heartbeat_at)
         VALUES ('workflow-timers', 'old-owner', ?, ?)`,
        [expiredTs, expiredTs],
      );

      // New acquire should succeed (steal expired lease)
      const owner = await acquireLease();
      expect(owner).not.toBeNull();
      expect(owner).not.toBe("old-owner");

      await releaseLease(owner!);
    });

    it("should not steal a lease that is still active", async () => {
      // Insert a lease that's still valid (expires in 2 minutes)
      const futureTs = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      await execute(
        `INSERT INTO ${TABLES.scheduledJobLeases}
         (job_key, owner_id, lease_until, heartbeat_at)
         VALUES ('workflow-timers', 'active-owner', ?, ?)`,
        [futureTs, futureTs],
      );

      // New acquire should fail (lease is still active)
      const owner = await acquireLease();
      expect(owner).toBeNull();

      // Clean up
      await execute(`DELETE FROM ${TABLES.scheduledJobLeases}`);
    });
  });

  // ────────────────────────────────────────────────────────────
  // §3 Crash Recovery
  //
  // Validates that transaction rollback prevents partial writes
  // and dedupe_key prevents duplicate events on retry.
  // ────────────────────────────────────────────────────────────

  describe("§3 Crash recovery", () => {
    it("should not produce partial events when transaction is aborted (crash before commit)", async () => {
      const instanceId = await createInstance();
      const timerId = await createOverdueTimer(instanceId);

      // Simulate crash: start a transaction, check dedupe_key, then throw
      // before committing. This mimics a process crash mid-processing.
      const dedupeKey = `timer:${timerId}:overdue`;
      await expect(
        runInTransaction(async (tx) => {
          // Check dedupe_key (same as fireOverdueTimers does)
          const existing = await tx.execute({
            sql: `SELECT 1 FROM ${TABLES.workflowEvents} WHERE dedupe_key = ?`,
            args: [dedupeKey],
          });
          if (existing.rows.length > 0) return false;

          // Simulate crash: throw before writing the event
          throw new Error("SIMULATED_CRASH");
        }),
      ).rejects.toThrow("SIMULATED_CRASH");

      // Verify no event was written (transaction rolled back)
      const events = await getEvents(instanceId);
      expect(events.length).toBe(1); // Only the original workflow.started

      // Timer should still be 'active' (not fired)
      const timer = await queryOne<{ status: string }>(
        `SELECT status FROM ${TABLES.workflowTimers} WHERE id = ?`,
        [timerId],
      );
      expect(timer?.status).toBe("active");

      // Now run fireOverdueTimers normally — should succeed
      const result = await fireOverdueTimers(workspaceId, 100);
      expect(result.fired).toBe(1);

      // Verify event was written with correct sequence
      const eventsAfter = await getEvents(instanceId);
      expect(eventsAfter.length).toBe(2);
      expect(eventsAfter[1].sequence).toBe(2);
      expect(eventsAfter[1].event_type).toBe("timer.overdue");
      expect(eventsAfter[1].dedupe_key).toBe(dedupeKey);
    });

    it("should not produce duplicate events when fireOverdueTimers runs twice (idempotent)", async () => {
      const instanceId = await createInstance();
      const timerId = await createOverdueTimer(instanceId);

      // First run — should fire the event
      const result1 = await fireOverdueTimers(workspaceId, 100);
      expect(result1.fired).toBe(1);

      // Second run — should be idempotent (dedupe_key prevents duplicate)
      const result2 = await fireOverdueTimers(workspaceId, 100);
      expect(result2.fired).toBe(0);

      // Only 2 events total: workflow.started + timer.overdue
      const events = await getEvents(instanceId);
      expect(events.length).toBe(2);

      // Timer should be 'fired' (updated by both runs, but only first wrote event)
      const timer = await queryOne<{ status: string }>(
        `SELECT status FROM ${TABLES.workflowTimers} WHERE id = ?`,
        [timerId],
      );
      expect(timer?.status).toBe("fired");
    });

    it("should not produce duplicate SLA warning events on repeated runs", async () => {
      const instanceId = await createInstance();

      // Create a timer that's past the warning threshold but NOT yet overdue.
      // 3h SLA, created 2h ago, due 1h in the future:
      //   totalDuration = 3h (≤ 4h → warnAt = dueAt - 1.5h = now - 0.5h)
      //   remaining = 1h (> 0, not overdue)
      //   now > warnAt ✓
      const timerId = genId("wft");
      const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const dueAt = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
      await execute(
        `INSERT INTO ${TABLES.workflowTimers}
         (id, workspace_id, instance_id, work_item_id, timer_type,
          due_at, status, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'sla', ?, 'active', ?, ?, ?)`,
        [
          timerId, workspaceId, instanceId,
          dueAt,
          JSON.stringify({ stepId: "task", sla: "3h" }),
          createdAt,
          now(),
        ],
      );

      // First run — should send warning
      const result1 = await fireSlaWarnings(workspaceId, 100);
      expect(result1.warned).toBe(1);

      // Second run — should be idempotent
      const result2 = await fireSlaWarnings(workspaceId, 100);
      expect(result2.warned).toBe(0);

      // Only 2 events: workflow.started + timer.sla_warning
      const events = await getEvents(instanceId);
      expect(events.length).toBe(2);
      expect(events[1].event_type).toBe("timer.sla_warning");
      expect(events[1].dedupe_key).toBe(`timer:${timerId}:sla_warning`);
    });

    it("should handle crash during SLA warning processing (rollback + retry)", async () => {
      const instanceId = await createInstance();

      // Create a timer past the warning threshold
      const timerId = genId("wft");
      const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const dueAt = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
      await execute(
        `INSERT INTO ${TABLES.workflowTimers}
         (id, workspace_id, instance_id, work_item_id, timer_type,
          due_at, status, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'sla', ?, 'active', ?, ?, ?)`,
        [
          timerId, workspaceId, instanceId,
          dueAt,
          JSON.stringify({ stepId: "task", sla: "3h" }),
          createdAt,
          now(),
        ],
      );

      // Simulate crash during SLA warning processing
      const dedupeKey = `timer:${timerId}:sla_warning`;
      await expect(
        runInTransaction(async (tx) => {
          const existing = await tx.execute({
            sql: `SELECT 1 FROM ${TABLES.workflowEvents} WHERE dedupe_key = ?`,
            args: [dedupeKey],
          });
          if (existing.rows.length > 0) return false;
          throw new Error("SIMULATED_CRASH_DURING_SLA");
        }),
      ).rejects.toThrow("SIMULATED_CRASH_DURING_SLA");

      // No event should have been written
      const events = await getEvents(instanceId);
      expect(events.length).toBe(1);

      // Retry should succeed
      const result = await fireSlaWarnings(workspaceId, 100);
      expect(result.warned).toBe(1);

      const eventsAfter = await getEvents(instanceId);
      expect(eventsAfter.length).toBe(2);
      expect(eventsAfter[1].dedupe_key).toBe(dedupeKey);
    });
  });

  // ────────────────────────────────────────────────────────────
  // §4 Business + Cron Interleaving
  //
  // Validates that cron events and manual business events use the
  // same sequence allocation pattern, producing unique sequences
  // when interleaved.
  // ────────────────────────────────────────────────────────────

  describe("§4 Business + cron interleaving", () => {
    it("should maintain unique sequential numbers when cron and manual events interleave", async () => {
      const instanceId = await createInstance();

      // Create 20 overdue timers (cron path)
      for (let i = 0; i < 20; i++) {
        await createOverdueTimer(instanceId);
      }

      // Fire cron events (fireOverdueTimers processes all 20)
      const cronResult = await fireOverdueTimers(workspaceId, 100);
      expect(cronResult.fired).toBe(20);

      // Append a manual event (business path, same subquery + UPDATE pattern)
      const manualStmts: BatchStatement[] = [
        {
          sql: `INSERT INTO ${TABLES.workflowEvents}
                (id, workspace_id, instance_id, sequence, event_type, step_id,
                 actor_type, actor_id, payload_json, occurred_at, dedupe_key)
                VALUES (?, ?, ?,
                  (SELECT next_event_sequence FROM ${TABLES.workflowInstances} WHERE id = ?),
                  'workflow.manual_event', 'task', 'user', 'test-user', ?, ?, NULL)`,
          args: [
            genId("wfe"), workspaceId, instanceId, instanceId,
            JSON.stringify({ source: "manual" }), now(),
          ],
        },
        {
          sql: `UPDATE ${TABLES.workflowInstances}
                SET next_event_sequence = next_event_sequence + 1
                WHERE id = ?`,
          args: [instanceId],
          expectedRowsAffected: 1,
        },
      ];
      await batch(manualStmts);

      // Verify all events have unique sequential numbers
      const events = await getEvents(instanceId);

      // 1 (started) + 20 (overdue) + 1 (manual) = 22
      expect(events.length).toBe(22);

      const sequences = events.map((e) => e.sequence);
      for (let i = 0; i < sequences.length; i++) {
        expect(sequences[i]).toBe(i + 1);
      }

      // No duplicate sequences
      const uniqueSeqs = new Set(sequences);
      expect(uniqueSeqs.size).toBe(sequences.length);

      // The manual event should be the last one (sequence 22)
      expect(events[21].event_type).toBe("workflow.manual_event");
      expect(events[21].sequence).toBe(22);
    });

    it("should maintain correct sequences when manual event fires before cron", async () => {
      const instanceId = await createInstance();

      // Manual event first
      const manualStmts: BatchStatement[] = [
        {
          sql: `INSERT INTO ${TABLES.workflowEvents}
                (id, workspace_id, instance_id, sequence, event_type, step_id,
                 actor_type, actor_id, payload_json, occurred_at, dedupe_key)
                VALUES (?, ?, ?,
                  (SELECT next_event_sequence FROM ${TABLES.workflowInstances} WHERE id = ?),
                  'workflow.manual_event', 'task', 'user', 'test-user', ?, ?, NULL)`,
          args: [
            genId("wfe"), workspaceId, instanceId, instanceId,
            JSON.stringify({ source: "manual" }), now(),
          ],
        },
        {
          sql: `UPDATE ${TABLES.workflowInstances}
                SET next_event_sequence = next_event_sequence + 1
                WHERE id = ?`,
          args: [instanceId],
          expectedRowsAffected: 1,
        },
      ];
      await batch(manualStmts);

      // Then cron event
      await createOverdueTimer(instanceId);
      const cronResult = await fireOverdueTimers(workspaceId, 100);
      expect(cronResult.fired).toBe(1);

      const events = await getEvents(instanceId);
      expect(events.length).toBe(3);

      // started(1), manual(2), overdue(3)
      expect(events[0].sequence).toBe(1);
      expect(events[0].event_type).toBe("workflow.started");
      expect(events[1].sequence).toBe(2);
      expect(events[1].event_type).toBe("workflow.manual_event");
      expect(events[2].sequence).toBe(3);
      expect(events[2].event_type).toBe("timer.overdue");
    });
  });

  // ────────────────────────────────────────────────────────────
  // §5 Full Cron Coordinator Integration
  //
  // Validates end-to-end cron execution: acquire lease → process
  // timers → release lease.
  // ────────────────────────────────────────────────────────────

  describe("§5 Full cron coordinator", () => {
    beforeEach(async () => {
      await execute(`DELETE FROM ${TABLES.scheduledJobLeases}`);
    });

    it("should process timers end-to-end via runWorkflowTimerCron", async () => {
      const instanceId = await createInstance();
      await createOverdueTimer(instanceId);

      const result = await runWorkflowTimerCron();

      expect(result.acquired).toBe(true);
      expect(result.overdueFired).toBe(1);
      // SLA warnings: the overdue timer's warning threshold has also passed,
      // but since it's already fired (overdue processed first), it won't
      // generate a warning. The timer status is now 'fired', not 'active'.
      expect(result.slaWarningsSent).toBe(0);

      // Lease should be released after completion
      const lease = await queryOne<{ owner_id: string }>(
        `SELECT owner_id FROM ${TABLES.scheduledJobLeases} WHERE job_key = 'workflow-timers'`,
      );
      expect(lease).toBeUndefined();
    });

    it("should skip processing when lease is held by another instance", async () => {
      // Pre-acquire the lease
      const ownerId = await acquireLease();
      expect(ownerId).not.toBeNull();

      // Create an overdue timer — it should NOT be processed
      const instanceId = await createInstance();
      await createOverdueTimer(instanceId);

      const result = await runWorkflowTimerCron();

      // Should not acquire lease, should not process anything
      expect(result.acquired).toBe(false);
      expect(result.overdueFired).toBe(0);
      expect(result.slaWarningsSent).toBe(0);

      // Timer should still be active
      const timer = await queryOne<{ status: string }>(
        `SELECT status FROM ${TABLES.workflowTimers} WHERE instance_id = ?`,
        [instanceId],
      );
      expect(timer?.status).toBe("active");

      // Clean up
      await releaseLease(ownerId!);
    });

    it("should process both overdue and SLA warning timers in correct order", async () => {
      // Instance 1: overdue timer (should be fired, not warned)
      const instance1 = await createInstance();
      await createOverdueTimer(instance1);

      // Instance 2: SLA warning timer (past warning, not yet overdue)
      const instance2 = await createInstance();
      const warnTimerId = genId("wft");
      const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const dueAt = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
      await execute(
        `INSERT INTO ${TABLES.workflowTimers}
         (id, workspace_id, instance_id, work_item_id, timer_type,
          due_at, status, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'sla', ?, 'active', ?, ?, ?)`,
        [
          warnTimerId, workspaceId, instance2,
          dueAt,
          JSON.stringify({ stepId: "task", sla: "3h" }),
          createdAt,
          now(),
        ],
      );

      const result = await runWorkflowTimerCron();

      expect(result.acquired).toBe(true);
      expect(result.overdueFired).toBe(1);
      expect(result.slaWarningsSent).toBe(1);

      // Verify overdue timer is fired
      const overdueTimer = await queryOne<{ status: string }>(
        `SELECT status FROM ${TABLES.workflowTimers} WHERE instance_id = ?`,
        [instance1],
      );
      expect(overdueTimer?.status).toBe("fired");

      // Verify SLA warning timer is still active (warning doesn't fire it)
      const warnTimer = await queryOne<{ status: string }>(
        `SELECT status FROM ${TABLES.workflowTimers} WHERE instance_id = ?`,
        [instance2],
      );
      expect(warnTimer?.status).toBe("active");

      // Verify events
      const events1 = await getEvents(instance1);
      expect(events1.length).toBe(2); // started + overdue
      expect(events1[1].event_type).toBe("timer.overdue");

      const events2 = await getEvents(instance2);
      expect(events2.length).toBe(2); // started + sla_warning
      expect(events2[1].event_type).toBe("timer.sla_warning");
    });
  });
});
