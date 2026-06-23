import { NextRequest } from "next/server";
import {
  queryOne,
  queryAll,
  TABLES,
  businessTable,
  getInstallations,
  getExtensions,
  getAuditLogs,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[id]/stats — returns workspace business metrics
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Safely count rows from a table that may not exist yet (no pack installed)
    const safeCount = async (sql: string, args: unknown[] = []): Promise<number> => {
      try {
        const row = await queryOne<{ count: number }>(sql, args);
        return row?.count ?? 0;
      } catch {
        return 0;
      }
    };

    // Safely query rows from a table that may not exist yet
    const safeQueryAll = async <T>(sql: string, args: unknown[] = []): Promise<T[]> => {
      try {
        return await queryAll<T>(sql, args);
      } catch {
        return [];
      }
    };

    const customerTable = businessTable("customer");
    const contactTable = businessTable("contact");
    const taskTable = businessTable("task");

    const [installations, extensions] = await Promise.all([
      getInstallations(workspaceId),
      getExtensions(workspaceId),
    ]);

    const [
      customersTotal,
      customersRecent,
      contactsTotal,
      contactsRecent,
      tasksTotal,
      tasksRecent,
      auditTotal,
      auditRecent,
      recentCustomers,
      recentContacts,
    ] = await Promise.all([
      safeCount(`SELECT COUNT(*) as count FROM ${customerTable} WHERE workspace_id = ?`, [workspaceId]),
      safeCount(`SELECT COUNT(*) as count FROM ${customerTable} WHERE workspace_id = ? AND created_at >= ?`, [workspaceId, sevenDaysAgo]),
      safeCount(`SELECT COUNT(*) as count FROM ${contactTable} WHERE workspace_id = ?`, [workspaceId]),
      safeCount(`SELECT COUNT(*) as count FROM ${contactTable} WHERE workspace_id = ? AND created_at >= ?`, [workspaceId, sevenDaysAgo]),
      safeCount(`SELECT COUNT(*) as count FROM ${taskTable} WHERE workspace_id = ?`, [workspaceId]),
      safeCount(`SELECT COUNT(*) as count FROM ${taskTable} WHERE workspace_id = ? AND created_at >= ?`, [workspaceId, sevenDaysAgo]),
      safeCount(`SELECT COUNT(*) as count FROM ${TABLES.auditLogs} WHERE workspace_id = ?`, [workspaceId]),
      safeCount(`SELECT COUNT(*) as count FROM ${TABLES.auditLogs} WHERE workspace_id = ? AND created_at >= ?`, [workspaceId, sevenDaysAgo]),
      safeQueryAll<{ id: string; name: string; email: string | null; created_at: string }>(
        `SELECT id, name, email, created_at FROM ${customerTable} WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 5`,
        [workspaceId]
      ),
      safeQueryAll<{ id: string; name: string; email: string | null; created_at: string }>(
        `SELECT id, name, email, created_at FROM ${contactTable} WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 5`,
        [workspaceId]
      ),
    ]);

    // Recent audit events for the activity timeline (last 10)
    const auditLogs = await getAuditLogs(workspaceId);
    const recentAuditEvents = auditLogs.slice(0, 10);

    const activeExtensions = extensions.filter((e) => e.status === "active").length;

    return successResponse(
      {
        customers: { total: customersTotal, recent: customersRecent },
        contacts: { total: contactsTotal, recent: contactsRecent },
        tasks: { total: tasksTotal, recent: tasksRecent },
        extensions: { total: extensions.length, active: activeExtensions },
        modules: { total: installations.length },
        auditEvents: { total: auditTotal, recent: auditRecent },
        records: { total: customersTotal + contactsTotal + tasksTotal },
        recentAuditEvents,
        recentCustomers,
        recentContacts,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
