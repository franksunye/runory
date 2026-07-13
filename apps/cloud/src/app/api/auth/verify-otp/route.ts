import { NextRequest, NextResponse } from "next/server";
import { verifyOtp, isValidEmail, SESSION_COOKIE_NAME, sessionCookieOptions } from "@runory/platform-core";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const body = (await request.json()) as { email?: string; code?: string };
    if (!body.email || !isValidEmail(body.email)) {
      return invalidInput("A valid email address is required", requestId);
    }
    if (!body.code || !/^\d{6}$/.test(body.code.trim())) {
      return invalidInput("A 6-digit verification code is required", requestId);
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "127.0.0.1";
    const userAgent = request.headers.get("user-agent") ?? "";

    const isDev = process.env.NODE_ENV !== "production";
    const returnDevCode = isDev || process.env.PLATFORM_OTP_RETURN_DEV_CODE === "true";
    const result = await verifyOtp(body.email, body.code, ip, userAgent, {
      devMode: returnDevCode,
      skipRateLimit: returnDevCode,
    });

    // Set session cookie
    const response = successResponse({
      principal: {
        userId: result.principal.userId,
        email: result.principal.email,
        displayName: result.principal.displayName,
      },
      isNewUser: result.isNewUser,
      expiresAt: result.expiresAt,
    }, 200, requestId);

    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, sessionCookieOptions());
    // Completing a real OTP login exits local demo impersonation. Without
    // clearing this cookie, an explicitly selected demo persona would continue
    // to override the newly created real session in development.
    response.cookies.set("dev-persona", "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
    });

    return response;
  } catch (e) {
    return handleError(e, requestId);
  }
}
