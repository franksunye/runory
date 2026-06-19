import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const text = `Vendor: Central Market
Date: 2026-06-17
Amount: 42.80
Currency: USD
Category: ingredients
Description: 香料补货
Confidence: 0.95`;

async function main() {
  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--filter", "@runory/runtime", "runory", "mcp"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUNORY_HOME: process.env.RUNORY_HOME ?? `${process.cwd()}/.runory-mcp-smoke`
    } as Record<string, string>,
    stderr: "pipe"
  });

  const client = new Client({
    name: "runory-mcp-smoke",
    version: "0.1.0"
  });

  await client.connect(transport);
  const tools = await client.listTools();
  const status = await client.callTool({ name: "runory.workspace.status", arguments: {} });
  const created = await client.callTool({ name: "runory.expense.create", arguments: { text } });
  await transport.close();

  console.log(
    JSON.stringify(
      {
        tools: tools.tools.map((tool) => tool.name),
        status,
        created
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
