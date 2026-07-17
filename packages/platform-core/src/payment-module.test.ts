import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { moduleManifestSchema } from "@runory/contracts";

import { db, execute, genId, now, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { installModule, loadModuleManifest } from "./installer";
import { TABLES, businessTable } from "./contracts";
import { getNavigation, getObject } from "./metadata";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;

async function resetDatabase() {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;

  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DROP TABLE IF EXISTS "${name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createWorkspace() {
  const ts = now();
  workspaceId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, "Payment Test", `payment-${workspaceId}`, ts, ts],
  );
}

beforeEach(async () => {
  await resetDatabase();
  await createWorkspace();
});

describe("runory.payment module", () => {
  it("validates against the canonical module manifest schema", () => {
    const manifest = loadModuleManifest("runory.payment");
    const parsed = moduleManifestSchema.parse(manifest);

    expect(parsed.id).toBe("runory.payment");
    expect(parsed.objects.map((object) => object.key)).toEqual(
      expect.arrayContaining([
        "payment_request",
        "payment",
        "refund",
        "payment_provider_account",
        "payment_provider_reference",
      ]),
    );
    expect(parsed.permissions).toContain("payment.refund");
    expect(parsed.domain?.commands.map((command) => command.key)).toContain(
      "payment.confirm_provider_result",
    );
  });

  it("installs canonical objects, navigation, and provider-event uniqueness", async () => {
    await installModule(workspaceId, "runory.contact");
    await installModule(workspaceId, "runory.payment");

    expect(await getObject(workspaceId, "payment_request")).toBeDefined();
    expect(await getObject(workspaceId, "payment")).toBeDefined();
    expect(await getObject(workspaceId, "refund")).toBeDefined();

    const navigation = await getNavigation(workspaceId);
    expect(navigation.map((item) => item.route)).toContain("/payment-requests");

    const table = businessTable("payment_provider_reference");
    const ts = now();
    const values = [
      genId("ppr"),
      workspaceId,
      "stripe",
      "acct_test",
      "payment.succeeded",
      "payment_intent",
      "pi_1",
      "evt_1",
      "hash",
      "accepted",
      ts,
      ts,
    ];
    const sql = `INSERT INTO ${table}
      (id, workspace_id, provider, provider_account_id, event_type, provider_object_type,
       provider_object_id, provider_event_id, payload_hash, processed_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await execute(sql, values);
    await expect(execute(sql, [genId("ppr"), ...values.slice(1)])).rejects.toThrow();

    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table} WHERE provider_event_id = ?`,
      ["evt_1"],
    );
    expect(Number(row?.count)).toBe(1);
  });
});
