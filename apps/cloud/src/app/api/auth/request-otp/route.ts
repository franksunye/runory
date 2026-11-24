import { NextRequest } from "next/server";
import { requestOtp, isValidEmail, isLocalDevelopmentRuntime, getOperatorOtpOwner } from "@runory/platform-core";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const body = (await request.json()) as { email?: string };
    if (!body.email || !isValidEmail(body.email)) {
      return invalidInput("A valid email address is required", requestId);
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "127.0.0.1";

    // A debug flag is never an authentication bypass in a deployed runtime.
    const returnDevCode = isLocalDevelopmentRuntime();
    const result = await requestOtp(body.email, ip, {
      devMode: returnDevCode,
      skipRateLimit: returnDevCode,
    });

    // Per SaaS Core Boundaries §4.2: "Interface responses must not leak whether email is already registered."
    // The response is identical for new and existing users.
    const operatorDelivery = getOperatorOtpOwner() !== null;
    return successResponse({
      message: operatorDelivery ? "Retrieve the verification code from the authorized host terminal." : "If this email is valid, a verification code has been sent.",
      ...(operatorDelivery ? { delivery: "operator" } : {}),
      expiresAt: result.expiresAt,
      ...(returnDevCode && result.devCode ? { devCode: result.devCode } : {}),
    }, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
