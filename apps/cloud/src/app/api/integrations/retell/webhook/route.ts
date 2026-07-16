import { NextRequest } from "next/server";
import { ingestVoiceEvent, upsertVoiceCall, type VoiceCallStatus } from "@runory/platform-core";
import { authenticateRetell, retellError, retellJson } from "@/integrations/retell/gateway";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, VoiceCallStatus> = {
  call_started: "ringing",
  call_ended: "ended",
  call_analyzed: "analyzed",
};

export async function POST(request: NextRequest) {
  const raw = await request.text();
  try {
    const auth = await authenticateRetell(request, raw);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const eventType = String(body.event ?? body.event_type ?? "");
    const call = (body.call ?? body.data ?? body) as Record<string, unknown>;
    const providerCallId = String(call.call_id ?? call.providerCallId ?? "");
    const status = STATUS_MAP[eventType];
    if (!providerCallId || !status) throw new Error("VOICE_EVENT_FIELDS_REQUIRED");
    const eventId = String(body.event_id ?? body.id ?? `${providerCallId}:${eventType}`);
    const dynamicVariables = call.retell_llm_dynamic_variables && typeof call.retell_llm_dynamic_variables === "object"
      ? call.retell_llm_dynamic_variables as Record<string, unknown>
      : {};
    const callerPhone = String(call.from_number ?? call.callerPhone ?? dynamicVariables.caller_phone ?? "");
    if (callerPhone) {
      await upsertVoiceCall(auth.workspaceId, {
        providerCallId,
        callerPhone,
        calleePhone: call.to_number ? String(call.to_number) : undefined,
      });
    }
    const result = await ingestVoiceEvent(auth.workspaceId, {
      eventId,
      providerCallId,
      eventType,
      status,
      sequence: Number(body.sequence ?? body.timestamp_ms ?? body.event_timestamp ?? call.start_timestamp ?? 0),
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
