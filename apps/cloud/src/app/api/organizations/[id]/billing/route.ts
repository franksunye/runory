import { NextRequest } from "next/server";
import {
  getBillingCustomer,
  getBillingSubscription,
  getEntitlement,
  getUsageSummary,
} from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";
import { getCurrentPlan, getPlanById, type PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { membership } = await requireOrganizationAccess(request, id);

    const [entitlement, usage, customer, subscription] = await Promise.all([
      getEntitlement(id),
      getUsageSummary(id),
      getBillingCustomer(id),
      getBillingSubscription(id),
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

    const effectivePlan = getPlanById((entitlements.plan ?? "early_access") as PlanId)
      ?? getCurrentPlan();

    return successResponse(
      {
        plan: entitlements.plan,
        status: entitlements.status,
        entitlements,
        usage,
        features: effectivePlan.features,
        subscription,
        hasBillingCustomer: Boolean(customer),
        canManageBilling: membership.role === "owner",
        selfServePlans: [{
          id: "pro",
          name: "Pro",
          price: getPlanById("pro")?.price ?? "$29/month",
        }],
        billingHistory: [],
      },
      200,
      requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
