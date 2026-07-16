#!/usr/bin/env node

const baseUrl = process.env.RUNORY_API_BASE ?? "http://localhost:3000";
const secret = process.env.RETELL_TOOL_SECRET;
const agentId = process.env.RETELL_AGENT_ID;

if (!secret || !agentId) {
  throw new Error("RETELL_TOOL_SECRET and RETELL_AGENT_ID are required");
}

const callId = process.env.RETELL_SMOKE_CALL_ID ?? `retell_smoke_${Date.now()}`;
const callerPhone = process.env.RETELL_SMOKE_PHONE ?? "+12125550123";
const commonArgs = {
  callerPhone,
  contactName: "Retell HTTP Smoke Test",
  serviceAddress: "123 Main Street, Austin, TX",
  serviceCategory: "water_leak",
  issueDescription: `Kitchen pipe smoke test leak ${callId}`,
  urgency: "urgent",
  confirmedFields: ["serviceAddress", "serviceCategory", "urgency"],
};

async function invoke(path, name, args) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, args, call: { call_id: callId, agent_id: agentId } }),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(`${name} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.data;
}

await invoke("/api/integrations/retell/tools/customer-lookup", "customer_lookup", { callerPhone });
const preview = await invoke("/api/integrations/retell/tools/intake-preview", "intake_preview", commonArgs);
if (preview.missingFields.length || preview.requiresConfirmation.length) {
  throw new Error(`intake was not ready: ${JSON.stringify(preview)}`);
}

const first = await invoke("/api/integrations/retell/tools/create-work-order", "create_work_order", commonArgs);
const replay = await invoke("/api/integrations/retell/tools/create-work-order", "create_work_order", commonArgs);
if (first.workOrderId !== replay.workOrderId) {
  throw new Error(`idempotency failed: ${first.workOrderId} !== ${replay.workOrderId}`);
}

console.log(JSON.stringify({
  ok: true,
  callId,
  intakeSessionId: preview.intakeSessionId,
  workOrderId: first.workOrderId,
  replayedWorkOrderId: replay.workOrderId,
}, null, 2));
