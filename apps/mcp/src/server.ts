#!/usr/bin/env node
/**
 * Runory MCP Server (stdio transport)
 *
 * Personal Agents (Codex / Trae / Cursor / Claude Code) read the Runory Skill,
 * then call these MCP tools to operate Runory.
 *
 * Runory does NOT call LLM APIs. It only validates and executes governed operations.
 *
 * Usage:
 *   pnpm --filter @runory/cloud mcp
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

async function apiCall(path: string, method: string = "GET", body?: unknown) {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return json;
}

const server = new McpServer({
  name: "runory-cloud",
  version: "0.1.0",
});

// ── runory.workspace.status ──
server.registerTool(
  "runory.workspace.status",
  {
    title: "Runory Workspace Status",
    description: "Get the status of a Runory workspace, including installed modules and extensions.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
    },
  },
  async ({ workspaceId }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const [workspace, installations, extensions, objects] = await Promise.all([
      apiCall(`/api/workspaces/${wsId}`),
      apiCall(`/api/workspaces/${wsId}/installations`),
      apiCall(`/api/workspaces/${wsId}/extensions`),
      apiCall(`/api/workspaces/${wsId}/objects`),
    ]);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          workspace: workspace.data,
          installedModules: installations.data,
          extensions: extensions.data,
          objects: objects.data,
        }, null, 2),
      }],
    };
  }
);

// ── runory.workspace.inspect_schema ──
server.registerTool(
  "runory.workspace.inspect_schema",
  {
    title: "Inspect Workspace Schema",
    description: "Get the full schema of a workspace: objects, fields, views, and extension points. Use this before generating an Extension Plan.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
    },
  },
  async ({ workspaceId }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const objects = await apiCall(`/api/workspaces/${wsId}/objects`);

    const detailedObjects = await Promise.all(
      (objects.data || []).map(async (obj: any) => {
        const [fieldsRes, viewsRes] = await Promise.all([
          apiCall(`/api/workspaces/${wsId}/objects/${obj.objectKey}`),
          apiCall(`/api/workspaces/${wsId}/objects/${obj.objectKey}/views`),
        ]);
        return {
          objectKey: obj.objectKey,
          label: obj.label,
          moduleId: obj.moduleId,
          fields: fieldsRes.data?.fields || [],
          views: viewsRes.data || [],
        };
      })
    );

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ objects: detailedObjects }, null, 2),
      }],
    };
  }
);

// ── runory.extension.plan ──
server.registerTool(
  "runory.extension.plan",
  {
    title: "Submit Extension Plan",
    description: "Submit an Extension Plan JSON for validation. The Personal Agent generates this plan; Runory validates it against module extension points. Supports customFields (adding new fields to objects) and viewModifications (reordering columns, adding filters, adding form sections, adding actions, changing page size). Returns { valid, errors }.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      plan: z.string().describe("Extension Plan JSON string. Schema: { name, description?, targetModules: string[], riskLevel: 'low'|'medium'|'high', customFields: [{ targetObject, fieldKey, label, type: 'text'|'email'|'phone'|'number'|'date'|'select'|'boolean', ownership: 'workspace_extension', required?, validation?, ui?: { listColumn?, slot?, order? } }], viewModifications: [{ targetObject, viewKey, modifications: { reorderColumns?: string[], addFilters?: [{ field, operator: 'eq'|'neq'|'contains'|'gt'|'lt'|'gte'|'lte'|'in', value: string|number|boolean|string[] }], addSection?: { title, fields: [{ field, required? }], afterSection? }, addAction?: string, pageSize?: number } }] }"),
    },
  },
  async ({ workspaceId, plan }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    let parsedPlan: unknown;
    try {
      parsedPlan = JSON.parse(plan);
    } catch {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ valid: false, errors: ["Invalid JSON"] }),
        }],
      };
    }

    const result = await apiCall(`/api/workspaces/${wsId}/agent/plan`, "POST", parsedPlan);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data || result.error, null, 2),
      }],
    };
  }
);

// ── runory.extension.preview ──
server.registerTool(
  "runory.extension.preview",
  {
    title: "Preview Extension Diff",
    description: "Preview the diff of an Extension Plan before applying. Returns added fields, affected views, viewModifications (with before/after state for each modified view), and risk level. Supports both customFields and viewModifications.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      plan: z.string().describe("Extension Plan JSON string (same format as runory.extension.plan, supports customFields and viewModifications)"),
    },
  },
  async ({ workspaceId, plan }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    let parsedPlan: unknown;
    try {
      parsedPlan = JSON.parse(plan);
    } catch {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "Invalid JSON" }),
        }],
      };
    }

    const result = await apiCall(`/api/workspaces/${wsId}/agent/preview`, "POST", parsedPlan);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data || result.error, null, 2),
      }],
    };
  }
);

// ── runory.extension.apply ──
server.registerTool(
  "runory.extension.apply",
  {
    title: "Apply Extension",
    description: "Apply an Extension Plan to the workspace. Creates field definitions, updates view definitions (including view modifications like column reordering, filters, sections, actions, and page size), creates audit log and rollback point. Requires a validated plan.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      plan: z.string().describe("Extension Plan JSON string (same format as runory.extension.plan)"),
      createdBy: z.string().describe("Identifier of the agent or user applying the extension (e.g., 'codex', 'trae', 'user@example.com')"),
    },
  },
  async ({ workspaceId, plan, createdBy }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    let parsedPlan: unknown;
    try {
      parsedPlan = JSON.parse(plan);
    } catch {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "Invalid JSON" }),
        }],
      };
    }

    const result = await apiCall(`/api/workspaces/${wsId}/agent/apply`, "POST", { plan: parsedPlan, createdBy });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data || result.error, null, 2),
      }],
    };
  }
);

// ── runory.extension.rollback ──
server.registerTool(
  "runory.extension.rollback",
  {
    title: "Rollback Extension",
    description: "Rollback the latest version of an extension. Removes extension-created fields from definitions and views, reverses view modifications (restores column order, removes added filters/sections/actions, restores page size), creates audit log entry.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      extensionId: z.string().describe("The extension ID to rollback"),
      rolledBy: z.string().describe("Identifier of the agent or user performing the rollback"),
    },
  },
  async ({ workspaceId, extensionId, rolledBy }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const result = await apiCall(`/api/workspaces/${wsId}/agent/rollback`, "POST", { extensionId, rolledBy });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data || result.error, null, 2),
      }],
    };
  }
);

// ── runory.extension.list ──
server.registerTool(
  "runory.extension.list",
  {
    title: "List Extensions",
    description: "List all extensions in a workspace with their current versions.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
    },
  },
  async ({ workspaceId }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const result = await apiCall(`/api/workspaces/${wsId}/extensions`);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data || result.error, null, 2),
      }],
    };
  }
);

// ── runory.record.create ──
server.registerTool(
  "runory.record.create",
  {
    title: "Create Record",
    description: "Create a record in a workspace object (e.g., customer, contact).",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      objectKey: z.string().describe("The object key (e.g., 'customer', 'contact')"),
      data: z.string().describe("Record data as JSON string (e.g., {\"name\":\"Acme Corp\",\"email\":\"info@acme.com\"})"),
    },
  },
  async ({ workspaceId, objectKey, data }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(data);
    } catch {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "Invalid JSON" }),
        }],
      };
    }

    const result = await apiCall(`/api/workspaces/${wsId}/objects/${objectKey}/records`, "POST", parsedData);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data || result.error, null, 2),
      }],
    };
  }
);

// ── runory.record.list ──
server.registerTool(
  "runory.record.list",
  {
    title: "List Records",
    description: "List records in a workspace object, with optional pagination and search.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      objectKey: z.string().describe("The object key (e.g., 'customer', 'contact')"),
      limit: z.number().int().positive().optional().describe("Maximum number of records to return"),
      offset: z.number().int().nonnegative().optional().describe("Number of records to skip for pagination"),
      search: z.string().optional().describe("Search query to filter records"),
    },
  },
  async ({ workspaceId, objectKey, limit, offset, search }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    if (search !== undefined) params.set("search", search);
    const query = params.toString();
    const path = `/api/workspaces/${wsId}/objects/${objectKey}/records${query ? `?${query}` : ""}`;
    const result = await apiCall(path);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data ?? result, null, 2),
      }],
    };
  }
);

// ── runory.record.get ──
server.registerTool(
  "runory.record.get",
  {
    title: "Get Record",
    description: "Get a single record by ID from a workspace object.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      objectKey: z.string().describe("The object key (e.g., 'customer', 'contact')"),
      recordId: z.string().describe("The record ID"),
    },
  },
  async ({ workspaceId, objectKey, recordId }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const result = await apiCall(`/api/workspaces/${wsId}/objects/${objectKey}/records/${recordId}`);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data ?? result, null, 2),
      }],
    };
  }
);

// ── runory.record.update ──
server.registerTool(
  "runory.record.update",
  {
    title: "Update Record",
    description: "Update a record in a workspace object by ID.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      objectKey: z.string().describe("The object key (e.g., 'customer', 'contact')"),
      recordId: z.string().describe("The record ID"),
      data: z.string().describe("Record data as JSON string (e.g., {\"name\":\"Acme Corp\"})"),
    },
  },
  async ({ workspaceId, objectKey, recordId, data }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(data);
    } catch {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "Invalid JSON" }),
        }],
      };
    }

    const result = await apiCall(`/api/workspaces/${wsId}/objects/${objectKey}/records/${recordId}`, "PUT", parsedData);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data ?? result.error ?? result, null, 2),
      }],
    };
  }
);

// ── runory.record.delete ──
server.registerTool(
  "runory.record.delete",
  {
    title: "Delete Record",
    description: "Delete a record in a workspace object by ID.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      objectKey: z.string().describe("The object key (e.g., 'customer', 'contact')"),
      recordId: z.string().describe("The record ID"),
    },
  },
  async ({ workspaceId, objectKey, recordId }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const result = await apiCall(`/api/workspaces/${wsId}/objects/${objectKey}/records/${recordId}`, "DELETE");
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data ?? result.error ?? { deleted: true }, null, 2),
      }],
    };
  }
);

// ── runory.catalog.search ──
server.registerTool(
  "runory.catalog.search",
  {
    title: "Search Catalog",
    description: "Search the workspace catalog for installable modules, packs, or templates.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      query: z.string().optional().describe("Search query to filter catalog items"),
      type: z.enum(["module", "pack", "template"]).optional().describe("Filter by catalog item type"),
    },
  },
  async ({ workspaceId, query, type }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const params = new URLSearchParams();
    if (query !== undefined) params.set("query", query);
    if (type !== undefined) params.set("type", type);
    const qs = params.toString();
    const path = `/api/workspaces/${wsId}/catalog${qs ? `?${qs}` : ""}`;
    const result = await apiCall(path);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data ?? result, null, 2),
      }],
    };
  }
);

// ── runory.module.install ──
server.registerTool(
  "runory.module.install",
  {
    title: "Install Module Pack",
    description: "Install a pack into a workspace by pack ID.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      packId: z.string().describe("The pack ID to install"),
    },
  },
  async ({ workspaceId, packId }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const result = await apiCall(`/api/workspaces/${wsId}/packs/${packId}/install`, "POST");
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data ?? result.error ?? result, null, 2),
      }],
    };
  }
);

// ── runory.workspace.list ──
server.registerTool(
  "runory.workspace.list",
  {
    title: "List Workspaces",
    description: "List all workspaces accessible to the authenticated user.",
    inputSchema: {},
  },
  async () => {
    const result = await apiCall(`/api/workspaces`);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data ?? result, null, 2),
      }],
    };
  }
);

// ── runory.workspace.create ──
server.registerTool(
  "runory.workspace.create",
  {
    title: "Create Workspace",
    description: "Create a new workspace. If templateId is provided, the workspace is initialized from that template. organizationId is optional and defaults to the user's default organization.",
    inputSchema: {
      name: z.string().describe("The name of the new workspace"),
      templateId: z.string().optional().describe("Optional template ID to initialize the workspace from"),
      organizationId: z.string().optional().describe("Optional organization ID. If omitted, the API uses the user's default org."),
    },
  },
  async ({ name, templateId, organizationId }) => {
    const body: Record<string, unknown> = { name };
    if (templateId !== undefined) body.templateId = templateId;
    if (organizationId !== undefined) body.organizationId = organizationId;
    const result = await apiCall(`/api/workspaces`, "POST", body);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data ?? result.error ?? result, null, 2),
      }],
    };
  }
);

// ── runory.audit.list ──
server.registerTool(
  "runory.audit.list",
  {
    title: "List Audit Events",
    description: "List audit events in a workspace, with optional pagination and action filter.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      limit: z.number().int().positive().optional().describe("Maximum number of audit events to return"),
      offset: z.number().int().nonnegative().optional().describe("Number of events to skip for pagination"),
      action: z.string().optional().describe("Filter by audit action type"),
    },
  },
  async ({ workspaceId, limit, offset, action }) => {
    const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    if (action !== undefined) params.set("action", action);
    const qs = params.toString();
    const path = `/api/workspaces/${wsId}/audit${qs ? `?${qs}` : ""}`;
    const result = await apiCall(path);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data ?? result, null, 2),
      }],
    };
  }
);

// ── Start server ──
async function main() {
  if (API_KEY) {
    console.error(`[runory-mcp] Auth mode: API key (Bearer).${DEFAULT_WORKSPACE_ID ? ` Default workspace: ${DEFAULT_WORKSPACE_ID}.` : ""}`);
  } else {
    console.error(`[runory-mcp] Auth mode: dev (no Authorization header). Set RUNORY_API_KEY for production.`);
  }
  console.error(`[runory-mcp] Registered 17 tools.`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Runory MCP server error:", error);
  process.exit(1);
});
