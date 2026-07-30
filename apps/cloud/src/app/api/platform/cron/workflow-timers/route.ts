import { NextRequest } from "next/server";
import { runWorkflowTimerCron } from "@runory/platform-core";
import { successResponse, handleError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/platform/cron/workflow-timers
 *
 * Internal cron entry point for the workflow timer coordinator.
 *
 * Processes overdue SLA timers and SLA warnings using a distributed
 * lease mechanism to ensure only one instance runs at a time.
 *
 * Authentication (one of):
 *   - `x-cron-secret` header matching PLATFORM_CRON_SECRET env var.
 *   - Vercel Cron's `Authorization: Bearer <CRON_SECRET>` header.
 *   - In dev bootstrap mode (PLATFORM_DEV_BOOTSTRAP=true), the secret check
 *     is relaxed for local development convenience.
 *
 * This endpoint is NOT accessible by regular users. It should be invoked
 * by an external scheduler (e.g., Vercel Cron, systemd timer, or k8s
 * CronJob) once per minute.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Server-side key authentication ──
    const isDevBootstrap = process.env.PLATFORM_DEV_BOOTSTRAP === "true";
    const platformCronSecret = process.env.PLATFORM_CRON_SECRET;
    const vercelCronSecret = process.env.CRON_SECRET;

    const isAuthorized =
      // Custom platform cron secret via x-cron-secret header
      (platformCronSecret && request.headers.get("x-cron-secret") === platformCronSecret) ||
      // Vercel Cron built-in: Authorization: Bearer <CRON_SECRET>
      (vercelCronSecret && request.headers.get("authorization") === `Bearer ${vercelCronSecret}`) ||
      // Dev bootstrap: allow without secret for local development
      (!platformCronSecret && !vercelCronSecret && isDevBootstrap);

    if (!isAuthorized) {
      if (platformCronSecret || vercelCronSecret) {
        return Response.json(
          { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing cron secret" } },
          { status: 401 },
        );
      }
      // No secret configured and not in dev bootstrap — refuse to run.
      return Response.json(
        { ok: false, error: { code: "MISCONFIGURED", message: "PLATFORM_CRON_SECRET or CRON_SECRET must be set" } },
        { status: 500 },
      );
    }

    // ── Run the cron coordinator ──
    const result = await runWorkflowTimerCron();

    return successResponse(result);
  } catch (e) {
    return handleError(e);
  }
}
