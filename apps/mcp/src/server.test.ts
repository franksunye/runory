import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, TOOL_COUNT } from "./server";

// ── Expected v0.4.4 stable operation surface ──
//
// The 21 tools that constitute the stable MCP operation surface. Any change
// to this list is a breaking change and requires a version bump.
const EXPECTED_TOOLS = [
  // Workspace
  "workspace.list",
  "workspace.create",
  "workspace.inspect",
  // Pack
  "pack.list",
  "pack.install",
  // Object / View inspection
  "object.inspect",
  "view.inspect",
  // Governed extension pipeline
  "extension.plan",
  "extension.preview",
  "extension.apply",
  "extension.rollback",
  "extension.list",
  // Workflow / Automation
  "workflow.inspect",
  "automation.inspect",
  // Operation history / Audit
  "agent_operation.history",
  "audit.search",
  // Record CRUD
  "record.create",
  "record.list",
  "record.get",
  "record.update",
  "record.delete",
] as const;

async function connectClient(): Promise<Client> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "test-client", version: "0.0.0" },
    { capabilities: {} }
  );
  // Connect server and client in parallel — both transports are linked.
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe("Runory MCP Server — v0.4.4 stable operation surface", () => {
  it("registers exactly TOOL_COUNT tools", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(TOOL_COUNT);
    await client.close();
  });

  it("registers all expected tool names", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual([...EXPECTED_TOOLS].sort());
    await client.close();
  });

  it("does not use legacy runory.* preview naming", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name).not.toMatch(/^runory\./);
    }
    await client.close();
  });

  it("every tool has a title, description, and inputSchema", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe("object");
    }
    await client.close();
  });

  // ── Tool-specific schema checks ──

  it("workspace.inspect accepts optional workspaceId", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "workspace.inspect");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as {
      properties?: Record<string, unknown>;
    };
    expect(schema.properties).toHaveProperty("workspaceId");
    await client.close();
  });

  it("pack.install requires packId", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "pack.install");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties).toHaveProperty("packId");
    expect(schema.required).toContain("packId");
    await client.close();
  });

  it("extension.apply requires plan and createdBy", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "extension.apply");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties).toHaveProperty("plan");
    expect(schema.properties).toHaveProperty("createdBy");
    expect(schema.required).toContain("plan");
    expect(schema.required).toContain("createdBy");
    await client.close();
  });

  it("extension.rollback requires extensionId and rolledBy", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "extension.rollback");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties).toHaveProperty("extensionId");
    expect(schema.properties).toHaveProperty("rolledBy");
    expect(schema.required).toContain("extensionId");
    expect(schema.required).toContain("rolledBy");
    await client.close();
  });

  it("record.create requires objectKey and data", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "record.create");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties).toHaveProperty("objectKey");
    expect(schema.properties).toHaveProperty("data");
    expect(schema.required).toContain("objectKey");
    expect(schema.required).toContain("data");
    await client.close();
  });

  it("audit.search supports action, actorId, entityType filters", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "audit.search");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as {
      properties?: Record<string, unknown>;
    };
    expect(schema.properties).toHaveProperty("action");
    expect(schema.properties).toHaveProperty("actorId");
    expect(schema.properties).toHaveProperty("entityType");
    await client.close();
  });
});
