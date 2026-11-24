import { getOrCreateRequestId, successResponse } from "@/lib/http";
import { NextResponse } from "next/server";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { assertBundledPack, BUNDLED_FSM_PACKS, isSelfHostCandidate } from "@/lib/self-host-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  const candidate = isSelfHostCandidate();
  if (candidate) {
    try {
      const marker = JSON.parse(await readFile("/data/release.json", "utf8"));
      if (marker.format !== "runory.self-host.volume/v1" || marker.sourceCommit !== process.env.RUNORY_RELEASE_COMMIT)
        throw new Error("release marker mismatch");
      await access("/data/uploads", constants.R_OK | constants.W_OK | constants.X_OK);
      // The existing DB helper verifies immutable migrations on first use.
      // Validate actual catalog rows and locked module manifests, not liveness alone.
      for (const pack of BUNDLED_FSM_PACKS) await assertBundledPack(pack);
    } catch {
      return NextResponse.json({ success: false, error: { code: "SELF_HOST_NOT_READY", message: "Independent runtime readiness check failed" } },
        { status: 503, headers: { "Cache-Control": "no-store", "x-request-id": requestId } });
    }
  }
  return successResponse({
    ok: true,
    service: "runory-cloud",
    ...(candidate ? { readiness: { database: "ready", catalog: "verified", attachmentDirectory: "writable", scope: "independent_candidate" } } : {}),
    // Public build identity lets a release check verify the served commit,
    // rather than treating an unrelated older deployment's HTTP 200 as proof.
    release: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? (/^[a-f0-9]{40}$/.test(process.env.RUNORY_RELEASE_COMMIT ?? "") ? process.env.RUNORY_RELEASE_COMMIT : null),
      environment: process.env.VERCEL_ENV ?? "local",
    },
  }, 200, requestId, "no-store");
}
