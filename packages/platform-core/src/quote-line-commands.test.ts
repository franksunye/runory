import { beforeEach, describe, expect, it } from "vitest";
import { db, execute, genId, now, queryAll, queryOne } from "./db";
import { TABLES, businessTable } from "./contracts";
import { runMigrations } from "./migrations";
import { installPack } from "./installer";
import {
  addQuoteLine,
  createQuoteDraft,
  removeQuoteLine,
  restoreQuoteLine,
  updateQuoteLine,
} from "./quote-commands";
import { prepareQuoteCalculation } from "./quote-calculation";
import { _clearSoftDeleteColumnCache } from "./metadata";

const actor = { type: "system" as const, id: "quote-line-test" };
let workspaceId: string;

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  _clearSoftDeleteColumnCache();
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${String(row.name)}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function setupWorkspace(): Promise<void> {
  workspaceId = genId("ws");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, 'Quote Line Commands', ?, ?, ?)`,
    [workspaceId, `quote-lines-${workspaceId}`, ts, ts],
  );
  await installPack(workspaceId, "sales-quote-pack");
}

async function createDraft(): Promise<{ id: string; version: number }> {
  const result = await createQuoteDraft(
    workspaceId,
    { title: "Atomic Quote Line Test", currency: "USD" },
    actor,
    genId("cmd"),
  );
  return { id: String(result.aggregate.id), version: result.newVersion };
}

describe("Quote Line atomic Commands", () => {
  beforeEach(async () => {
    await resetDatabase();
    await setupWorkspace();
  });

  it("derives totals and atomically closes add, update, soft-delete, and restore", async () => {
    const quote = await createDraft();

    const added = await addQuoteLine(workspaceId, quote.id, actor, quote.version, {
      description: "Repair labor",
      quantity: 2,
      unit_price: 100,
      discount_amount: 10,
      tax_amount: 5,
      line_total: 999_999,
      sort_order: 1,
    }, "quote-line-add");
    const lineId = added.aggregate.line!.id;
    expect(added.newVersion).toBe(2);
    expect(added.aggregate.line!.line_total).toBe(195);
    expect(added.aggregate.grand_total).toBe(195);

    const persistedAfterAdd = await queryOne<{ line_total: number }>(
      `SELECT line_total FROM ${businessTable("quote_line")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, lineId],
    );
    expect(persistedAfterAdd?.line_total).toBe(195);

    const replay = await addQuoteLine(workspaceId, quote.id, actor, quote.version, {
      description: "Repair labor",
      quantity: 2,
      unit_price: 100,
      discount_amount: 10,
      tax_amount: 5,
      line_total: 999_999,
      sort_order: 1,
    }, "quote-line-add");
    expect(replay.aggregate.line!.id).toBe(lineId);
    expect(await queryAll(
      `SELECT id FROM ${businessTable("quote_line")} WHERE workspace_id = ? AND quote_id = ?`,
      [workspaceId, quote.id],
    )).toHaveLength(1);

    const updated = await updateQuoteLine(workspaceId, quote.id, lineId, actor, 2, {
      quantity: 3,
      line_total: -1,
    }, "quote-line-update");
    expect(updated.newVersion).toBe(3);
    expect(updated.aggregate.line!.line_total).toBe(295);
    expect(updated.aggregate.grand_total).toBe(295);

    const removed = await removeQuoteLine(
      workspaceId, quote.id, lineId, actor, 3, {}, "quote-line-remove",
    );
    expect(removed.newVersion).toBe(4);
    expect(removed.aggregate.grand_total).toBe(0);
    expect(removed.aggregate.line?.deleted_at).not.toBeNull();
    expect(await prepareQuoteCalculation(workspaceId, quote.id)).toMatchObject({
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 0,
    });

    const restored = await restoreQuoteLine(
      workspaceId, quote.id, lineId, actor, 4, "quote-line-restore",
    );
    expect(restored.newVersion).toBe(5);
    expect(restored.aggregate.grand_total).toBe(295);
    expect(restored.aggregate.line?.deleted_at).toBeNull();

    const persistedQuote = await queryOne<{
      aggregate_version: number;
      subtotal: number;
      discount_total: number;
      tax_total: number;
      grand_total: number;
    }>(
      `SELECT aggregate_version, subtotal, discount_total, tax_total, grand_total
       FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, quote.id],
    );
    expect(persistedQuote).toEqual({
      aggregate_version: 5,
      subtotal: 300,
      discount_total: 10,
      tax_total: 5,
      grand_total: 295,
    });

    const events = await queryAll<{ event_type: string }>(
      `SELECT event_type FROM ${TABLES.domainEvents}
       WHERE workspace_id = ? AND aggregate_id = ? ORDER BY occurred_at ASC`,
      [workspaceId, quote.id],
    );
    expect(events.map((event) => event.event_type)).toEqual(expect.arrayContaining([
      "quote.line_added",
      "quote.line_updated",
      "quote.line_removed",
      "quote.line_restored",
    ]));
  });

  it("rejects stale versions and mutations after the Quote leaves draft", async () => {
    const quote = await createDraft();
    const added = await addQuoteLine(workspaceId, quote.id, actor, 1, {
      description: "Part",
      quantity: 1,
      unit_price: 50,
    });
    const lineId = added.aggregate.line!.id;

    await expect(updateQuoteLine(workspaceId, quote.id, lineId, actor, 1, {
      quantity: 2,
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    await execute(
      `UPDATE ${businessTable("quote")} SET status = 'in_review' WHERE workspace_id = ? AND id = ?`,
      [workspaceId, quote.id],
    );
    await expect(removeQuoteLine(workspaceId, quote.id, lineId, actor, 2)).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });

    const persisted = await queryOne<{ quantity: number; deleted_at: string | null }>(
      `SELECT quantity, deleted_at FROM ${businessTable("quote_line")}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, lineId],
    );
    expect(persisted).toEqual({ quantity: 1, deleted_at: null });
  });

  it("hard-deletes the line and its extension values in the same Command batch", async () => {
    const quote = await createDraft();
    const added = await addQuoteLine(workspaceId, quote.id, actor, 1, {
      description: "Disposable part",
      quantity: 1,
      unit_price: 25,
    });
    const lineId = added.aggregate.line!.id;
    const ts = now();
    await execute(
      `INSERT INTO ${TABLES.extensionFieldValues}
       (id, workspace_id, object_key, record_id, field_key, value_json, extension_id, created_at, updated_at)
       VALUES (?, ?, 'quote_line', ?, 'note', '"test"', 'ext_test', ?, ?)`,
      [genId("efv"), workspaceId, lineId, ts, ts],
    );

    await removeQuoteLine(workspaceId, quote.id, lineId, actor, 2, { hard: true });
    expect(await queryOne(
      `SELECT id FROM ${businessTable("quote_line")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, lineId],
    )).toBeUndefined();
    expect(await queryAll(
      `SELECT id FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND record_id = ?`,
      [workspaceId, lineId],
    )).toHaveLength(0);
  });
});
