import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import type { ToolEnvelope } from "@runory/shared";
import { createDatabaseContext } from "./database.js";
import { BusinessEngine, createExpenseSchema } from "./engine.js";
import { eventBus } from "./events.js";
import { createExpenseFromText, toToolEnvelope, toToolError, workspaceStatus } from "./tools.js";

const PORT = Number(process.env.RUNORY_PORT ?? 4310);

export function createServer() {
  const context = createDatabaseContext();
  const engine = new BusinessEngine(context);
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  app.register(cors, {
    origin: true
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "runory-runtime",
    port: PORT,
    timestamp: new Date().toISOString()
  }));

  app.get("/api/workspace", async () => ({
    name: "小饭馆财务工作区",
    slug: "restaurant-finance",
    runtime: "running",
    realtime: "connected",
    url: `http://127.0.0.1:${PORT}`
  }));

  app.get("/api/navigation", async () => context.navigation.list());
  app.get("/api/dashboard", async () => context.dashboard.getSummary());
  app.get("/api/expenses", async () => context.expenses.list(100));

  app.post("/api/expenses", async (request, reply) => {
    try {
      const expense = engine.createExpense(createExpenseSchema.parse(request.body));
      return toToolEnvelope(expense) satisfies ToolEnvelope<typeof expense>;
    } catch (error) {
      reply.code(400);
      return toToolError(error);
    }
  });

  app.post("/api/tools/runory.expense.create", async (request, reply) => {
    try {
      const body = z.object({ text: z.string().min(1) }).parse(request.body);
      const expense = createExpenseFromText(context, body.text);
      return toToolEnvelope(expense) satisfies ToolEnvelope<typeof expense>;
    } catch (error) {
      reply.code(400);
      return toToolError(error);
    }
  });

  app.get("/api/tools/runory.workspace.status", async () => toToolEnvelope(workspaceStatus()));

  app.get("/api/events/stream", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    const write = (event: unknown) => {
      reply.raw.write(`event: business-event\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    write({
      eventId: "evt_connected",
      type: "workspace.connected",
      entityType: "workspace",
      entityId: "restaurant-finance",
      affectedQueries: [],
      timestamp: new Date().toISOString()
    });

    eventBus.on("business-event", write);
    request.raw.on("close", () => eventBus.off("business-event", write));
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createServer();
  app.listen({ port: PORT, host: "127.0.0.1" }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
