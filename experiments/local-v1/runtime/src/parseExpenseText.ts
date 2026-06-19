import { z } from "zod";

const parsedExpenseSchema = z.object({
  vendorName: z.string().min(1),
  expenseDate: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  category: z.string().default("uncategorized"),
  description: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.95)
});

export type ParsedExpenseText = z.infer<typeof parsedExpenseSchema>;

const fieldAliases: Record<string, keyof ParsedExpenseText> = {
  vendor: "vendorName",
  vendorname: "vendorName",
  supplier: "vendorName",
  date: "expenseDate",
  expensedate: "expenseDate",
  amount: "amount",
  currency: "currency",
  category: "category",
  description: "description",
  confidence: "confidence"
};

export function parseExpenseText(text: string): ParsedExpenseText {
  const fields: Record<string, unknown> = {};

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:：]+)\s*[:：]\s*(.+?)\s*$/);
    if (!match) continue;

    const rawKey = match[1].replace(/\s+/g, "").toLowerCase();
    const key = fieldAliases[rawKey];
    if (!key) continue;

    const value = match[2].trim();
    if (key === "amount" || key === "confidence") {
      fields[key] = Number(value.replace(/[¥$,]/g, ""));
    } else {
      fields[key] = value;
    }
  }

  return parsedExpenseSchema.parse(fields);
}
