import { expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv-provider.js";
import type { JsonSchemaType } from "@modelcontextprotocol/sdk/validation/types.js";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

it("initializes the actual stdio server and exposes usable Zod-generated tool schemas", async () => {
  // Discovery must not contact a Cloud API. Block fetch inside the child as
  // well as omitting all parent credentials from its environment.
  const noHttp = `globalThis.fetch = async () => {
    process.stderr.write("UNEXPECTED_HTTP_REQUEST\\n");
    throw new Error("Tool discovery must not make HTTP requests");
  };`;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--import", pathToFileURL(require.resolve("tsx")).href,
      "--import", `data:text/javascript,${encodeURIComponent(noHttp)}`,
      fileURLToPath(new URL("./server.ts", import.meta.url)),
    ],
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      NODE_ENV: "test",
      VITEST: "", // Exercise the real executable entry point, not createServer().
      RUNORY_API_BASE: "http://127.0.0.1:1",
      RUNORY_API_KEY: "",
      RUNORY_WORKSPACE_ID: "",
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  const client = new Client({ name: "runory-stdio-integration", version: "1.0.0" }, { capabilities: {} });
  let childPid: number | null = null;
  try {
    // Client.connect performs the MCP initialize / initialized exchange.
    await client.connect(transport, { timeout: 5_000 });
    childPid = transport.pid;
    expect(childPid).toBeGreaterThan(0);
    expect(client.getServerVersion()).toMatchObject({ name: "runory-cloud", version: "0.4.4" });
    expect(client.getServerCapabilities()?.tools).toBeDefined();

    const { tools } = await client.listTools({}, { timeout: 5_000 });
    expect(tools).toHaveLength(21);
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "workspace.list", "workspace.inspect", "pack.install", "extension.plan",
      "extension.preview", "extension.apply", "extension.rollback", "audit.search",
      "record.create", "record.list", "record.update", "record.delete",
    ]));

    const validator = new AjvJsonSchemaValidator();
    const schemas = new Map(tools.map((tool) => {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      return [tool.name, validator.getValidator(tool.inputSchema as JsonSchemaType)] as const;
    }));
    const accepts = (name: string, input: unknown) => schemas.get(name)!(input).valid;
    expect(accepts("workspace.list", {})).toBe(true);
    expect(accepts("workspace.list", [])).toBe(false);
    expect(accepts("pack.install", { packId: "crm-lite-pack", includeDemoData: false })).toBe(true);
    expect(accepts("pack.install", {})).toBe(false);
    expect(accepts("pack.install", { packId: "crm-lite-pack", includeDemoData: "false" })).toBe(false);
    expect(accepts("record.create", { objectKey: "contact", data: '{"name":"Synthetic"}' })).toBe(true);
    expect(accepts("record.create", { objectKey: "contact", data: { name: "Synthetic" } })).toBe(false);
    expect(accepts("record.list", { objectKey: "contact", limit: 1, offset: 0 })).toBe(true);
    expect(accepts("record.list", { objectKey: "contact", limit: 0 })).toBe(false);
    expect(accepts("record.list", { objectKey: "contact", offset: -1 })).toBe(false);
    expect(stderr).not.toContain("UNEXPECTED_HTTP_REQUEST");
  } catch (error) {
    throw new Error(`MCP stdio compatibility check failed. Child stderr:\n${stderr}`, { cause: error });
  } finally {
    childPid ??= transport.pid;
    try {
      await client.close();
    } finally {
      await transport.close();
    }
    expect(transport.pid).toBeNull();
    if (childPid !== null) {
      await expect.poll(() => processIsRunning(childPid!), { timeout: 2_000 }).toBe(false);
    }
  }
}, 15_000);
