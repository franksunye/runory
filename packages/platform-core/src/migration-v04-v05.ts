// ── v0.4 → v0.5 Migration Tool ──
//
// Per v0.5 Execution Plan: Migrate legacy quote_approval data to work items +
// decisions, enable governed field enforcement, and verify integrity.
//
// The legacy quote_approval module (retired in v0.5) stored approval state in a
// dedicated business table. v0.5 replaces this with the Workflow V2 runtime:
// approval work items, immutable approval decisions, and governed fields.
//
// This tool is idempotent: running it multiple times will not duplicate work
// items or decisions. It gracefully handles the absence of the quote_approval
// table (e.g. for fresh installs that never had the legacy module).

import { queryAll, queryOne, execute, now } from "./db";
import { TABLES, businessTable } from "./contracts";
import {
  publishWorkflowDefinition,
  startWorkflowV2,
  approvalDecide,
} from "./workflow-v2";
import type { CommandActor } from "./command-runtime";
import { getGovernedFields } from "./governed-fields";

// ── Types ──

interface LegacyQuoteApprovalRow {
  id: string;
  workspace_id: string;
  quote_id: string;
  status: string;
  requested_by: string | null;
  reviewed_by: string | null;
  requested_at: string | null;
  reviewed_at: string | null;
  decision_notes: string | null;
}

interface QuoteRow {
  id: string;
  status: string;
  aggregate_version: number;
}

// ── Migration Conflict (Spec §11) ──

interface MigrationConflict {
  quoteId: string;
  type: "multiple_approvals" | "approval_state_conflict";
  message: string;
  approvalCount: number;
  statuses?: string[];
}

// ── Quote-Approval Workflow Definition (matches quote-commands.ts) ──

const QUOTE_APPROVAL_WORKFLOW_DEF = {
  workflowKey: "quote-approval",
  name: "Quote Approval",
  targetObject: "quote",
  initialState: "submitted",
  steps: [
    { id: "start", kind: "start" as const, next: "submit" },
    {
      id: "submit",
      kind: "system_command" as const,
      command: "quote.submit_for_approval",
      next: "approval",
    },
    {
      id: "approval",
      kind: "approval" as const,
      assigneeRule: { permissionGroup: "sales_manager" },
      onApprove: "approved",
      onReject: "rejected",
      policy: { allowSelfApproval: false },
    },
    {
      id: "approved",
      kind: "system_command" as const,
      command: "quote.approve",
      next: "end",
    },
    {
      id: "rejected",
      kind: "system_command" as const,
      command: "quote.reject",
      next: "end",
    },
    { id: "end", kind: "end" as const },
  ],
};

// ── Inventory ──

/**
 * Inventory: count quotes by status, detect legacy quote_approval rows,
 * count work items and command executions, and determine readiness.
 *
 * A workspace is `ready` for migration when it has quotes but no command
 * executions yet (i.e. it has not started using the v0.5 command runtime).
 */
