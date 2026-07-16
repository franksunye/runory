import { NextRequest, NextResponse } from "next/server";
import { lookupCaller } from "@runory/platform-core";
import { authenticateRetell, retellError } from "@/integrations/retell/gateway";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  try {
    const auth = await authenticateRetell(request, raw);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const inbound = body.call_inbound && typeof body.call_inbound === "object"
      ? body.call_inbound as Record<string, unknown>
      : body;
    const callerPhone = String(inbound.callerPhone ?? inbound.from_number ?? "");
    if (!callerPhone) throw new Error("VOICE_CALL_FIELDS_REQUIRED");
    const caller = await lookupCaller(auth.workspaceId, callerPhone);
    return NextResponse.json({
      call_inbound: {
        override_agent_id: process.env.RETELL_AGENT_ID,
        dynamic_variables: {
        caller_phone: callerPhone,
        caller_known: String(caller.matched),
        caller_name: caller.contact?.name ?? "",
        candidate_sites: JSON.stringify(caller.sites),
        open_work_count: String(caller.openWorkCount),
        },
        metadata: { runory_workspace_id: auth.workspaceId },
      },
    });
  } catch (error) {
    return retellError(error);
  }
}
