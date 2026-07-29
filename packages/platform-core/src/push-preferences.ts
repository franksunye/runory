/**
 * v0.9.2 PWA Notification — Push preferences repository.
 *
 * Spec: v0.9 PWA Notification Technical Spec §6 (Preferences and consent)
 *
 * Only categories applicable to the current principal are shown.
 * Defaults may be enabled in product policy, but browser permission and
 * subscription creation are always explicit opt-in.
 */

import { TABLES } from "./contracts";
import { queryOne, execute, genId, now } from "./db";
import type { PushPrincipalType } from "./push-subscriptions";

export interface PushPreferencesRecord {
  id: string;
  workspaceId: string;
  principalType: PushPrincipalType;
  principalId: string;
  globalEnabled: boolean;
  workAssignmentEnabled: boolean;
  scheduleChangeEnabled: boolean;
  workReturnedEnabled: boolean;
  approvalReadyEnabled: boolean;
  customerDocumentEnabled: boolean;
  paymentStatusEnabled: boolean;
  serviceStatusEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PushPreferencesUpdate {
  globalEnabled?: boolean;
  workAssignmentEnabled?: boolean;
  scheduleChangeEnabled?: boolean;
  workReturnedEnabled?: boolean;
  approvalReadyEnabled?: boolean;
  customerDocumentEnabled?: boolean;
  paymentStatusEnabled?: boolean;
  serviceStatusEnabled?: boolean;
}

function mapRow(row: Record<string, unknown>): PushPreferencesRecord {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    principalType: row.principal_type as PushPrincipalType,
    principalId: row.principal_id as string,
    globalEnabled: Boolean(row.global_enabled),
    workAssignmentEnabled: Boolean(row.work_assignment_enabled),
    scheduleChangeEnabled: Boolean(row.schedule_change_enabled),
    workReturnedEnabled: Boolean(row.work_returned_enabled),
    approvalReadyEnabled: Boolean(row.approval_ready_enabled),
    customerDocumentEnabled: Boolean(row.customer_document_enabled),
    paymentStatusEnabled: Boolean(row.payment_status_enabled),
    serviceStatusEnabled: Boolean(row.service_status_enabled),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const ALL_COLUMNS = `id, workspace_id, principal_type, principal_id,
  global_enabled, work_assignment_enabled, schedule_change_enabled,
  work_returned_enabled, approval_ready_enabled, customer_document_enabled,
  payment_status_enabled, service_status_enabled, created_at, updated_at`;

export async function getPushPreferences(
  workspaceId: string,
  principalType: PushPrincipalType,
  principalId: string,
): Promise<PushPreferencesRecord> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${ALL_COLUMNS} FROM ${TABLES.pushPreferences}
     WHERE workspace_id = ? AND principal_type = ? AND principal_id = ?`,
    [workspaceId, principalType, principalId],
  );

  if (row) return mapRow(row);

  // Create default preferences on first access
  const id = genId("push_pref");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.pushPreferences}
       (id, workspace_id, principal_type, principal_id,
        global_enabled, work_assignment_enabled, schedule_change_enabled,
        work_returned_enabled, approval_ready_enabled, customer_document_enabled,
        payment_status_enabled, service_status_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 1, ?, ?)`,
    [id, workspaceId, principalType, principalId, ts, ts],
  );

  const created = await queryOne<Record<string, unknown>>(
    `SELECT ${ALL_COLUMNS} FROM ${TABLES.pushPreferences} WHERE id = ?`,
    [id],
  );
  if (!created) throw new Error("PUSH_PREFERENCES_CREATE_FAILED");
  return mapRow(created);
}

export async function updatePushPreferences(
  workspaceId: string,
  principalType: PushPrincipalType,
  principalId: string,
  update: PushPreferencesUpdate,
): Promise<PushPreferencesRecord> {
  // Ensure record exists
  await getPushPreferences(workspaceId, principalType, principalId);

  const fields: string[] = [];
  const args: unknown[] = [];

  if (update.globalEnabled !== undefined) {
    fields.push("global_enabled = ?");
    args.push(update.globalEnabled ? 1 : 0);
  }
  if (update.workAssignmentEnabled !== undefined) {
    fields.push("work_assignment_enabled = ?");
    args.push(update.workAssignmentEnabled ? 1 : 0);
  }
  if (update.scheduleChangeEnabled !== undefined) {
    fields.push("schedule_change_enabled = ?");
    args.push(update.scheduleChangeEnabled ? 1 : 0);
  }
  if (update.workReturnedEnabled !== undefined) {
    fields.push("work_returned_enabled = ?");
    args.push(update.workReturnedEnabled ? 1 : 0);
  }
  if (update.approvalReadyEnabled !== undefined) {
    fields.push("approval_ready_enabled = ?");
    args.push(update.approvalReadyEnabled ? 1 : 0);
  }
  if (update.customerDocumentEnabled !== undefined) {
    fields.push("customer_document_enabled = ?");
    args.push(update.customerDocumentEnabled ? 1 : 0);
  }
  if (update.paymentStatusEnabled !== undefined) {
    fields.push("payment_status_enabled = ?");
    args.push(update.paymentStatusEnabled ? 1 : 0);
  }
  if (update.serviceStatusEnabled !== undefined) {
    fields.push("service_status_enabled = ?");
    args.push(update.serviceStatusEnabled ? 1 : 0);
  }

  if (fields.length > 0) {
    fields.push("updated_at = ?");
    args.push(now());
    args.push(workspaceId, principalType, principalId);

    await execute(
      `UPDATE ${TABLES.pushPreferences}
       SET ${fields.join(", ")}
       WHERE workspace_id = ? AND principal_type = ? AND principal_id = ?`,
      args,
    );
  }

  return getPushPreferences(workspaceId, principalType, principalId);
}

export function isCategoryEnabled(
  prefs: PushPreferencesRecord,
  category: PushCategory,
): boolean {
  if (!prefs.globalEnabled) return false;
  switch (category) {
    case "work_assignment": return prefs.workAssignmentEnabled;
    case "schedule_change": return prefs.scheduleChangeEnabled;
    case "work_returned": return prefs.workReturnedEnabled;
    case "approval_ready": return prefs.approvalReadyEnabled;
    case "customer_document": return prefs.customerDocumentEnabled;
    case "payment_status": return prefs.paymentStatusEnabled;
    case "service_status": return prefs.serviceStatusEnabled;
    default: return false;
  }
}

export type PushCategory =
  | "work_assignment"
  | "schedule_change"
  | "work_returned"
  | "approval_ready"
  | "customer_document"
  | "payment_status"
  | "service_status";