export async function inventoryWorkspace(workspaceId: string): Promise<{
  quotesByStatus: Record<string, number>;
  legacyApprovals: number;
  workItems: number;
  commandExecutions: number;
  ready: boolean;
}> {
  // Count quotes grouped by status
  const quoteStatusRows = await queryAll<{ status: string; count: number }>(
    `SELECT status, COUNT(*) as count FROM ${businessTable("quote")}
     WHERE workspace_id = ? GROUP BY status`,
    [workspaceId]
  );
  const quotesByStatus: Record<string, number> = {};
  let totalQuotes = 0;
  for (const row of quoteStatusRows) {
    quotesByStatus[row.status] = row.count;
    totalQuotes += row.count;
  }

  // Count legacy quote_approval rows (table may not exist)
  let legacyApprovals = 0;
  try {
    const countRow = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${businessTable("quote_approval")}
       WHERE workspace_id = ?`,
      [workspaceId]
    );
    legacyApprovals = countRow?.count ?? 0;
  } catch {
    // Table does not exist — no legacy approvals to migrate
    legacyApprovals = 0;
  }

  // Count work items
  let workItems = 0;
  try {
    const workItemCount = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.workItems} WHERE workspace_id = ?`,
      [workspaceId]
    );
    workItems = workItemCount?.count ?? 0;
  } catch {
    workItems = 0;
  }

  // Count command executions
  let commandExecutions = 0;
  try {
    const cmdCount = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.commandExecutions}
       WHERE workspace_id = ?`,
      [workspaceId]
    );
    commandExecutions = cmdCount?.count ?? 0;
  } catch {
    commandExecutions = 0;
  }

  const ready = totalQuotes > 0 && commandExecutions === 0;

  return { quotesByStatus, legacyApprovals, workItems, commandExecutions, ready };
}

// ── Migrate Quote Approvals ──

/**
 * Migrate legacy quote_approval records to work items + approval decisions.
 *
 * For each legacy approval record:
 *   1. Find the associated quote.
 *   2. If a workflow instance already exists for the quote, skip (idempotent).
 *   3. If the quote is in the legacy 'pending_approval' status, update it to
 *      'in_review' (the v0.5 equivalent).
 *   4. Publish the quote-approval workflow definition (idempotent).
 *   5. Start a workflow instance (creates the approval work item).
 *   6. If the legacy approval was approved/rejected, create an approval
 *      decision via `approvalDecide` and update the quote status accordingly.
 *
 * Returns counts of migrated and skipped records, any errors encountered, and a
 * `conflicts` list for quotes with multiple legacy approvals (Spec §11).
 */
export async function migrateQuoteApprovals(
  workspaceId: string,
  actorId: string
): Promise<{
  migrated: number;
  skipped: number;
  errors: string[];
  conflicts: MigrationConflict[];
}> {
  const errors: string[] = [];
  let migrated = 0;
  let skipped = 0;
  const conflicts: MigrationConflict[] = [];

  // Spec §11: missing user identity → map to the migration (legacy) actor.
  // Legacy approvals whose requested_by/reviewed_by are null are migrated
  // under this actor so the workflow history remains attributable.
  const actor: CommandActor = { id: actorId, type: "user" };

  // Query all quote_approval records (if the table exists)
  let approvals: LegacyQuoteApprovalRow[] = [];
  try {
    approvals = await queryAll<LegacyQuoteApprovalRow>(
      `SELECT * FROM ${businessTable("quote_approval")} WHERE workspace_id = ?`,
      [workspaceId]
    );
  } catch {
    // Table does not exist — nothing to migrate
    return { migrated: 0, skipped: 0, errors: [], conflicts: [] };
  }

  // Spec §11 mapping rules: pre-compute per-quote approval counts and statuses
  // to detect (a) multiple approvals for one quote and (b) status disagreement.
  const seenQuoteIds = new Set<string>();        // quotes already migrated this run
  const conflictRecorded = new Set<string>();    // quotes already added to conflicts[]
  const approvalCountByQuote = new Map<string, number>();
  const statusesByQuote = new Map<string, Set<string>>();
  for (const a of approvals) {
    approvalCountByQuote.set(
      a.quote_id,
      (approvalCountByQuote.get(a.quote_id) ?? 0) + 1
    );
    let statuses = statusesByQuote.get(a.quote_id);
    if (!statuses) {
      statuses = new Set();
      statusesByQuote.set(a.quote_id, statuses);
    }
    statuses.add(a.status);
  }

  for (const approval of approvals) {
    try {
      // Find the associated quote
      const quote = await queryOne<QuoteRow>(
        `SELECT id, status, aggregate_version FROM ${businessTable("quote")}
         WHERE workspace_id = ? AND id = ?`,
        [workspaceId, approval.quote_id]
      );

      if (!quote) {
        errors.push(
          `Quote not found for approval ${approval.id} (quote_id: ${approval.quote_id})`
        );
        continue;
      }

      // Spec §11: skip duplicate approvals for a quote already processed this run.
      if (seenQuoteIds.has(approval.quote_id)) {
        errors.push(
          `Duplicate approval ${approval.id} for quote ${approval.quote_id} skipped (conflict flagged)`
        );
        skipped++;
        continue;
      }

      // Spec §11: record conflicts once per quote with multiple approval records.
      // Surfaced before the idempotency check so conflicts are still flagged when
      // a workflow instance already exists from a prior migration run.
      const approvalCount = approvalCountByQuote.get(approval.quote_id) ?? 1;
      const statuses = statusesByQuote.get(approval.quote_id);
      if (approvalCount > 1 && !conflictRecorded.has(approval.quote_id)) {
        conflictRecorded.add(approval.quote_id);
        if (statuses && statuses.size > 1) {
          conflicts.push({
            quoteId: approval.quote_id,
            type: "approval_state_conflict",
            message:
              `APPROVAL_STATE_CONFLICT: Quote ${approval.quote_id} has ` +
              `${approvalCount} approvals with conflicting statuses: ` +
              `${[...statuses].join(", ")}`,
            approvalCount,
            statuses: [...statuses],
          });
        } else {
          conflicts.push({
            quoteId: approval.quote_id,
            type: "multiple_approvals",
            message:
              `Quote ${approval.quote_id} has ${approvalCount} approval ` +
              `records; migrating only the first, additional approvals skipped`,
            approvalCount,
          });
        }
      }

      // Idempotency: check if a workflow instance already exists for this quote
      const existingInstance = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.workflowInstancesV2}
         WHERE workspace_id = ? AND object_type = 'quote' AND record_id = ?`,
        [workspaceId, approval.quote_id]
      );

      if (existingInstance) {
        seenQuoteIds.add(approval.quote_id);
        skipped++;
        continue;
      }

      // If the quote is in legacy 'pending_approval' status, update to 'in_review'
      if (quote.status === "pending_approval") {
        await execute(
          `UPDATE ${businessTable("quote")}
           SET status = 'in_review', updated_at = ?
           WHERE workspace_id = ? AND id = ?`,
          [now(), workspaceId, approval.quote_id]
        );
      }

      // Publish the quote-approval workflow definition (idempotent)
      await publishWorkflowDefinition(
        workspaceId,
        QUOTE_APPROVAL_WORKFLOW_DEF,
        actorId
      );

      // Start a workflow instance (creates the approval work item)
      const { instanceId } = await startWorkflowV2(
        workspaceId,
        "quote-approval",
        "quote",
        approval.quote_id,
        actor
      );

      // Locate the approval work item that was just created
      const workItem = await queryOne<{ id: string; version: number }>(
        `SELECT id, version FROM ${TABLES.workItems}
         WHERE workspace_id = ? AND instance_id = ? AND kind = 'approval'
           AND status = 'pending'`,
        [workspaceId, instanceId]
      );

      if (!workItem) {
        errors.push(
          `No approval work item created for quote ${approval.quote_id}`
        );
        continue;
      }

      // Create an approval decision based on the legacy approval status
      if (approval.status === "approved") {
        await approvalDecide(
          workspaceId,
          workItem.id,
          actor,
          "approved",
          approval.decision_notes ?? null,
          workItem.version
        );
        // Update quote status to 'approved'
        await execute(
          `UPDATE ${businessTable("quote")}
           SET status = 'approved', approved_at = ?, updated_at = ?
           WHERE workspace_id = ? AND id = ?`,
          [now(), now(), workspaceId, approval.quote_id]
        );
      } else if (approval.status === "rejected") {
        await approvalDecide(
          workspaceId,
          workItem.id,
          actor,
          "rejected",
          approval.decision_notes ?? null,
          workItem.version
        );
        // Update quote status to 'rejected'
        await execute(
          `UPDATE ${businessTable("quote")}
           SET status = 'rejected', rejected_reason = ?, updated_at = ?
           WHERE workspace_id = ? AND id = ?`,
          [
            approval.decision_notes ?? "Rejected during v0.5 migration",
            now(),
            workspaceId,
            approval.quote_id,
          ]
        );
      }
      // For 'pending' approvals, leave the work item pending (workflow in progress).
      // For 'cancelled' approvals, the workflow is started but no decision is made.

      migrated++;
      seenQuoteIds.add(approval.quote_id);
    } catch (e) {
      errors.push(
        `Failed to migrate approval ${approval.id}: ${(e as Error).message}`
      );
    }
  }

  return { migrated, skipped, errors, conflicts };
}

