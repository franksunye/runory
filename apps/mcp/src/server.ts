#!/usr/bin/env node
/**
 * Runory MCP Server 1.0 (stdio transport)
 *
 * Personal Agents (Codex / Trae / Cursor / Claude Code) read the Runory Skill,
 * then call these MCP tools to operate Runory.
 *
 * Runory does NOT call LLM APIs. It only validates and executes governed
 * operations through the same Cloud APIs the UI uses.
 *
 * Operation contract (v0.4.4):
 *   discover → plan → validate → preview → apply → verify → audit → rollback
 *
 * Tool families:
 *   workspace.list / workspace.create / workspace.inspect
 *   pack.list / pack.install
 *   object.inspect / view.inspect
 *   extension.plan / extension.preview / extension.apply / extension.rollback / extension.list
 *   workflow.inspect / automation.inspect
 *   agent_operation.history / audit.search
 *   record.create / record.list / record.get / record.update / record.delete
 *
 * Note: object.field.add and view.modify are accomplished through the
 * extension.plan → extension.preview → extension.apply pipeline. They are not
 * single-shot tools because every governed change must be previewable and
 * auditable before it is committed.
 *
 * Usage:
 *   pnpm --filter @runory/mcp start
 *
 * Environment:
 *   RUNORY_API_BASE      - Base URL of the Runory Cloud API (default: http://localhost:3000)
 *   RUNORY_API_KEY       - API key used to authenticate against the Runory Cloud API.
 *                          When set, an `Authorization: Bearer <key>` header is sent on
 *                          every API call. When unset, requests are sent without an
 *                          Authorization header (dev mode only — production will return 401).
 *   RUNORY_WORKSPACE_ID  - Optional default workspace ID. When set, tools use it as the
 *                          default `workspaceId` whenever the caller does not supply one.
 *                          An explicitly passed `workspaceId` always takes precedence.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.RUNORY_API_BASE ?? "http://localhost:3000";
const API_KEY = process.env.RUNORY_API_KEY;
const DEFAULT_WORKSPACE_ID = process.env.RUNORY_WORKSPACE_ID;

// ── HTTP helper ──
//
// All tools call the Runory Cloud API. Responses follow the standard envelope:
//   { success: true, data: ... } | { success: false, error: { code, message, requestId? } }
// `callApi` returns the data on success or the error envelope on failure, so tool
// handlers can surface either shape to the agent verbatim.

async function callApi(path: string, method: string = "GET", body?: unknown) {
  const headers: Record<string, string> = {
    // Required by the Cloud API's CSRF protection for mutation requests.
    "X-Requested-With": "XMLHttpRequest",
  };
  if (body) headers["Content-Type"] = "application/json";
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Resolve workspace ID: explicit arg wins, then env default.
function ws(workspaceId: string | undefined): string {
  const id = workspaceId || DEFAULT_WORKSPACE_ID;
  if (!id) {
    throw new Error("workspaceId is required (or set RUNORY_WORKSPACE_ID).");
  }
  return id;
}

// Build a text content response from any JSON-serializable value.
function text(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

// Surface either the success data or the error envelope.
function payload(result: { success?: boolean; data?: unknown; error?: unknown }) {
  return result.success ? result.data : result.error ?? result;
}

// Parse a JSON string argument, returning a safe error envelope on failure.
function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
}

// Common workspaceId schema fragment used by most tools.
const workspaceIdSchema = {
  workspaceId: z.string().optional().describe(
    "The workspace ID or slug. If omitted, uses RUNORY_WORKSPACE_ID."
  ),
};

// ── createServer ──
//
// Creates a fresh McpServer with all v0.4.4 stable tools registered. Exported
// so tests can create an isolated server instance, connect it to an in-memory
// transport, and verify the tool surface via the MCP protocol.
export function createServer(): McpServer {
  const server = new McpServer({
    name: "runory-cloud",
    version: "0.4.4",
  });

// ════════════════════════════════════════════════════════════════════
// Workspace operations
// ════════════════════════════════════════════════════════════════════

// ── workspace.list ──
server.registerTool(
  "workspace.list",
  {
    title: "List Workspaces",
    description: "List all workspaces accessible to the authenticated principal.",
    inputSchema: {},
  },
  async () => {
    const result = await callApi(`/api/workspaces`);
    return text(payload(result));
  }
);

// ── workspace.create ──
server.registerTool(
  "workspace.create",
  {
    title: "Create Workspace",
    description:
      "Create a new workspace. An organization and first workspace are auto-provisioned for the creator. Optionally initialize from a template.",
    inputSchema: {
      name: z.string().describe("The name of the new workspace"),
      templateId: z.string().optional().describe("Optional template ID to initialize the workspace from"),
      organizationId: z.string().optional().describe("Optional organization ID. If omitted, the API uses the creator's default org."),
    },
  },
  async ({ name, templateId, organizationId }) => {
    const body: Record<string, unknown> = { name };
    if (templateId !== undefined) body.templateId = templateId;
    if (organizationId !== undefined) body.organizationId = organizationId;
    const result = await callApi(`/api/workspaces`, "POST", body);
    return text(payload(result));
  }
);

// ── workspace.inspect ──
//
// Unified workspace inspection: status + installed packs + extensions + the
// full object schema (objects, fields, views). This is the recommended first
// call before generating an Extension Plan. It merges the former status and
// inspect_schema tools into one discovery operation.
server.registerTool(
  "workspace.inspect",
  {
    title: "Inspect Workspace",
    description:
      "Inspect a workspace: metadata, installed packs, extensions, and the full object schema (objects, fields, views). Use this as the discover step before proposing any governed change.",
    inputSchema: workspaceIdSchema,
  },
  async ({ workspaceId }) => {
    const id = ws(workspaceId);
    const [workspace, installations, extensions, objects] = await Promise.all([
      callApi(`/api/workspaces/${id}`),
      callApi(`/api/workspaces/${id}/installations`),
      callApi(`/api/workspaces/${id}/extensions`),
      callApi(`/api/workspaces/${id}/objects`),
    ]);

    // Enrich each object with its fields and views.
    const detailedObjects = await Promise.all(
      (objects.data || []).map(async (obj: { objectKey: string; label?: string; moduleId?: string }) => {
        const [fieldsRes, viewsRes] = await Promise.all([
          callApi(`/api/workspaces/${id}/objects/${obj.objectKey}`),
          callApi(`/api/workspaces/${id}/objects/${obj.objectKey}/views`),
        ]);
        return {
          objectKey: obj.objectKey,
          label: obj.label,
          moduleId: obj.moduleId,
          fields: fieldsRes.data?.fields ?? [],
          views: viewsRes.data ?? [],
        };
      })
    );

    return text({
      workspace: payload(workspace),
      installedPacks: payload(installations),
      extensions: payload(extensions),
      objects: detailedObjects,
    });
  }
);

// ════════════════════════════════════════════════════════════════════
// Pack operations
// ════════════════════════════════════════════════════════════════════

// ── pack.list ──
server.registerTool(
  "pack.list",
  {
    title: "List Packs",
    description:
      "List all available packs for a workspace with installation status, demo-data status, and update availability. This is the pack discovery operation — use it to find installable packs and their IDs.",
    inputSchema: workspaceIdSchema,
  },
  async ({ workspaceId }) => {
    const id = ws(workspaceId);
    const result = await callApi(`/api/workspaces/${id}/packs`);
    return text(payload(result));
  }
);

// ── pack.install ──
server.registerTool(
  "pack.install",
  {
    title: "Install Pack",
    description:
      "Install a pack into a workspace by pack ID. Optionally load the pack's demo data in the same call. Returns the installed modules, created objects, and demo record count.",
    inputSchema: {
      ...workspaceIdSchema,
      packId: z.string().describe("The pack ID to install (e.g., 'crm-lite-pack', 'fsm-pack')"),
      includeDemoData: z.boolean().optional().describe("If true, load the pack's demo data after install. Default: false."),
    },
  },
  async ({ workspaceId, packId, includeDemoData }) => {
    const id = ws(workspaceId);
    const result = await callApi(
      `/api/workspaces/${id}/packs/${packId}/install`,
      "POST",
      { includeDemoData: includeDemoData === true }
    );
    return text(payload(result));
  }
);

// ════════════════════════════════════════════════════════════════════
// Object / View inspection
// ════════════════════════════════════════════════════════════════════

// ── object.inspect ──
server.registerTool(
  "object.inspect",
  {
    title: "Inspect Object",
    description:
      "Inspect a single business object: its definition, fields, views, and relations. Use this to understand an object's schema before adding a field or modifying a view.",
    inputSchema: {
      ...workspaceIdSchema,
      objectKey: z.string().describe("The object key (e.g., 'company', 'contact', 'deal', 'work_order')"),
    },
  },
  async ({ workspaceId, objectKey }) => {
    const id = ws(workspaceId);
    const [objectRes, viewsRes, relationsRes] = await Promise.all([
      callApi(`/api/workspaces/${id}/objects/${objectKey}`),
      callApi(`/api/workspaces/${id}/objects/${objectKey}/views`),
      callApi(`/api/workspaces/${id}/objects/${objectKey}/relations`).catch(() => ({ data: [] })),
    ]);
    return text({
      object: payload(objectRes),
      views: payload(viewsRes),
      relations: payload(relationsRes),
    });
  }
);

// ── view.inspect ──
server.registerTool(
  "view.inspect",
  {
    title: "Inspect Views",
    description:
      "Inspect the views defined for a business object, including columns, filters, sections, and the extension points that declare which modifications are allowed. Use this before proposing a view.modify change.",
    inputSchema: {
      ...workspaceIdSchema,
      objectKey: z.string().describe("The object key (e.g., 'company', 'contact')"),
    },
  },
  async ({ workspaceId, objectKey }) => {
    const id = ws(workspaceId);
    const result = await callApi(`/api/workspaces/${id}/objects/${objectKey}/views`);
    return text(payload(result));
  }
);

// ════════════════════════════════════════════════════════════════════
// Governed extension pipeline (plan / preview / apply / rollback)
//
// object.field.add and view.modify are accomplished through this pipeline.
// An agent must call plan (validate), then preview (diff), then apply
// (commit). Each step is a separate tool so the change is previewable and
// auditable before it is committed.
// ════════════════════════════════════════════════════════════════════

const EXTENSION_PLAN_DOC =
  "Extension Plan JSON string. Shape: { name: string, description?: string, targetModules: string[], riskLevel: 'low'|'medium'|'high', customFields?: [{ targetObject, fieldKey, label, type: 'text'|'email'|'phone'|'number'|'date'|'select'|'boolean'|'lookup', ownership: 'workspace_extension', required?, validation?, ui?: { listColumn?, slot?, order? } }], viewModifications?: [{ targetObject, viewKey, modifications: { reorderColumns?: string[], addFilters?: [{ field, operator: 'eq'|'neq'|'contains'|'gt'|'lt'|'gte'|'lte'|'in', value: string|number|boolean|string[] }], addSection?: { title, fields: [{ field, required? }], afterSection? }, addAction?: string, pageSize?: number } }] }";

// ── extension.plan ──
server.registerTool(
  "extension.plan",
  {
    title: "Validate Extension Plan",
    description:
      "Validate an Extension Plan against module extension points without applying it. Returns { valid, errors }. This is the validate step — call it before preview and apply. Supports customFields (object.field.add) and viewModifications (view.modify).",
    inputSchema: {
      ...workspaceIdSchema,
      plan: z.string().describe(EXTENSION_PLAN_DOC),
    },
  },
  async ({ workspaceId, plan }) => {
    const id = ws(workspaceId);
    const parsed = parseJson(plan);
    if (!parsed.ok) return text({ valid: false, errors: [parsed.error] });
    const result = await callApi(`/api/workspaces/${id}/agent/plan`, "POST", parsed.value);
    return text(payload(result));
  }
);

// ── extension.preview ──
server.registerTool(
  "extension.preview",
  {
    title: "Preview Extension Diff",
    description:
      "Preview the diff of an Extension Plan before applying. Returns added fields, affected views, viewModifications (with before/after state), and risk level. This is the preview step — show the diff to the user and obtain approval before calling apply.",
    inputSchema: {
      ...workspaceIdSchema,
      plan: z.string().describe(EXTENSION_PLAN_DOC),
    },
  },
  async ({ workspaceId, plan }) => {
    const id = ws(workspaceId);
    const parsed = parseJson(plan);
    if (!parsed.ok) return text({ error: parsed.error });
    const result = await callApi(`/api/workspaces/${id}/agent/preview`, "POST", parsed.value);
    return text(payload(result));
  }
);

// ── extension.apply ──
server.registerTool(
  "extension.apply",
  {
    title: "Apply Extension",
    description:
      "Apply a validated Extension Plan to the workspace. Creates field definitions, updates view configs, creates an extension version (rollback point), and writes an audit event. Requires a plan that passed validation. This is the apply step — only call it after the user approves the previewed diff.",
    inputSchema: {
      ...workspaceIdSchema,
      plan: z.string().describe(EXTENSION_PLAN_DOC),
      createdBy: z.string().describe("Identifier of the agent or user applying the extension (e.g., 'codex', 'trae', 'user@example.com')"),
    },
  },
  async ({ workspaceId, plan, createdBy }) => {
    const id = ws(workspaceId);
    const parsed = parseJson(plan);
    if (!parsed.ok) return text({ error: parsed.error });
    const result = await callApi(`/api/workspaces/${id}/agent/apply`, "POST", { plan: parsed.value, createdBy });
    return text(payload(result));
  }
);

// ── extension.rollback ──
server.registerTool(
  "extension.rollback",
  {
    title: "Rollback Extension",
    description:
      "Roll back the latest version of an extension. Removes extension-created fields from definitions and views, reverses view modifications, and creates an audit event. This is the rollback step — use it when a change should be undone.",
    inputSchema: {
      ...workspaceIdSchema,
      extensionId: z.string().describe("The extension ID to roll back"),
      rolledBy: z.string().describe("Identifier of the agent or user performing the rollback"),
    },
  },
  async ({ workspaceId, extensionId, rolledBy }) => {
    const id = ws(workspaceId);
    const result = await callApi(`/api/workspaces/${id}/agent/rollback`, "POST", { extensionId, rolledBy });
    return text(payload(result));
  }
);

// ── extension.list ──
server.registerTool(
  "extension.list",
  {
    title: "List Extensions",
    description:
      "List all extensions in a workspace with their current versions. Use this as the verify step after an apply, or to find an extensionId for rollback.",
    inputSchema: workspaceIdSchema,
  },
  async ({ workspaceId }) => {
    const id = ws(workspaceId);
    const result = await callApi(`/api/workspaces/${id}/extensions`);
    return text(payload(result));
  }
);

// ════════════════════════════════════════════════════════════════════
// Workflow / Automation inspection
// ════════════════════════════════════════════════════════════════════

// ── workflow.inspect ──
server.registerTool(
  "workflow.inspect",
  {
    title: "Inspect Workflows",
    description:
      "List the state-machine workflows defined in a workspace, including their states and transitions. Optionally fetch a single workflow by ID.",
    inputSchema: {
      ...workspaceIdSchema,
      workflowId: z.string().optional().describe("Optional workflow ID. If omitted, lists all workflows."),
    },
  },
  async ({ workspaceId, workflowId }) => {
    const id = ws(workspaceId);
    const path = workflowId
      ? `/api/workspaces/${id}/workflows/${workflowId}`
      : `/api/workspaces/${id}/workflows`;
    const result = await callApi(path);
    return text(payload(result));
  }
);

// ── automation.inspect ──
server.registerTool(
  "automation.inspect",
  {
    title: "Inspect Automations",
    description:
      "List the automations defined in a workspace (event-triggered rules). Optionally fetch a single automation by ID.",
    inputSchema: {
      ...workspaceIdSchema,
      automationId: z.string().optional().describe("Optional automation ID. If omitted, lists all automations."),
    },
  },
  async ({ workspaceId, automationId }) => {
    const id = ws(workspaceId);
    const path = automationId
      ? `/api/workspaces/${id}/automations/${automationId}`
      : `/api/workspaces/${id}/automations`;
    const result = await callApi(path);
    return text(payload(result));
  }
);

// ════════════════════════════════════════════════════════════════════
// Operation history / Audit
// ════════════════════════════════════════════════════════════════════

// ── agent_operation.history ──
//
// Returns the history of governed extension operations (applies and rollbacks)
// for a workspace. Sources the extension versions (structured) and falls back
// to the audit-events stream so both the version trail and the raw audit trail
// are available.
server.registerTool(
  "agent_operation.history",
  {
    title: "Agent Operation History",
    description:
      "List the history of governed agent operations (extension applies and rollbacks) in a workspace. Returns extension versions with actor, action, and timestamp. Use this to review what an agent has changed.",
    inputSchema: {
      ...workspaceIdSchema,
      limit: z.number().int().positive().optional().describe("Maximum number of audit events to scan (default 100)"),
    },
  },
  async ({ workspaceId, limit }) => {
    const id = ws(workspaceId);
    const [extensionsRes, auditRes] = await Promise.all([
      callApi(`/api/workspaces/${id}/extensions`),
      callApi(`/api/workspaces/${id}/audit-events?limit=${limit ?? 100}`),
    ]);
    const auditEvents = (auditRes.data ?? []) as Array<{ action?: string }>;
    const extensionEvents = auditEvents.filter(
      (e) => typeof e.action === "string" && e.action.startsWith("extension.")
    );
    return text({
      extensions: payload(extensionsRes),
      extensionAuditEvents: extensionEvents,
    });
  }
);

// ── audit.search ──
server.registerTool(
  "audit.search",
  {
    title: "Search Audit Events",
    description:
      "Search the workspace audit trail by action, actor, entity type, and pagination. Returns raw audit events with full detail. Use this to investigate who changed what and when.",
    inputSchema: {
      ...workspaceIdSchema,
      action: z.string().optional().describe("Filter by audit action type (e.g., 'extension.apply', 'record.create')"),
      actorId: z.string().optional().describe("Filter by the actor user ID"),
      entityType: z.string().optional().describe("Filter by the affected entity type (e.g., 'company', 'extension')"),
      limit: z.number().int().positive().optional().describe("Maximum number of events to return (default 100, max 500)"),
      offset: z.number().int().nonnegative().optional().describe("Number of events to skip for pagination"),
    },
  },
  async ({ workspaceId, action, actorId, entityType, limit, offset }) => {
    const id = ws(workspaceId);
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (actorId) params.set("actorId", actorId);
    if (entityType) params.set("entityType", entityType);
    params.set("limit", String(limit ?? 100));
    if (offset !== undefined) params.set("offset", String(offset));
    const result = await callApi(`/api/workspaces/${id}/audit-events?${params.toString()}`);
    return text(payload(result));
  }
);

// ════════════════════════════════════════════════════════════════════
// Record CRUD (additional tools beyond the MVP operation families)
// ════════════════════════════════════════════════════════════════════

// ── record.create ──
server.registerTool(
  "record.create",
  {
    title: "Create Record",
    description: "Create a record in a workspace object (e.g., company, contact, deal).",
    inputSchema: {
      ...workspaceIdSchema,
      objectKey: z.string().describe("The object key (e.g., 'company', 'contact')"),
      data: z.string().describe('Record data as JSON string (e.g., {"name":"Acme Corp","email":"info@acme.com"})'),
    },
  },
  async ({ workspaceId, objectKey, data }) => {
    const id = ws(workspaceId);
    const parsed = parseJson(data);
    if (!parsed.ok) return text({ error: parsed.error });
    const result = await callApi(`/api/workspaces/${id}/objects/${objectKey}/records`, "POST", parsed.value);
    return text(payload(result));
  }
);

// ── record.list ──
server.registerTool(
  "record.list",
  {
    title: "List Records",
    description: "List records in a workspace object, with optional pagination and search.",
    inputSchema: {
      ...workspaceIdSchema,
      objectKey: z.string().describe("The object key (e.g., 'company', 'contact')"),
      limit: z.number().int().positive().optional().describe("Maximum number of records to return"),
      offset: z.number().int().nonnegative().optional().describe("Number of records to skip for pagination"),
      search: z.string().optional().describe("Search query to filter records"),
    },
  },
  async ({ workspaceId, objectKey, limit, offset, search }) => {
    const id = ws(workspaceId);
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    if (search !== undefined) params.set("search", search);
    const qs = params.toString();
    const result = await callApi(`/api/workspaces/${id}/objects/${objectKey}/records${qs ? `?${qs}` : ""}`);
    return text(result.data ?? result);
  }
);

// ── record.get ──
server.registerTool(
  "record.get",
  {
    title: "Get Record",
    description: "Get a single record by ID from a workspace object.",
    inputSchema: {
      ...workspaceIdSchema,
      objectKey: z.string().describe("The object key (e.g., 'company', 'contact')"),
      recordId: z.string().describe("The record ID"),
    },
  },
  async ({ workspaceId, objectKey, recordId }) => {
    const id = ws(workspaceId);
    const result = await callApi(`/api/workspaces/${id}/objects/${objectKey}/records/${recordId}`);
    return text(result.data ?? result);
  }
);

// ── record.update ──
server.registerTool(
  "record.update",
  {
    title: "Update Record",
    description: "Update a record in a workspace object by ID.",
    inputSchema: {
      ...workspaceIdSchema,
      objectKey: z.string().describe("The object key (e.g., 'company', 'contact')"),
      recordId: z.string().describe("The record ID"),
      data: z.string().describe('Record data as JSON string (e.g., {"name":"Acme Corp"})'),
    },
  },
  async ({ workspaceId, objectKey, recordId, data }) => {
    const id = ws(workspaceId);
    const parsed = parseJson(data);
    if (!parsed.ok) return text({ error: parsed.error });
    const result = await callApi(`/api/workspaces/${id}/objects/${objectKey}/records/${recordId}`, "PUT", parsed.value);
    return text(result.data ?? result.error ?? result);
  }
);

// ── record.delete ──
server.registerTool(
  "record.delete",
  {
    title: "Delete Record",
    description: "Delete a record in a workspace object by ID.",
    inputSchema: {
      ...workspaceIdSchema,
      objectKey: z.string().describe("The object key (e.g., 'company', 'contact')"),
      recordId: z.string().describe("The record ID"),
    },
  },
  async ({ workspaceId, objectKey, recordId }) => {
    const id = ws(workspaceId);
    const result = await callApi(`/api/workspaces/${id}/objects/${objectKey}/records/${recordId}`, "DELETE");
    return text(result.data ?? result.error ?? { deleted: true });
  }
);

  return server;
}

// ════════════════════════════════════════════════════════════════════
// Start server
// ════════════════════════════════════════════════════════════════════

export const TOOL_COUNT = 21;

async function main() {
  if (API_KEY) {
    console.error(`[runory-mcp] Auth mode: API key (Bearer).${DEFAULT_WORKSPACE_ID ? ` Default workspace: ${DEFAULT_WORKSPACE_ID}.` : ""}`);
  } else {
    console.error(`[runory-mcp] Auth mode: dev (no Authorization header). Set RUNORY_API_KEY for production.`);
  }
  console.error(`[runory-mcp] Registered ${TOOL_COUNT} tools (v0.4.4 stable operation surface).`);
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only auto-start when run directly (pnpm start / pnpm dev). When imported by
// tests (VITEST is set by vitest), createServer() is called explicitly.
if (!process.env.VITEST) {
  main().catch((error) => {
    console.error("Runory MCP server error:", error);
    process.exit(1);
  });
}
