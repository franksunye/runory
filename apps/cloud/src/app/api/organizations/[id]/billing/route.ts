import { NextRequest } from "next/server";
import { getEntitlement, getUsageSummary } from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";
import { getCurrentPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

// ── Features included in the current early_access plan ──
const PLAN_FEATURES = ["crm_lite", "extensions", "api_access", "audit_log"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    await requireOrganizationAccess(request, id);

    const [entitlement, usage] = await Promise.all([
      getEntitlement(id),
      getUsageSummary(id),
    ]);

    // Gracefully handle the case where entitlements don't exist yet:
    // fall back to the default early_access plan values.
    const plan = getCurrentPlan();
    const entitlements =
      entitlement ?? {
        id: null,
        organizationId: id,
        plan: "early_access",
        status: "active" as const,
        quotas: {
          workspaces: plan.limits.workspaces,
          members: plan.limits.members,
          records: plan.limits.records,
          storage_bytes: plan.limits.storageBytes,
          api_requests: plan.limits.apiRequests,
          agent_operations: plan.limits.agentOperations,
        },
        overrides: {},
        effectiveAt: null,
        expiresAt: null,
        createdAt: null,
        updatedAt: null,
      };

    return successResponse(
      {
        plan: "early_access",
        status: "active",
        entitlements,
        usage,
        features: PLAN_FEATURES,
        billingHistory: [],
      },
      200,
      requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
