import { NextRequest } from "next/server";
import { runWorkflowTimerCron } from "@runory/platform-core";
import { successResponse, handleError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Shared cron handler — invoked by both GET (Vercel Cron) and POST (operator).
 *
 * Vercel Cron sends HTTP GET to the configured path. Operators and local
 * development may use POST with the same authentication. Both methods
 * delegate to this single implementation.
 */
async function handleCronRequest(request: NextRequest) {
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

/**
 * GET /api/platform/cron/workflow-timers
 *
 * Vercel Cron sends GET requests to the configured path. This handler
 * ensures the endpoint is invocable by Vercel's managed Cron scheduler.
 */
export async function GET(request: NextRequest) {
  return handleCronRequest(request);
}

/**
 * POST /api/platform/cron/workflow-timers
 *
 * Operator / local development entry point. Uses the same authentication
 * and processing logic as GET.
 */
export async function POST(request: NextRequest) {
  return handleCronRequest(request);
}
