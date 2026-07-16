import { NextRequest } from "next/server";
import {
  createAndScheduleVoiceWork,
  createVoiceFollowUp,
  createVoiceWorkOrder,
  getAvailableVoiceSlots,
  lookupCaller,
  previewServiceIntake,
  upsertVoiceCall,
  type ServiceIntakeInput,
} from "@runory/platform-core";
import { authenticateRetell, idempotencyKey, retellError, retellJson } from "./gateway";
import { deliverWorkOrderConfirmation } from "@/integrations/email/resend-outbox";

export type RetellTool = "customer-lookup" | "intake-preview" | "available-slots" | "create-work-order" | "create-and-schedule" | "create-follow-up";

async function dispatchConfirmationEmail(workspaceId: string, result: unknown): Promise<void> {
  const outboxId = (result as { confirmationEmailOutboxId?: unknown }).confirmationEmailOutboxId;
  if (typeof outboxId === "string" && outboxId) {
    await deliverWorkOrderConfirmation(workspaceId, outboxId);
  }
}

export async function handleRetellTool(request: NextRequest, tool: RetellTool) {
  const raw = await request.text();
  try {
    const auth = await authenticateRetell(request, raw, { allowToolSecret: true });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const input = (body.args ?? body.arguments ?? body.input ?? body) as Record<string, unknown>;
    const call = body.call && typeof body.call === "object" ? body.call as Record<string, unknown> : {};
    const providerCallId = String(input.providerCallId ?? input.call_id ?? call.call_id ?? body.call_id ?? "");
    if (!providerCallId) throw new Error("VOICE_CALL_FIELDS_REQUIRED");
    input.providerCallId = providerCallId;
    const callerPhone = String(input.callerPhone ?? input.phone ?? "");
    if (callerPhone) await upsertVoiceCall(auth.workspaceId, { providerCallId, callerPhone });
    const actor = { provider: "retell" as const, providerCallId, integrationPrincipalId: auth.principalId };
    let result: unknown;
    switch (tool) {
      case "customer-lookup":
        result = await lookupCaller(auth.workspaceId, String(input.callerPhone ?? input.phone ?? ""));
        break;
      case "intake-preview":
        result = await previewServiceIntake(auth.workspaceId, input as unknown as ServiceIntakeInput);
        break;
      case "available-slots":
        result = await getAvailableVoiceSlots(auth.workspaceId, input.from ? new Date(String(input.from)) : undefined, Number(input.count ?? 4));
        break;
      case "create-work-order":
        result = await createVoiceWorkOrder(auth.workspaceId, input as unknown as ServiceIntakeInput, actor, idempotencyKey(request, body, tool));
        await dispatchConfirmationEmail(auth.workspaceId, result);
        break;
      case "create-and-schedule":
        result = await createAndScheduleVoiceWork(auth.workspaceId, input as unknown as ServiceIntakeInput, actor, idempotencyKey(request, body, tool));
        await dispatchConfirmationEmail(auth.workspaceId, result);
        break;
      case "create-follow-up":
        result = await createVoiceFollowUp(auth.workspaceId, {
          providerCallId,
          reason: String(input.reason ?? "human_requested"),
          priority: input.priority as "low" | "medium" | "high" | "urgent" | undefined,
          callbackWindow: input.callbackWindow ? String(input.callbackWindow) : undefined,
        }, idempotencyKey(request, body, tool));
        break;
    }
    return retellJson(result);
  } catch (error) {
    return retellError(error);
  }
}
