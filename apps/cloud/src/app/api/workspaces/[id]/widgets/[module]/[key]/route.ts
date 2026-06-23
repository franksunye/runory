import { NextRequest } from "next/server";
import type { WidgetDeclaration } from "@runory/contracts";
import {
  findWidgetDeclaration,
  resolveWidgetData,
  resolveActivityFeed,
  mergeWidgetConfig,
  getWorkspaceLayoutOverrides,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[id]/widgets/[module]/[key]
// Returns widget data for a single widget instance.
// Query params:
//   - instance: widget instance key (defaults to "default")
//   - zone: zone the widget is in (for resolving config override)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; module: string; key: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, module: moduleId, key: widgetKey } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const url = new URL(request.url);
    const instance = url.searchParams.get("instance") ?? "default";
    const zone = url.searchParams.get("zone") ?? undefined;

    // Find widget declaration
    const widget = await findWidgetDeclaration(workspaceId, moduleId, widgetKey);
    if (!widget) {
      return handleError(
        new Error(`Widget not found: ${moduleId}/${widgetKey}`),
        requestId
      );
    }

    // Resolve config override from workspace layout
    let effectiveWidget: WidgetDeclaration = widget;
    if (zone) {
      const overrides = await getWorkspaceLayoutOverrides(workspaceId);
      const override = overrides.find(
        (o) =>
          o.zone === zone &&
          o.widgetModule === moduleId &&
          o.widgetKey === widgetKey &&
          o.widgetInstance === instance
      );
      effectiveWidget = mergeWidgetConfig(widget, override?.configOverride ?? null);
    }

    // Resolve data based on widget type
    if (effectiveWidget.type === "activity_feed") {
      // Activity feed is platform-owned, resolved from audit log
      const limit = 10;
      const activity = await resolveActivityFeed(workspaceId, limit);
      return successResponse(
        {
          widget: effectiveWidget,
          data: { kind: "activity_feed", events: activity },
        },
        200,
        ctx.requestId
      );
    }

    // Standard widget data resolution
    const data = await resolveWidgetData(workspaceId, effectiveWidget.data);

    // For metric_card with sub intent, resolve sub data too
    let subData: { count: number; label: string } | null = null;
    if (effectiveWidget.type === "metric_card" && effectiveWidget.sub) {
      const subResult = await resolveWidgetData(workspaceId, effectiveWidget.sub);
      const subCount = subResult.count ?? 0;
      const template = effectiveWidget.sub.template ?? "{count}";
      subData = {
        count: subCount,
        label: template.replace("{count}", String(subCount)),
      };
    }

    return successResponse(
      {
        widget: effectiveWidget,
        data,
        sub: subData,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
