import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, apiPost, apiPatch, apiDelete } from "@/lib/api-fetch";

// ── Helpers ──

/**
 * Create a mock Response object whose json() resolves with `body`.
 * Use for JSON responses (both ok and error).
 */
function mockResponse(ok: boolean, status: number, body: unknown): Response {
  const statusTexts: Record<number, string> = {
    200: "OK",
    400: "Bad Request",
    404: "Not Found",
    500: "Internal Server Error",
  };
  return {
    ok,
    status,
    statusText: statusTexts[status] ?? "Unknown",
    json: async () => body,
    clone: function () {
      return this;
    },
  } as unknown as Response;
}

/**
 * Create a mock Response whose json() rejects — simulating an HTML error
 * page (e.g. Next.js 404/500 page) that cannot be parsed as JSON.
 */
function mockHtmlResponse(status: number): Response {
  const statusTexts: Record<number, string> = {
    400: "Bad Request",
    404: "Not Found",
    500: "Internal Server Error",
  };
  return {
    ok: false,
    status,
    statusText: statusTexts[status] ?? "Unknown",
    json: async () => {
      throw new SyntaxError(
        "Unexpected token '<', '<!DOCTYPE'... is not valid JSON",
      );
    },
    clone: function () {
      return this;
    },
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── apiFetch ──

describe("apiFetch", () => {
  it("returns parsed JSON when response is ok (200)", async () => {
    const mockData = { success: true, data: { id: "123" } };
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(true, 200, mockData),
    );

    const result = await apiFetch("/api/test");
    expect(result).toEqual(mockData);
  });

  it("throws Error with server error message when response is not ok and body is JSON with error.message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errorBody = {
      error: { message: "Validation failed: name is required" },
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(false, 400, errorBody),
    );

    await expect(apiFetch("/api/test")).rejects.toThrow(
      "Validation failed: name is required",
    );
  });

  it("throws Error with HTTP status when response is not ok and body is HTML (not JSON)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockResolvedValue(mockHtmlResponse(500));

    await expect(apiFetch("/api/test")).rejects.toThrow(
      "Request failed: 500 Internal Server Error",
    );
  });

  it("throws Error with server message when response is 404", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(false, 404, { error: { message: "Not found" } }),
    );

    await expect(apiFetch("/api/test")).rejects.toThrow("Not found");
  });

  it("throws Error with server message when response is 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(false, 500, { error: { message: "Server error" } }),
    );

    await expect(apiFetch("/api/test")).rejects.toThrow("Server error");
  });

  it("passes through custom headers from init parameter", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    const customHeaders = {
      Authorization: "Bearer token-123",
      "X-Custom-Header": "custom-value",
    };

    await apiFetch("/api/test", { headers: customHeaders });

    expect(fetchSpy).toHaveBeenCalledWith("/api/test", {
      headers: customHeaders,
    });
  });

  it("works with cache: 'no-store' option", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    await apiFetch("/api/test", { cache: "no-store" });

    expect(fetchSpy).toHaveBeenCalledWith("/api/test", {
      cache: "no-store",
    });
  });
});

// ── apiPost ──

describe("apiPost", () => {
  it("sets Content-Type: application/json header", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    await apiPost("/api/test", { foo: "bar" });

    const callArgs = fetchSpy.mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sets X-Requested-With: XMLHttpRequest header", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    await apiPost("/api/test", { foo: "bar" });

    const callArgs = fetchSpy.mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });

  it("JSON.stringify's the body", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    const body = { foo: "bar", num: 42 };
    await apiPost("/api/test", body);

    const callArgs = fetchSpy.mock.calls[0];
    const init = callArgs[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify(body));
  });

  it("returns parsed JSON when successful", async () => {
    const mockData = { success: true, id: "new-record" };
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(true, 200, mockData),
    );

    const result = await apiPost("/api/test", { foo: "bar" });
    expect(result).toEqual(mockData);
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(false, 500, { error: { message: "Server error" } }),
    );

    await expect(apiPost("/api/test", { foo: "bar" })).rejects.toThrow(
      "Server error",
    );
  });
});

// ── apiPatch ──

describe("apiPatch", () => {
  it("sets Content-Type: application/json header", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    await apiPatch("/api/test", { foo: "bar" });

    const callArgs = fetchSpy.mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sets X-Requested-With: XMLHttpRequest header", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    await apiPatch("/api/test", { foo: "bar" });

    const callArgs = fetchSpy.mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });

  it("JSON.stringify's the body", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    const body = { foo: "bar", num: 42 };
    await apiPatch("/api/test", body);

    const callArgs = fetchSpy.mock.calls[0];
    const init = callArgs[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify(body));
  });

  it("returns parsed JSON when successful", async () => {
    const mockData = { success: true, updated: true };
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(true, 200, mockData),
    );

    const result = await apiPatch("/api/test", { foo: "bar" });
    expect(result).toEqual(mockData);
  });
});

// ── apiDelete ──

describe("apiDelete", () => {
  it("sets X-Requested-With: XMLHttpRequest header", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    await apiDelete("/api/test");

    const callArgs = fetchSpy.mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });

  it("does NOT set Content-Type (no body)", async () => {
    const mockData = { success: true };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(true, 200, mockData));

    await apiDelete("/api/test");

    const callArgs = fetchSpy.mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("returns parsed JSON when successful", async () => {
    const mockData = { success: true, deleted: true };
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(true, 200, mockData),
    );

    const result = await apiDelete("/api/test");
    expect(result).toEqual(mockData);
  });
});
