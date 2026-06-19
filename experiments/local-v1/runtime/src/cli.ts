import { createDatabaseContext } from "./database.js";
import { createServer } from "./server.js";
import { startMcpServer } from "./mcp.js";
import { createExpenseFromText, toToolEnvelope, workspaceStatus } from "./tools.js";

const [, , command, ...args] = process.argv;

async function main() {
  if (command === "start") {
    const port = Number(process.env.RUNORY_PORT ?? 4310);
    const app = createServer();
    await app.listen({ port, host: "127.0.0.1" });
    return;
  }

  if (command === "mcp") {
    await startMcpServer();
    return;
  }

  if (command === "expense:create") {
    const text = readTextArg(args);
    const context = createDatabaseContext();
    const expense = createExpenseFromText(context, text);
    console.log(JSON.stringify(toToolEnvelope(expense), null, 2));
    return;
  }

  if (command === "status") {
    console.log(JSON.stringify(toToolEnvelope(workspaceStatus()), null, 2));
    return;
  }

  console.log(`Runory CLI

Commands:
  runory start
  runory mcp
  runory expense:create --text "Vendor: ..."
  runory status
`);
}

function readTextArg(args: string[]) {
  const index = args.indexOf("--text");
  if (index === -1 || !args[index + 1]) {
    throw new Error("Missing --text argument");
  }
  return args[index + 1];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
