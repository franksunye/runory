// ── Cron Coordinator (v0.8 — SLA Timer distributed scheduling) ──
//
// Implements a database-lease-based distributed mutex for the workflow timer
// cron job. Per architectural decision:
//
//   - Single internal cron entry, runs once per minute.
//   - Fixed task order: 1) overdue, 2) SLA warning.
//     (An overdue timer should not receive a now-meaningless warning.)
//   - Lease table: scheduled_job_leases (job_key TEXT PRIMARY KEY)
//   - Fixed job_key = 'workflow-timers'
//   - Lease duration: 2 minutes; max task runtime: 45 seconds; heartbeat every 20s.
//   - Instances that fail to acquire the lease exit silently (no error, no retry).
//   - Batch limit: 100 timers per phase, sorted by (due_at, id).
//   - Cron entry requires server-side key authentication.
//
// Idempotency is enforced at the event level via `dedupe_key` on
// `workflow_events` (see migration 0053). Even if the lease expires, the
// process crashes, or two cron instances overlap, duplicate execution can
// produce at most one event per timer.

import { TABLES } from "./contracts";
import { query, genId, now } from "./db";
import { fireOverdueTimers, fireSlaWarnings } from "./workflow";

// ── Constants ──

const JOB_KEY = "workflow-timers";

const LEASE_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const HEARTBEAT_INTERVAL_MS = 20 * 1000; // 20 seconds
const BATCH_LIMIT = 100;

// ── Types ──

export interface CronResult {
  acquired: boolean;
  overdueFired: number;
  slaWarningsSent: number;
  durationMs: number;
}

// ── Lease Management ──

/**
 * Attempt to acquire the workflow-timers lease.
 *
 * Uses SQLite's INSERT ... ON CONFLICT DO UPDATE ... WHERE to atomically
 * steal an expired lease or create a new one. If the lease is still held
 * by another owner and hasn't expired, this returns null (no lease).
 *
 * The atomicity is guaranteed by SQLite's row-level locking on the
 * PRIMARY KEY (job_key) conflict resolution.
 */
async function acquireLease(): Promise<string | null> {
  const ownerId = genId("cron");
  const ts = now();
  const leaseUntil = new Date(Date.now() + LEASE_DURATION_MS).toISOString();

  // INSERT ... ON CONFLICT: if the row exists, only update if the existing
  // lease_until has passed (i.e., the lease is expired). If the WHERE
  // clause doesn't match, no rows are affected.
  const result = await query(
    `INSERT INTO ${TABLES.scheduledJobLeases}
       (job_key, owner_id, lease_until, heartbeat_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(job_key) DO UPDATE
       SET owner_id = excluded.owner_id,
           lease_until = excluded.lease_until,
           heartbeat_at = excluded.heartbeat_at
     WHERE ${TABLES.scheduledJobLeases}.lease_until < ?`,
    [JOB_KEY, ownerId, leaseUntil, ts, ts],
  );

  if (result.rowsAffected > 0) {
    return ownerId;
  }
  return null;
}

/**
 * Renew (heartbeat) the lease.
 *
 * Only succeeds if the caller still owns the lease. If another instance
 * has stolen it (e.g., after expiry), this is a no-op.
 */
async function renewLease(ownerId: string): Promise<boolean> {
  const leaseUntil = new Date(Date.now() + LEASE_DURATION_MS).toISOString();
  const ts = now();

  const result = await query(
    `UPDATE ${TABLES.scheduledJobLeases}
     SET lease_until = ?, heartbeat_at = ?
     WHERE job_key = ? AND owner_id = ?`,
    [leaseUntil, ts, JOB_KEY, ownerId],
  );

  return result.rowsAffected > 0;
}

/**
 * Release the lease after processing completes.
 *
 * Deletes the lease row so the next cron tick can acquire it immediately
 * without waiting for expiry.
 */
async function releaseLease(ownerId: string): Promise<void> {
  await query(
    `DELETE FROM ${TABLES.scheduledJobLeases}
     WHERE job_key = ? AND owner_id = ?`,
    [JOB_KEY, ownerId],
  );
}

// ── Heartbeat Manager ──

/**
 * Start a periodic heartbeat that renews the lease every 20 seconds.
 *
 * Returns a stop function that clears the interval. The heartbeat is
 * best-effort — if renewal fails (e.g., lease was stolen), processing
 * continues but the result may be superseded.
 */
function startHeartbeat(ownerId: string): () => void {
  const interval = setInterval(async () => {
    try {
      await renewLease(ownerId);
    } catch {
      // Heartbeat failure is non-fatal — the lease will expire naturally
      // and another instance can take over. Processing that is already
      // in-flight will complete, but no new events will be attributed
      // to this owner after expiry.
    }
  }, HEARTBEAT_INTERVAL_MS);

  return () => clearInterval(interval);
}

// ── Main Cron Entry Point ──

/**
 * Run the workflow timer cron job.
 *
 * This is the single entry point for the internal cron scheduler. It:
 *   1. Attempts to acquire the distributed lease.
 *   2. If unsuccessful, returns immediately (silent skip).
 *   3. Processes overdue timers (batch limit 100).
 *   4. Processes SLA warnings (batch limit 100).
 *   5. Releases the lease.
 *
 * The fixed order (overdue → SLA warning) ensures that a timer that is
 * already overdue does not receive a now-meaningless warning.
 *
 * Idempotency is guaranteed at the event level via dedupe_key, so even
 * if two cron instances overlap (e.g., lease expiry + crash), duplicate
 * events cannot be produced.
 *
 * @returns CronResult with acquisition status and processing counts.
 */
export async function runWorkflowTimerCron(): Promise<CronResult> {
  const startTime = Date.now();

  // Step 1: Acquire lease
  const ownerId = await acquireLease();
  if (!ownerId) {
    return {
      acquired: false,
      overdueFired: 0,
      slaWarningsSent: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Start heartbeat
  const stopHeartbeat = startHeartbeat(ownerId);

  try {
    // Step 2: Process overdue timers (cross-workspace, batch limit 100)
    const overdueResult = await fireOverdueTimers(undefined, BATCH_LIMIT);

    // Step 3: Process SLA warnings (cross-workspace, batch limit 100)
    //
    // This runs AFTER overdue processing so that a timer that has already
    // become overdue does not receive a now-meaningless warning.
    const slaResult = await fireSlaWarnings(undefined, BATCH_LIMIT);

    return {
      acquired: true,
      overdueFired: overdueResult.fired,
      slaWarningsSent: slaResult.warned,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Always release the lease and stop the heartbeat
    stopHeartbeat();
    await releaseLease(ownerId);
  }
}
