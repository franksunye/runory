import { NextRequest } from "next/server";
import { DASHBOARD_ZONES } from "@runory/contracts";
import {
  resolveEffectiveLayout,
  getAvailableWidgets,
  upsertLayoutOverride,
  batchUpdateLayoutOverrides,
  resetLayoutOverrides,
  writeAuditEvent,
  type UpdateLayoutOverrideInput,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId, METADATA_CACHE } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[id]/dashboard/layout
// Returns the effective layout + available widgets for personalization UI.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const [layout, available] = await Promise.all([
      resolveEffectiveLayout(workspaceId),
      getAvailableWidgets(workspaceId),
    ]);

    return successResponse(
      {
        layout,
        availableWidgets: available.map((aw) => ({
          moduleId: aw.moduleId,
          widgetKey: aw.widget.key,
          label: aw.widget.label,
          type: aw.widget.type,
          icon: aw.widget.icon,
        })),
        zones: DASHBOARD_ZONES,
      },
      200,
      ctx.requestId,
      METADATA_CACHE
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}

// PATCH /api/workspaces/[id]/dashboard/layout
// Upsert one or more layout overrides (reorder, hide, show, configure, add).
// Body: { updates: UpdateLayoutOverrideInput[] }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");

    const body = await request.json();
    const updates: UpdateLayoutOverrideInput[] = body.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
      return handleError(new Error("Body must contain 'updates' array"), requestId);
    }

    // Validate zones
    for (const u of updates) {
      if (!DASHBOARD_ZONES.includes(u.zone)) {
        return handleError(
          new Error(`Invalid zone: ${u.zone}. Must be one of ${DASHBOARD_ZONES.join(", ")}`),
          requestId
        );
      }
    }

    await batchUpdateLayoutOverrides(workspaceId, updates, ctx.principal?.userId ?? "unknown");

    // Audit: dashboard layout personalization (business language)
    const actorId = ctx.principal?.userId ?? "unknown";
    for (const u of updates) {
      let action: "dashboard.widget.hide" | "dashboard.widget.show" | "dashboard.widget.reorder" | "dashboard.widget.configure" | "dashboard.widget.add";
      let label: string;
      if (u.hidden === true) {
        action = "dashboard.widget.hide";
        label = `Hid dashboard widget ${u.widgetKey}`;
      } else if (u.hidden === false) {
        // Check if this is an "add" (new widget) or "show" (unhide)
        action = "dashboard.widget.show";
        label = `Showed dashboard widget ${u.widgetKey}`;
      } else if (u.position !== undefined) {
        action = "dashboard.widget.reorder";
        label = `Reordered dashboard widget ${u.widgetKey}`;
      } else {
        action = "dashboard.widget.configure";
        label = `Configured dashboard widget ${u.widgetKey}`;
      }
      writeAuditEvent({
        workspaceId,
        actorType: "user",
        actorId,
        action,
        entityType: "dashboard_widget",
        entityId: `${u.widgetModule}:${u.widgetKey}`,
        after: { zone: u.zone, label, widgetInstance: u.widgetInstance ?? "default" },
        requestId: ctx.requestId,
      }).catch((err) => {
        console.error("[audit] Failed to write dashboard layout audit event:", err);
      });
    }

    // Return the updated effective layout
    const layout = await resolveEffectiveLayout(workspaceId);
    return successResponse({ layout }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// DELETE /api/workspaces/[id]/dashboard/layout
// Reset all layout overrides (return to pack default).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");

    await resetLayoutOverrides(workspaceId);

    // Audit: dashboard layout reset (business language)
    writeAuditEvent({
      workspaceId,
      actorType: "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "dashboard.layout.reset",
      entityType: "dashboard_layout",
      entityId: workspaceId,
      after: { label: "Reset dashboard layout to default configuration" },
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write dashboard layout reset audit event:", err);
    });

    // Return the reset layout
    const layout = await resolveEffectiveLayout(workspaceId);
    return successResponse({ layout, reset: true }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
