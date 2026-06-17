import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ActorSource } from "@runory/shared";
import type { DatabaseContext } from "./database.js";
import { eventBus } from "./events.js";

export const createExpenseSchema = z.object({
  vendorName: z.string().min(1),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).default("USD"),
  category: z.string().min(1),
  description: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.95),
  source: z.enum(["codex", "ui", "system"]).default("codex")
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export class BusinessEngine {
  constructor(private readonly context: DatabaseContext) {}

  createExpense(rawInput: CreateExpenseInput) {
    const input = createExpenseSchema.parse(rawInput);

    if (input.confidence < 0.85) {
      throw Object.assign(new Error("V1 only accepts committed high-confidence expenses."), {
        code: "LOW_CONFIDENCE_REQUIRES_V2"
      });
    }

    const vendor = this.context.expenses.findOrCreateVendor(input.vendorName);
    const expense = this.context.expenses.create({
      vendorId: vendor.id,
      expenseDate: input.expenseDate,
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      description: input.description,
      status: "committed",
      confidence: input.confidence,
      source: input.source satisfies ActorSource
    });

    this.context.audit.record({
      source: input.source,
      action: "expense.create",
      entityType: "expense",
      entityId: expense.id,
      after: expense
    });

    const event = {
      eventId: `evt_${randomUUID()}`,
      type: "expense.created",
      entityType: "expense",
      entityId: expense.id,
      affectedQueries: ["expenses.list", "dashboard.summary", "dashboard.trend", "activity.recent"],
      timestamp: new Date().toISOString(),
      payload: {
        title: `Codex 录入费用 ${expense.vendorName}`,
        detail: `${expense.currency} ${expense.amount.toFixed(2)} · ${expense.category}`,
        expense
      }
    };

    this.context.events.record(event);
    eventBus.publish(event);

    return expense;
  }
}
