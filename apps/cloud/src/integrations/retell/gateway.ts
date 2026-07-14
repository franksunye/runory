import { NextRequest, NextResponse } from "next/server";
import { resolveVoiceWorkspace, verifyRetellSignature } from "@runory/platform-core";

export async function authenticateRetell(request: NextRequest, rawBody: string) {
  const secret = process.env.RETELL_WEBHOOK_SECRET ?? "";
  const signature = request.headers.get("x-retell-signature") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!verifyRetellSignature(rawBody, signature, secret)) {
    throw new RetellHttpError(401, "INVALID_RETELL_SIGNATURE");
  }
  const providerResourceId = request.headers.get("x-retell-agent-id") ?? process.env.RETELL_AGENT_ID;
  if (!providerResourceId) throw new RetellHttpError(400, "RETELL_RESOURCE_ID_REQUIRED");
  return resolveVoiceWorkspace(providerResourceId);
}

export class RetellHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function retellJson(data: unknown, status = 200) {
  return NextResponse.json({ ok: status < 400, data }, { status });
}

export function retellError(error: unknown) {
  if (error instanceof RetellHttpError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "VOICE_INTAKE_INTERNAL_ERROR";
  const status = message.includes("NOT_FOUND") ? 404 : message.includes("INVALID") || message.includes("REQUIRED") || message.includes("CONFIRMED") ? 400 : 500;
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function idempotencyKey(request: NextRequest, body: Record<string, unknown>, operation: string) {
  const explicit = request.headers.get("idempotency-key");
  if (explicit) return explicit;
  const callId = String(body.providerCallId ?? body.call_id ?? "unknown");
  const invocationId = String(body.toolInvocationId ?? body.tool_invocation_id ?? operation);
  return `retell:${callId}:${invocationId}:${operation}:v1`;
}
