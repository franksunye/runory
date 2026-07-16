import { NextResponse } from "next/server";
import { ok, err, type ToolEnvelope } from "@runory/contracts";
import {
  type ErrorCode,
  type ErrorEnvelope,
  ERROR_CODES,
  HTTP_STATUS,
  errorToHttpStatus,
  errorToCode,
  safeErrorMessage,
  getOrCreateRequestId,
} from "@runory/platform-core";
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  type RequestContext,
} from "@runory/platform-core";

// ── Response Builders ──

export function successResponse<T>(
  data: T,
  status: number = HTTP_STATUS.OK,
  requestId?: string,
  cacheControl?: string
): NextResponse<ToolEnvelope<T>> {
  const body = ok(data);
  const response = NextResponse.json(body, { status });
  if (requestId) {
    response.headers.set("x-request-id", requestId);
  }
  if (cacheControl) {
    response.headers.set("Cache-Control", cacheControl);
  }
  return response;
}

/**
 * Cache-Control directive for near-static metadata endpoints (navigation,
 * installations, fields, views, dashboard layout). Allows the browser to
 * serve from cache for 30s while revalidating in the background for up to 5min.
 * `private` prevents CDN caching (responses are user/workspace-scoped).
 */
export const METADATA_CACHE = "private, max-age=30, stale-while-revalidate=300";

export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  requestId?: string
): NextResponse<ErrorEnvelope> {
  const body: ErrorEnvelope = {
    success: false,
    error: { code, message, ...(requestId ? { requestId } : {}) },
  };
  const response = NextResponse.json(body, { status });
  if (requestId) {
    response.headers.set("x-request-id", requestId);
  }
  return response;
}

// ── Error Handler ──

export function handleError(error: unknown, requestId?: string): NextResponse<ErrorEnvelope> {
  const status = errorToHttpStatus(error);
  const code = errorToCode(error);
  const message = safeErrorMessage(error);
  const diagnostic =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "UnknownError", message: String(error) };

  console.error("[http:error]", {
    requestId: requestId ?? null,
    status,
    code,
    ...diagnostic,
  });
  return errorResponse(code, message, status, requestId);
}

// ── Request ID ──

export { getOrCreateRequestId };

// ── Typed Error constructors (for routes that need to throw) ──

export {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
};

// ── Common error shortcuts ──

export function notFound(message = "Resource not found", requestId?: string): NextResponse<ErrorEnvelope> {
  return errorResponse(ERROR_CODES.NOT_FOUND, message, HTTP_STATUS.NOT_FOUND, requestId);
}

export function forbidden(message = "Access denied", requestId?: string): NextResponse<ErrorEnvelope> {
  return errorResponse(ERROR_CODES.AUTH_FORBIDDEN, message, HTTP_STATUS.FORBIDDEN, requestId);
}

export function invalidInput(message: string, requestId?: string): NextResponse<ErrorEnvelope> {
  return errorResponse(ERROR_CODES.INVALID_INPUT, message, HTTP_STATUS.BAD_REQUEST, requestId);
}
