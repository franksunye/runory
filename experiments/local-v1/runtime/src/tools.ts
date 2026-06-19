import type { ToolEnvelope } from "@runory/shared";
import type { DatabaseContext } from "./database.js";
import { BusinessEngine } from "./engine.js";
import { parseExpenseText } from "./parseExpenseText.js";

export function workspaceStatus() {
  return {
    running: true,
    port: Number(process.env.RUNORY_PORT ?? 4310),
    workspaceInitialized: true,
    installedModules: ["expense-core"],
    url: `http://127.0.0.1:${Number(process.env.RUNORY_WEB_PORT ?? 5173)}/dashboard`
  };
}

export function createExpenseFromText(context: DatabaseContext, text: string) {
  const engine = new BusinessEngine(context);
  return engine.createExpense({ ...parseExpenseText(text), source: "codex" });
}

export function toToolEnvelope<T>(data: T): ToolEnvelope<T> {
  return {
    success: true,
    data
  };
}

export function toToolError(error: unknown): ToolEnvelope<never> {
  const err = error as { code?: string; message?: string };
  return {
    success: false,
    error: {
      code: err.code ?? "RUNORY_ERROR",
      message: err.message ?? "Runory runtime error"
    }
  };
}
