import { NextRequest } from "next/server";
import { createRecord, getRecords, writeAuditEvent } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";
import { getDemoCustomers, getDemoContacts, getDemoTasks } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");

    // Idempotent check: only seed if no customer records exist yet
    const existingCustomers = await getRecords(workspaceId, "customer");
    if (existingCustomers.length > 0) {
      return invalidInput(
        "工作区已有客户记录，无法重复加载示例数据",
        ctx.requestId
      );
    }

    let seeded = 0;

    // 1. Create customers, build email → id map for linking
    const customerEmailToId = new Map<string, string>();
    for (const customer of getDemoCustomers()) {
      const record = await createRecord(workspaceId, "customer", {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      });
      customerEmailToId.set(customer.email, record.id);
      seeded++;
    }

    // 2. Create contacts, resolving customer_id from email
    for (const contact of getDemoContacts()) {
      const customerId = customerEmailToId.get(contact.customerEmail);
      if (!customerId) continue;
      await createRecord(workspaceId, "contact", {
        customer_id: customerId,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        role: contact.role,
      });
      seeded++;
    }

    // 3. Create tasks, resolving customer_id from email (if linked)
    for (const task of getDemoTasks()) {
      const data: Record<string, unknown> = {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        assignee: task.assignee,
      };
      if (task.customerEmail) {
        const customerId = customerEmailToId.get(task.customerEmail);
        if (customerId) data.customer_id = customerId;
      }
      await createRecord(workspaceId, "task", data);
      seeded++;
    }

    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "record.create",
      entityType: "workspace",
      entityId: workspaceId,
      after: { seeded },
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });

    return successResponse({ seeded }, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
