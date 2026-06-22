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
    description: "Submit an Extension Plan JSON for validation. The Personal Agent generates this plan; Runory validates it against module extension points. Returns { valid, errors }.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      plan: z.string().describe("Extension Plan JSON string. Schema: { name, description?, targetModules: string[], riskLevel: 'low'|'medium'|'high', customFields: [{ targetObject, fieldKey, label, type: 'text'|'email'|'phone'|'number'|'date'|'select'|'boolean', ownership: 'workspace_extension', required?, validation?, ui?: { listColumn?, slot?, order? } }] }"),
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
    description: "Preview the diff of an Extension Plan before applying. Returns added fields, affected views, and risk level.",
    inputSchema: {
      workspaceId: z.string().describe("The workspace ID"),
      plan: z.string().describe("Extension Plan JSON string (same format as runory.extension.plan)"),
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
    description: "Apply an Extension Plan to the workspace. Creates field definitions, updates view definitions, creates audit log and rollback point. Requires a validated plan.",
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
    description: "Rollback the latest version of an extension. Removes extension-created fields from definitions and views, creates audit log entry.",
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

// ── Start server ──
async function main() {
  if (API_KEY) {
    console.error(`[runory-mcp] Auth mode: API key (Bearer).${DEFAULT_WORKSPACE_ID ? ` Default workspace: ${DEFAULT_WORKSPACE_ID}.` : ""}`);
  } else {
    console.error(`[runory-mcp] Auth mode: dev (no Authorization header). Set RUNORY_API_KEY for production.`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Runory MCP server error:", error);
  process.exit(1);
});
