import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  addQuoteLine: vi.fn(),
  updateQuoteLine: vi.fn(),
  removeQuoteLine: vi.fn(),
  restoreQuoteLine: vi.fn(),
  getRecord: vi.fn(),
  canCreateRecord: vi.fn(async () => true),
  requireWorkspaceContext: vi.fn(async () => ({
    workspaceId: "ws_quote_routes",
    ctx: {
      requestId: "req_quote_routes",
      organizationId: null,
      workspaceRole: "member",
      organizationRole: null,
      principal: { userId: "usr_sales", authMethod: "session" },
    },
  })),
}));

vi.mock("@runory/platform-core", () => ({
  ERROR_CODES: {
    INVALID_INPUT: "INVALID_INPUT",
    NOT_FOUND: "NOT_FOUND",
    PERMISSION_DENIED: "PERMISSION_DENIED",
    GOVERNED_FIELD_REQUIRES_COMMAND: "GOVERNED_FIELD_REQUIRES_COMMAND",
  },
  HTTP_STATUS: { OK: 200, BAD_REQUEST: 400, NOT_FOUND: 404, FORBIDDEN: 403 },
  getOrCreateRequestId: (value: string | null) => value ?? "req_generated",
  errorToHttpStatus: () => 500,
  errorToCode: () => "INTERNAL_ERROR",
  safeErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
  AuthenticationError: class AuthenticationError extends Error {},
  AuthorizationError: class AuthorizationError extends Error {},
  NotFoundError: class NotFoundError extends Error {},
  ConflictError: class ConflictError extends Error {},
  RateLimitError: class RateLimitError extends Error {},
  getRecord: mocks.getRecord,
  getRecords: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  restoreRecord: vi.fn(),
  canCreateRecord: mocks.canCreateRecord,
  writeAuditEvent: vi.fn(async () => undefined),
  enforceQuota: vi.fn(async () => undefined),
  requireBusinessPermission: vi.fn(async () => undefined),
  listGovernedPaymentRecords: vi.fn(),
  getGovernedPaymentRecord: vi.fn(),
  isManagedField: vi.fn(() => false),
  getManagedFieldCommand: vi.fn(),
  now: () => "2026-07-30T00:00:00.000Z",
  addQuoteLine: mocks.addQuoteLine,
  updateQuoteLine: mocks.updateQuoteLine,
  removeQuoteLine: mocks.removeQuoteLine,
  restoreQuoteLine: mocks.restoreQuoteLine,
}));

vi.mock("@/lib/auth", () => ({ requireWorkspaceContext: mocks.requireWorkspaceContext }));
vi.mock("@/lib/identity", () => ({
  enrichUserReferences: vi.fn(async (records: unknown[]) => records),
  listUserReferenceFieldKeys: vi.fn(async () => []),
}));

import { POST as createRecordRoute } from "./route";
import {
  DELETE as deleteRecordRoute,
  PATCH as patchRecordRoute,
  PUT as updateRecordRoute,
} from "./[recordId]/route";

const params = {
  collection: { params: Promise.resolve({ id: "ws_quote_routes", objectKey: "quote_line" }) },
  item: { params: Promise.resolve({ id: "ws_quote_routes", objectKey: "quote_line", recordId: "qln_1" }) },
};

describe("Quote Line record Route Command delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canCreateRecord.mockResolvedValue(true);
    mocks.getRecord.mockImplementation(async (_workspaceId: string, objectKey: string) => {
      if (objectKey === "quote") return { id: "quote_1", aggregate_version: 7, status: "draft" };
      return { id: "qln_1", quote_id: "quote_1", description: "Labor", deleted_at: null };
    });
    mocks.addQuoteLine.mockResolvedValue({ aggregate: { line: { id: "qln_1", quote_id: "quote_1", line_total: 195 } } });
    mocks.updateQuoteLine.mockResolvedValue({ aggregate: { line: { id: "qln_1", quote_id: "quote_1", line_total: 295 } } });
    mocks.removeQuoteLine.mockResolvedValue({ aggregate: { line: { id: "qln_1", deleted_at: "2026-07-30" } } });
    mocks.restoreQuoteLine.mockResolvedValue({ aggregate: { line: { id: "qln_1", deleted_at: null } } });
  });

  it("delegates create to quote.add_line and returns the authoritative derived line", async () => {
    const response = await createRecordRoute(new NextRequest(
      "https://runory.example/api/workspaces/ws_quote_routes/objects/quote_line/records",
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "add-line-key" },
        body: JSON.stringify({
          quote_id: "quote_1",
          description: "Labor",
          quantity: 2,
          unit_price: 100,
          discount_amount: 10,
          tax_amount: 5,
          line_total: 999999,
        }),
      },
    ), params.collection);

    expect(response.status).toBe(201);
    expect(mocks.addQuoteLine).toHaveBeenCalledWith(
      "ws_quote_routes",
      "quote_1",
      { id: "usr_sales", type: "user" },
      7,
      expect.objectContaining({ quantity: 2, unit_price: 100, line_total: 999999 }),
      "add-line-key",
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: "qln_1", line_total: 195 },
    });
  });

  it("delegates update and refuses to move a line between Quotes", async () => {
    const moved = await updateRecordRoute(new NextRequest(
      "https://runory.example/api/workspaces/ws_quote_routes/objects/quote_line/records/qln_1",
      { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ quote_id: "quote_2" }) },
    ), params.item);
    expect(moved.status).toBe(400);
    expect(mocks.updateQuoteLine).not.toHaveBeenCalled();

    const response = await updateRecordRoute(new NextRequest(
      "https://runory.example/api/workspaces/ws_quote_routes/objects/quote_line/records/qln_1",
      { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantity: 3 }) },
    ), params.item);
    expect(response.status).toBe(200);
    expect(mocks.updateQuoteLine).toHaveBeenCalledWith(
      "ws_quote_routes", "quote_1", "qln_1", { id: "usr_sales", type: "user" }, 7,
      expect.objectContaining({ quantity: 3 }), "req_generated",
    );
  });

  it("delegates soft-delete and restore to the Quote aggregate Commands", async () => {
    const deleted = await deleteRecordRoute(new NextRequest(
      "https://runory.example/api/workspaces/ws_quote_routes/objects/quote_line/records/qln_1",
      { method: "DELETE", headers: { "idempotency-key": "remove-line-key" } },
    ), params.item);
    expect(deleted.status).toBe(200);
    expect(mocks.removeQuoteLine).toHaveBeenCalledWith(
      "ws_quote_routes", "quote_1", "qln_1", { id: "usr_sales", type: "user" }, 7,
      { hard: false }, "remove-line-key",
    );

    mocks.getRecord.mockImplementation(async (_workspaceId: string, objectKey: string) => {
      if (objectKey === "quote") return { id: "quote_1", aggregate_version: 8, status: "draft" };
      return { id: "qln_1", quote_id: "quote_1", deleted_at: "2026-07-30" };
    });
    const restored = await patchRecordRoute(new NextRequest(
      "https://runory.example/api/workspaces/ws_quote_routes/objects/quote_line/records/qln_1",
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore" }) },
    ), params.item);
    expect(restored.status).toBe(200);
    expect(mocks.restoreQuoteLine).toHaveBeenCalledWith(
      "ws_quote_routes", "quote_1", "qln_1", { id: "usr_sales", type: "user" }, 8, "req_generated",
    );
  });
});