// ── Enable Guards ──

/**
 * Enable governed field enforcement for all aggregates.
 *
 * The governed fields are registered at module load time (in governed-fields.ts),
 * so this function is primarily a verification that the guards are active.
 * Returns true for each aggregate type if governed fields are registered.
 */
export async function enableGuards(workspaceId: string): Promise<{
  quoteGoverned: boolean;
  workOrderGoverned: boolean;
  serviceVisitGoverned: boolean;
}> {
  // Governed fields are registered globally at module load time.
  // We verify they are present for each aggregate type.
  return {
    quoteGoverned: getGovernedFields("quote").length > 0,
    workOrderGoverned: getGovernedFields("work_order").length > 0,
    serviceVisitGoverned: getGovernedFields("service_visit").length > 0,
  };
}

// ── Verify Migration ──

/**
 * Verify migration integrity.
 *
 * Checks:
 *   - Total quotes in the workspace.
 *   - Quotes that have workflow instances (object_type = 'quote').
 *   - Total and pending work items.
 *   - Orphaned approvals: legacy quote_approval records without a corresponding
 *     workflow instance.
 *
 * `integrityCheck` is true when there are no orphaned approvals AND every quote
 * in 'in_review' status has a workflow instance.
 */
export async function verifyMigration(workspaceId: string): Promise<{
  totalQuotes: number;
  quotesWithWorkflows: number;
  totalWorkItems: number;
  pendingWorkItems: number;
  orphanedApprovals: number;
  integrityCheck: boolean;
}> {
  // Count total quotes
  const totalQuoteRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${businessTable("quote")}
     WHERE workspace_id = ?`,
    [workspaceId]
  );
  const totalQuotes = totalQuoteRow?.count ?? 0;

  // Count quotes that have workflow instances
  const wfQuoteRow = await queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT record_id) as count FROM ${TABLES.workflowInstancesV2}
     WHERE workspace_id = ? AND object_type = 'quote'`,
    [workspaceId]
  );
  const quotesWithWorkflows = wfQuoteRow?.count ?? 0;

  // Count work items
  const workItemRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.workItems} WHERE workspace_id = ?`,
    [workspaceId]
  );
  const totalWorkItems = workItemRow?.count ?? 0;

  // Count pending work items
  const pendingRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.workItems}
     WHERE workspace_id = ? AND status IN ('pending', 'active')`,
    [workspaceId]
  );
  const pendingWorkItems = pendingRow?.count ?? 0;

  // Count orphaned approvals (quote_approval records without corresponding workflow instances)
  let orphanedApprovals = 0;
  try {
    const orphanedRow = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${businessTable("quote_approval")} qa
       WHERE qa.workspace_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM ${TABLES.workflowInstancesV2} wi
           WHERE wi.workspace_id = qa.workspace_id
             AND wi.object_type = 'quote'
             AND wi.record_id = qa.quote_id
         )`,
      [workspaceId]
    );
    orphanedApprovals = orphanedRow?.count ?? 0;
  } catch {
    // Table does not exist — no orphaned approvals
    orphanedApprovals = 0;
  }

  // Count in_review quotes that do NOT have a workflow instance
  const inReviewOrphanRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${businessTable("quote")} q
     WHERE q.workspace_id = ? AND q.status = 'in_review'
       AND NOT EXISTS (
         SELECT 1 FROM ${TABLES.workflowInstancesV2} wi
         WHERE wi.workspace_id = q.workspace_id
           AND wi.object_type = 'quote'
           AND wi.record_id = q.id
       )`,
    [workspaceId]
  );
  const inReviewWithoutWorkflow = inReviewOrphanRow?.count ?? 0;

  const integrityCheck =
    orphanedApprovals === 0 && inReviewWithoutWorkflow === 0;

  return {
    totalQuotes,
    quotesWithWorkflows,
    totalWorkItems,
    pendingWorkItems,
    orphanedApprovals,
    integrityCheck,
  };
}

// ── Full Migration ──

/**
 * Full migration: inventory → migrate → enable → verify.
 *
 * Runs the complete v0.4 → v0.5 migration pipeline in sequence and returns
 * the results of each stage.
 */
export async function migrateV04ToV05(
  workspaceId: string,
  actorId: string
): Promise<{
  inventory: Awaited<ReturnType<typeof inventoryWorkspace>>;
  migration: Awaited<ReturnType<typeof migrateQuoteApprovals>>;
  guards: Awaited<ReturnType<typeof enableGuards>>;
  verification: Awaited<ReturnType<typeof verifyMigration>>;
}> {
  const inventory = await inventoryWorkspace(workspaceId);
  const migration = await migrateQuoteApprovals(workspaceId, actorId);
  const guards = await enableGuards(workspaceId);
  const verification = await verifyMigration(workspaceId);

  return { inventory, migration, guards, verification };
}
