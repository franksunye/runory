import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InvalidInputError,
  generateRequestId,
} from "./context";

// ── Stable Error Codes ──
//
// Per SaaS Core Boundaries §9.3:
//   401/403 and business errors use stable error codes.
//   Production does not expose stack traces or database errors.

export const ERROR_CODES = {
  // 401 Authentication
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_INVALID_SESSION: "AUTH_INVALID_SESSION",
  AUTH_EXPIRED_SESSION: "AUTH_EXPIRED_SESSION",

  // 403 Authorization
  AUTH_FORBIDDEN: "AUTH_FORBIDDEN",
  AUTH_INSUFFICIENT_ROLE: "AUTH_INSUFFICIENT_ROLE",
  AUTH_WORKSPACE_NOT_MEMBER: "AUTH_WORKSPACE_NOT_MEMBER",

  // 404 Not Found
  NOT_FOUND: "NOT_FOUND",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",

  // 409 Conflict
  CONFLICT: "CONFLICT",
  CONFLICT_ALREADY_EXISTS: "CONFLICT_ALREADY_EXISTS",
  CONFLICT_LAST_OWNER: "CONFLICT_LAST_OWNER",

  // 429 Rate Limit
  RATE_LIMITED: "RATE_LIMITED",
  RATE_LIMITED_OTP: "RATE_LIMITED_OTP",
  RATE_LIMITED_IP: "RATE_LIMITED_IP",

  // 400 Validation
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_PLAN: "INVALID_PLAN",

  // 500 Server
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ── HTTP Status Mapping ──

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

// ── Error Envelope (framework-agnostic) ──

export interface ErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
  };
}

export function errorEnvelope(
  code: ErrorCode,
  message: string,
  requestId?: string
): ErrorEnvelope {
  return {
    success: false,
    error: { code, message, ...(requestId ? { requestId } : {}) },
  };
}

// ── Error-to-HTTP-Status Mapper ──

export function errorToHttpStatus(error: unknown): number {
  if (error instanceof AuthenticationError) return HTTP_STATUS.UNAUTHORIZED;
  if (error instanceof AuthorizationError) return HTTP_STATUS.FORBIDDEN;
  if (error instanceof NotFoundError) return HTTP_STATUS.NOT_FOUND;
  if (error instanceof ConflictError) return HTTP_STATUS.CONFLICT;
  if (error instanceof RateLimitError) return HTTP_STATUS.RATE_LIMITED;
  if (error instanceof InvalidInputError) return HTTP_STATUS.BAD_REQUEST;
  return HTTP_STATUS.INTERNAL_ERROR;
}

export function errorToCode(error: unknown): ErrorCode {
  if (error instanceof AuthenticationError) return ERROR_CODES.AUTH_REQUIRED;
  if (error instanceof AuthorizationError) return ERROR_CODES.AUTH_FORBIDDEN;
  if (error instanceof NotFoundError) return ERROR_CODES.NOT_FOUND;
  if (error instanceof ConflictError) return ERROR_CODES.CONFLICT;
  if (error instanceof RateLimitError) return ERROR_CODES.RATE_LIMITED;
  if (error instanceof InvalidInputError) return ERROR_CODES.INVALID_INPUT;
  return ERROR_CODES.INTERNAL_ERROR;
}

// ── Safe error message (no internal leakage in production) ──

export function safeErrorMessage(error: unknown): string {
  const isDev = process.env.NODE_ENV !== "production";
  if (error instanceof Error && (isDev || isDomainError(error))) {
    return error.message;
  }
  return "Internal server error";
}

function isDomainError(error: unknown): boolean {
  return (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof RateLimitError ||
    error instanceof InvalidInputError
  );
}

// ── Request ID extraction ──

export function getOrCreateRequestId(headerValue: string | null): string {
  if (headerValue && /^[a-zA-Z0-9_-]{8,128}$/.test(headerValue)) {
    return headerValue;
  }
  return generateRequestId();
}
