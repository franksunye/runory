import { NextRequest, NextResponse } from "next/server";
import {
  queryOne,
  queryAll,
  TABLES,
  businessTable,
  getInstallations,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[id]/stats — returns business workbench data
// @deprecated since v0.2.1 — use /api/workspaces/[id]/widgets/[module]/[key] instead.
// This endpoint is preserved for backward compatibility and will be removed in v0.2.2.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

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

    // Check if pack is installed
    const installations = await getInstallations(workspaceId);
    const hasPack = installations.length > 0;

    if (!hasPack) {
      const response = successResponse(
        {
          hasPack: false,
          metrics: null,
          trends: null,
          taskStatusBreakdown: null,
          openTasks: [],
          recentCustomers: [],
          recentActivity: [],
        },
        200,
        ctx.requestId
      );
      response.headers.set("Deprecation", "true");
      response.headers.set("Sunset", "v0.2.2");
      response.headers.set("Link", '</api/workspaces/[id]/widgets/[module]/[key]>; rel="successor-version"');
      return response;
    }

    // ── Business Metrics ──
    const [
      customersTotal,
      customersNewThisWeek,
      contactsTotal,
      contactsNewThisWeek,
      tasksTotal,
      tasksTodo,
      tasksInProgress,
      tasksDone,
      tasksDueToday,
      tasksOverdue,
    ] = await Promise.all([
      safeCount(`SELECT COUNT(*) as count FROM ${customerTable} WHERE workspace_id = ?`, [workspaceId]),
      safeCount(`SELECT COUNT(*) as count FROM ${customerTable} WHERE workspace_id = ? AND created_at >= ?`, [workspaceId, sevenDaysAgo]),
      safeCount(`SELECT COUNT(*) as count FROM ${contactTable} WHERE workspace_id = ?`, [workspaceId]),
      safeCount(`SELECT COUNT(*) as count FROM ${contactTable} WHERE workspace_id = ? AND created_at >= ?`, [workspaceId, sevenDaysAgo]),
      safeCount(`SELECT COUNT(*) as count FROM ${taskTable} WHERE workspace_id = ?`, [workspaceId]),
      safeCount(`SELECT COUNT(*) as count FROM ${taskTable} WHERE workspace_id = ? AND status = ?`, [workspaceId, "todo"]),
      safeCount(`SELECT COUNT(*) as count FROM ${taskTable} WHERE workspace_id = ? AND status = ?`, [workspaceId, "in_progress"]),
      safeCount(`SELECT COUNT(*) as count FROM ${taskTable} WHERE workspace_id = ? AND status = ?`, [workspaceId, "done"]),
      safeCount(`SELECT COUNT(*) as count FROM ${taskTable} WHERE workspace_id = ? AND status IN (?, ?) AND due_date >= ? AND due_date < ?`, [workspaceId, "todo", "in_progress", todayStart, todayEnd]),
      safeCount(`SELECT COUNT(*) as count FROM ${taskTable} WHERE workspace_id = ? AND status IN (?, ?) AND due_date < ?`, [workspaceId, "todo", "in_progress", todayStart]),
    ]);

    // ── 14-day Trend Data (new records per day) ──
    const fourteenDaysAgo = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000);
    const trendStartDate = new Date(fourteenDaysAgo.getFullYear(), fourteenDaysAgo.getMonth(), fourteenDaysAgo.getDate()).toISOString();

    const [customerTrend, contactTrend, taskTrend] = await Promise.all([
      safeQueryAll<{ date: string; count: number }>(
        `SELECT DATE(created_at) as date, COUNT(*) as count FROM ${customerTable} WHERE workspace_id = ? AND created_at >= ? GROUP BY DATE(created_at) ORDER BY date`,
        [workspaceId, trendStartDate]
      ),
      safeQueryAll<{ date: string; count: number }>(
        `SELECT DATE(created_at) as date, COUNT(*) as count FROM ${contactTable} WHERE workspace_id = ? AND created_at >= ? GROUP BY DATE(created_at) ORDER BY date`,
        [workspaceId, trendStartDate]
      ),
      safeQueryAll<{ date: string; count: number }>(
        `SELECT DATE(created_at) as date, COUNT(*) as count FROM ${taskTable} WHERE workspace_id = ? AND created_at >= ? GROUP BY DATE(created_at) ORDER BY date`,
        [workspaceId, trendStartDate]
      ),
    ]);

    // Build complete 14-day trend array (fill missing days with 0)
    const trendData: Array<{ date: string; customers: number; contacts: number; tasks: number }> = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(fourteenDaysAgo.getFullYear(), fourteenDaysAgo.getMonth(), fourteenDaysAgo.getDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      const customerDay = customerTrend.find((t) => t.date === dateStr);
      const contactDay = contactTrend.find((t) => t.date === dateStr);
      const taskDay = taskTrend.find((t) => t.date === dateStr);
      trendData.push({
        date: dateStr,
        customers: customerDay?.count ?? 0,
        contacts: contactDay?.count ?? 0,
        tasks: taskDay?.count ?? 0,
      });
    }

    // ── Open Tasks (needs attention) ──
    const openTasks = await safeQueryAll<{
      id: string; title: string; status: string; priority: string; due_date: string | null; assignee: string | null;
    }>(
      `SELECT id, title, status, priority, due_date, assignee FROM ${taskTable} WHERE workspace_id = ? AND status IN (?, ?) ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, due_date ASC LIMIT 8`,
      [workspaceId, "todo", "in_progress"]
    );

    // ── Recent Customers ──
    const recentCustomers = await safeQueryAll<{
      id: string; name: string; email: string | null; phone: string | null; created_at: string;
    }>(
      `SELECT id, name, email, phone, created_at FROM ${customerTable} WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 5`,
      [workspaceId]
    );

    // ── Business Activity Feed (recent audit events translated to business language) ──
    const auditLogs = await safeQueryAll<{
      id: string; action: string; entity_type: string; entity_id: string; created_at: string; actor_type: string; actor_id: string; after_json: string | null;
    }>(
      `SELECT id, action, entity_type, entity_id, created_at, actor_type, actor_id, after_json FROM ${TABLES.auditLogs} WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 8`,
      [workspaceId]
    );

    const response = successResponse(
      {
        hasPack: true,
        metrics: {
          customers: { total: customersTotal, newThisWeek: customersNewThisWeek },
          contacts: { total: contactsTotal, newThisWeek: contactsNewThisWeek },
          tasks: {
            total: tasksTotal,
            todo: tasksTodo,
            inProgress: tasksInProgress,
            done: tasksDone,
            dueToday: tasksDueToday,
            overdue: tasksOverdue,
          },
        },
        trends: trendData,
        taskStatusBreakdown: { todo: tasksTodo, inProgress: tasksInProgress, done: tasksDone },
        openTasks,
        recentCustomers,
        recentActivity: auditLogs,
      },
      200,
      ctx.requestId
    );
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", "v0.2.2");
    response.headers.set("Link", '</api/workspaces/[id]/widgets/[module]/[key]>; rel="successor-version"');
    return response;
  } catch (e) {
    return handleError(e, requestId);
  }
}
