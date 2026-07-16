import { NextRequest } from "next/server";
import { getRecord } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, notFound } from "@/lib/http";

export const dynamic = "force-dynamic";

function isTrustedRecordingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname.endsWith(".cloudfront.net") || url.hostname.endsWith(".amazonaws.com"));
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; callId: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, callId } = await params;
    const { workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const call = await getRecord(workspaceId, "voice_call", callId);
    if (!call) return notFound(`Voice call ${callId} not found`, requestId);
    const recordingUrl = typeof call.recording_reference === "string" ? call.recording_reference : "";
    if (!recordingUrl) return notFound("Recording not available", requestId);
    if (!isTrustedRecordingUrl(recordingUrl)) return new Response("Unsupported recording source", { status: 422 });

    const range = request.headers.get("range");
    const upstream = await fetch(recordingUrl, {
      headers: range ? { range } : undefined,
      cache: "no-store",
    });
    if (!upstream.ok) return new Response("Recording unavailable", { status: upstream.status });

    const headers = new Headers({
      "Content-Type": "audio/wav",
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
    });
    for (const header of ["content-length", "content-range"]) {
      const value = upstream.headers.get(header);
      if (value) headers.set(header, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return handleError(error, requestId);
  }
}
