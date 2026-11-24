import { getOrCreateRequestId, successResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return successResponse({
    ok: true,
    service: "runory-cloud",
    // Public build identity lets a release check verify the served commit,
    // rather than treating an unrelated older deployment's HTTP 200 as proof.
    release: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? (/^[a-f0-9]{40}$/.test(process.env.RUNORY_RELEASE_COMMIT ?? "") ? process.env.RUNORY_RELEASE_COMMIT : null),
      environment: process.env.VERCEL_ENV ?? "local",
    },
  }, 200, getOrCreateRequestId(request.headers.get("x-request-id")), "no-store");
}
