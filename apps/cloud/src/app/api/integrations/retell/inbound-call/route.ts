import { NextRequest } from "next/server";
import { lookupCaller, upsertVoiceCall } from "@runory/platform-core";
import { authenticateRetell, retellError, retellJson } from "@/integrations/retell/gateway";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  try {
    const auth = await authenticateRetell(request, raw);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const providerCallId = String(body.providerCallId ?? body.call_id ?? "");
    const callerPhone = String(body.callerPhone ?? body.from_number ?? "");
    const calleePhone = body.calleePhone ?? body.to_number;
    if (!providerCallId || !callerPhone) throw new Error("VOICE_CALL_FIELDS_REQUIRED");
    const call = await upsertVoiceCall(auth.workspaceId, {
      providerCallId,
      callerPhone,
      calleePhone: calleePhone ? String(calleePhone) : undefined,
      providerPhoneId: body.phone_number_id ? String(body.phone_number_id) : undefined,
    });
    const caller = await lookupCaller(auth.workspaceId, callerPhone);
    return retellJson({
      workspaceId: auth.workspaceId,
      voiceCallId: call.id,
      dynamicVariables: {
        caller_known: caller.matched,
        caller_name: caller.contact?.name ?? "",
        candidate_sites: caller.sites,
        open_work_count: caller.openWorkCount,
      },
    });
  } catch (error) {
    return retellError(error);
  }
}
