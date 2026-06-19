import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ToolEnvelope } from "@runory/shared";

function asStructuredContent(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

const runtimeOrigin = `http://127.0.0.1:${Number(process.env.RUNORY_PORT ?? 4310)}`;

export function createRunoryMcpServer() {
  const server = new McpServer({
    name: "runory",
    version: "0.1.0"
  });

  server.registerTool(
    "runory.workspace.status",
    {
      title: "Runory Workspace Status",
      description: "Return local Runory runtime/workspace status for the V1 POC."
    },
    async () => {
      const envelope = await getRuntimeEnvelope("/api/tools/runory.workspace.status");
      return toMcpResult(envelope);
    }
  );

  server.registerTool(
    "runory.expense.create",
    {
      title: "Create Runory Expense",
      description:
        "Create a committed expense from semi-structured receipt-like text. V1 only accepts high-confidence records.",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .describe("Semi-structured expense text containing Vendor, Date, Amount, Currency, Category, Description, Confidence.")
      }
    },
    async ({ text }) => {
      const envelope = await postRuntimeEnvelope("/api/tools/runory.expense.create", { text });
      return toMcpResult(envelope);
    }
  );

  return server;
}

function toMcpResult(envelope: ToolEnvelope<unknown>) {
  return {
    structuredContent: asStructuredContent(envelope),
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(envelope, null, 2)
      }
    ]
  };
}

async function getRuntimeEnvelope(path: string): Promise<ToolEnvelope<unknown>> {
  try {
    const response = await fetch(`${runtimeOrigin}${path}`);
    return (await response.json()) as ToolEnvelope<unknown>;
  } catch (error) {
    return runtimeUnavailable(error);
  }
}

async function postRuntimeEnvelope(path: string, body: unknown): Promise<ToolEnvelope<unknown>> {
  try {
    const response = await fetch(`${runtimeOrigin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return (await response.json()) as ToolEnvelope<unknown>;
  } catch (error) {
    return runtimeUnavailable(error);
  }
}

function runtimeUnavailable(error: unknown): ToolEnvelope<never> {
  const message = error instanceof Error ? error.message : "Runory runtime is not reachable";
  return {
    success: false,
    error: {
      code: "RUNORY_RUNTIME_UNAVAILABLE",
      message: `Runory runtime is not reachable at ${runtimeOrigin}. Start it with pnpm runory start. ${message}`
    }
  };
}

export async function startMcpServer() {
  const server = createRunoryMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
