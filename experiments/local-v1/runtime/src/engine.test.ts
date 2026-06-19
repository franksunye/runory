import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabaseContext } from "./database.js";
import { BusinessEngine } from "./engine.js";

describe("BusinessEngine", () => {
  it("creates a committed expense through the engine", () => {
    const dir = mkdtempSync(join(tmpdir(), "runory-test-"));
    const context = createDatabaseContext(join(dir, "runory.db"));
    const engine = new BusinessEngine(context);

    const expense = engine.createExpense({
      vendorName: "Restaurant Depot",
      expenseDate: "2026-06-16",
      amount: 286.4,
      currency: "USD",
      category: "ingredients",
      description: "食材采购",
      confidence: 0.95,
      source: "codex"
    });

    expect(expense.status).toBe("committed");
    expect(context.expenses.list()).toHaveLength(1);
    expect(context.dashboard.getSummary().monthExpenseTotal).toBe(286.4);
  });

  it("rejects low-confidence expenses in V1", () => {
    const dir = mkdtempSync(join(tmpdir(), "runory-test-"));
    const context = createDatabaseContext(join(dir, "runory.db"));
    const engine = new BusinessEngine(context);

    expect(() =>
      engine.createExpense({
        vendorName: "Restaurant Depot",
        expenseDate: "2026-06-16",
        amount: 286.4,
        currency: "USD",
        category: "ingredients",
        description: "食材采购",
        confidence: 0.72,
        source: "codex"
      })
    ).toThrow("V1 only accepts committed high-confidence expenses.");
  });
});
