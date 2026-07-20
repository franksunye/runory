import { NextRequest, NextResponse } from "next/server";
import { resolveVoiceWorkspace, verifyRetellSignature } from "@runory/platform-core";
import { timingSafeEqual } from "node:crypto";

function safeSecretMatch(actual: string | null, expected: string): boolean {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function authenticateRetell(request: NextRequest, rawBody: string, options: { allowToolSecret?: boolean } = {}) {
  const signatureSecret = process.env.RETELL_WEBHOOK_SECRET ?? process.env.RETELL_API_KEY ?? "";
  const signature = request.headers.get("x-retell-signature");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const signed = verifyRetellSignature(rawBody, signature, signatureSecret);
  const toolAuthorized = options.allowToolSecret === true && safeSecretMatch(bearer, process.env.RETELL_TOOL_SECRET ?? "");
  if (!signed && !toolAuthorized) {
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
  const status = message.includes("NOT_FOUND") || message.includes("NOT_MAPPED")
    ? 404
    : message.includes("INVALID") || message.includes("REQUIRED") || message.includes("CONFIRMED")
      ? 400
      : 500;
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function idempotencyKey(request: NextRequest, body: Record<string, unknown>, operation: string) {
  const explicit = request.headers.get("idempotency-key");
  if (explicit) return explicit;
  const input = (body.args ?? body.arguments ?? body.input ?? body) as Record<string, unknown>;
  const call = body.call && typeof body.call === "object" ? body.call as Record<string, unknown> : {};
  const callId = String(input.providerCallId ?? input.call_id ?? call.call_id ?? body.call_id ?? "unknown");
  const invocationId = String(body.toolInvocationId ?? body.tool_invocation_id ?? operation);
  return `retell:${callId}:${invocationId}:${operation}:v1`;
}
