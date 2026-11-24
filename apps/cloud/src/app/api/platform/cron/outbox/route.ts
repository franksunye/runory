import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateRequestId, successResponse } from "@/lib/http";
import { isSelfHostCandidate } from "@/lib/self-host-catalog";
import { runSelfHostOutboxTick } from "@/lib/self-host-outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 40;

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  const headers = { "Cache-Control": "no-store", "x-request-id": requestId };
  if (!isSelfHostCandidate() || process.env.NODE_ENV !== "production" ||
      process.env.PLATFORM_DEPLOYMENT_MODE !== "local" || process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Independent worker unavailable" } },
      { status: 404, headers });
  }
  const expected = Buffer.from(process.env.PLATFORM_CRON_SECRET ?? "");
  const actual = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  if (expected.length < 32 || actual.length !== expected.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid scheduler credential" } },
      { status: 401, headers });
  }
  try {
    return successResponse(await runSelfHostOutboxTick(), 200, requestId, "no-store");
  } catch {
    console.error("[self-host-outbox] tick failed", { requestId });
    return NextResponse.json({ success: false, error: { code: "OUTBOX_TICK_FAILED", message: "Outbox processing failed; retry after diagnosis" } },
      { status: 503, headers });
  }
}
