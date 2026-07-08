/**
 * Unified client-side fetch wrapper.
 *
 * Prevents the class of bug where a `fetch().then(r => r.json())` call
 * receives an HTML response (404/500 page) and throws
 * "Unexpected token '<', '<!DOCTYPE'... is not valid JSON".
 *
 * Usage:
 *   import { apiFetch, apiPost } from "@/lib/api-fetch";
 *
 *   // GET
 *   const json = await apiFetch<MyDataType>("/api/workspaces/123/objects");
 *
 *   // POST
 *   const json = await apiPost<MyDataType>("/api/workspaces/123/commands/quote.submit", { recordId: "x" });
 *
 *   // With custom options
 *   const json = await apiFetch<MyDataType>(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });
 */

export interface ApiResult<T> {
  success: boolean;
  data: T;
  error?: { message: string; code?: string; status?: number };
}

/**
 * Fetch a JSON API endpoint with automatic error handling.
 * Throws a descriptive Error if the response is not ok or not valid JSON.
 */
export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);

  if (!res.ok) {
    // Try to parse a JSON error body; fall back to HTTP status
    try {
      const body = await res.clone().json();
      const message =
        body?.error?.message ?? `Request failed (${res.status} ${res.statusText})`;
      throw new Error(message);
    } catch {
      // Response was not JSON (likely HTML error page) — throw a clean error
      throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    }
  }

  const json = await res.json();
  return json as T;
}

/**
 * POST to a JSON API endpoint with automatic error handling.
 * Automatically sets Content-Type: application/json and X-Requested-With header.
 */
export async function apiPost<T = unknown>(
  url: string,
  body?: unknown,
  init?: RequestInit
): Promise<T> {
  return apiFetch<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(init?.headers ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  });
}

/**
 * PATCH a JSON API endpoint with automatic error handling.
 * Automatically sets Content-Type: application/json and X-Requested-With header.
 */
export async function apiPatch<T = unknown>(
  url: string,
  body?: unknown,
  init?: RequestInit
): Promise<T> {
  return apiFetch<T>(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(init?.headers ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  });
}

/**
 * DELETE a JSON API endpoint with automatic error handling.
 */
export async function apiDelete<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  return apiFetch<T>(url, {
    method: "DELETE",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
}
