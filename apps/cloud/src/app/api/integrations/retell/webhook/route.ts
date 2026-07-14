import { NextRequest } from "next/server";
import { ingestVoiceEvent, type VoiceCallStatus } from "@runory/platform-core";
import { authenticateRetell, retellError, retellJson } from "@/integrations/retell/gateway";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, VoiceCallStatus> = {
  call_started: "ringing",
  call_answered: "answered",
  call_ended: "ended",
  call_analyzed: "analyzed",
  call_failed: "failed",
};

export async function POST(request: NextRequest) {
  const raw = await request.text();
  try {
    const auth = await authenticateRetell(request, raw);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const eventType = String(body.event ?? body.event_type ?? "");
    const eventId = String(body.event_id ?? body.id ?? "");
    const call = (body.call ?? body.data ?? body) as Record<string, unknown>;
    const providerCallId = String(call.call_id ?? call.providerCallId ?? "");
    if (!eventId || !providerCallId || !STATUS_MAP[eventType]) throw new Error("VOICE_EVENT_FIELDS_REQUIRED");
    const result = await ingestVoiceEvent(auth.workspaceId, {
      eventId,
      providerCallId,
      eventType,
      status: STATUS_MAP[eventType],
      sequence: Number(body.sequence ?? body.timestamp_ms ?? 0),
      startedAt: call.start_timestamp ? new Date(Number(call.start_timestamp)).toISOString() : undefined,
      answeredAt: call.answer_timestamp ? new Date(Number(call.answer_timestamp)).toISOString() : undefined,
      endedAt: call.end_timestamp ? new Date(Number(call.end_timestamp)).toISOString() : undefined,
      durationSeconds: call.duration_ms ? Math.round(Number(call.duration_ms) / 1000) : undefined,
      transcript: call.transcript ? String(call.transcript) : undefined,
      summary: call.call_analysis && typeof call.call_analysis === "object" ? String((call.call_analysis as Record<string, unknown>).call_summary ?? "") : undefined,
      recordingReference: call.recording_url ? String(call.recording_url) : undefined,
      payload: body,
    });
    return retellJson(result);
  } catch (error) {
    return retellError(error);
  }
}
