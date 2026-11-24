import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, type Client, type TransactionMode } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabaseBackup, restoreDatabaseBackup, verifyDatabaseBackup } from "./database-backup";

const dirs: string[] = [];
const clients: Client[] = [];
function open(path: string) {
  const client = createClient({ url: `file:${path}`, intMode: "bigint" });
  clients.push(client);
  return client;
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "runory-backup-"));
  dirs.push(dir);
  return { dir, source: open(join(dir, "source.db")) };
}
afterEach(() => {
  clients.splice(0).forEach(client => client.close());
  dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
});

describe("database backup and recovery", () => {
  it("recovers complete data, BLOBs, integer precision, generated fields, FK links and trigger behavior after reopening", async () => {
    const { dir, source } = fixture();
    await source.executeMultiple(`
      CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT REFERENCES tenants(id), bytes BLOB, amount INTEGER, total INTEGER GENERATED ALWAYS AS (amount * 2) VIRTUAL);
      CREATE TABLE audit (evidence_id INTEGER);
      CREATE INDEX evidence_tenant ON evidence(tenant_id);
      CREATE TRIGGER evidence_created AFTER INSERT ON evidence BEGIN INSERT INTO audit VALUES (NEW.id); END;
      INSERT INTO tenants VALUES ('ws_a', 'Tenant A'), ('ws_b', 'Tenant B');
    `);
    await source.execute({ sql: "INSERT INTO evidence (id, tenant_id, bytes, amount) VALUES (?, ?, ?, ?)", args: [42, "ws_a", new Uint8Array([0, 255, 127]), 9007199254740993n] });
    await source.execute("INSERT INTO evidence (id, tenant_id, amount) VALUES (100, 'ws_b', 1)");
    await source.execute("DELETE FROM evidence WHERE id=100");
    const backup = JSON.parse(JSON.stringify(await createDatabaseBackup(source)));
    await source.execute("UPDATE tenants SET name='after snapshot' WHERE id='ws_a'");
    const targetPath = join(dir, "restored.db");
    const target = open(targetPath);
    await restoreDatabaseBackup(target, backup);
    target.close();
    const reopened = open(targetPath);
    expect((await verifyDatabaseBackup(reopened, backup)).tables).toBe(4);
    expect((await reopened.execute("SELECT name FROM tenants WHERE id='ws_a'")).rows[0].name).toBe("Tenant A");
    expect((await reopened.execute("SELECT COUNT(*) AS count FROM audit")).rows[0].count).toBe(2n);
    expect((await reopened.execute("SELECT amount FROM evidence")).rows[0].amount).toBe(9007199254740993n);
    expect((await reopened.execute("SELECT hex(bytes) AS bytes FROM evidence")).rows[0].bytes).toBe("00FF7F");
    expect((await reopened.execute("SELECT total FROM evidence")).rows[0].total).toBe(18014398509481986n);
    await reopened.execute("INSERT INTO evidence (tenant_id, amount) VALUES ('ws_b', 2)");
    expect((await reopened.execute("SELECT MAX(id) AS id FROM evidence")).rows[0].id).toBe(101n);
    expect((await reopened.execute("SELECT COUNT(*) AS count FROM audit")).rows[0].count).toBe(3n);
  });

  it("rejects a tampered archive before writing the target", async () => {
    const { dir, source } = fixture();
    await source.execute("CREATE TABLE records (id TEXT PRIMARY KEY)");
    const backup = await createDatabaseBackup(source);
    backup.tables[0].rows.push(["tampered"]);
    const target = open(join(dir, "target.db"));
    await expect(restoreDatabaseBackup(target, backup)).rejects.toThrow("checksum mismatch");
    expect((await target.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows).toHaveLength(0);
  });

  it("refuses to overwrite any existing target schema or certify an empty source", async () => {
    const { dir, source } = fixture();
    await expect(createDatabaseBackup(source)).rejects.toThrow("empty application database");
    await source.execute("CREATE TABLE records (id TEXT PRIMARY KEY)");
    const backup = await createDatabaseBackup(source);
    const target = open(join(dir, "target.db"));
    // `_cf_` is a literal provider prefix, not a SQL LIKE wildcard pattern.
    await target.execute("CREATE TABLE acftable (id TEXT)");
    await target.execute("INSERT INTO acftable VALUES ('keep')");
    await expect(restoreDatabaseBackup(target, backup)).rejects.toThrow("not empty");
    expect((await target.execute("SELECT id FROM acftable")).rows[0].id).toBe("keep");
  });

  it("preserves SQLite storage types for integral REALs, large REALs and exact INTEGERs", async () => {
    const { dir, source } = fixture();
    // No affinity: restoration cannot rely on a column declaration to fix a
    // value that was incorrectly serialized as a different SQLite type.
    await source.execute("CREATE TABLE numbers (id TEXT PRIMARY KEY, value)");
    await source.execute("CREATE TABLE acftable (id TEXT PRIMARY KEY)");
    await source.execute("INSERT INTO acftable VALUES ('not_provider_metadata')");
    await source.execute("INSERT INTO numbers VALUES ('real_one', 1.0), ('integer_one', 1), ('large_real', 1e25)");
    await source.execute({ sql: "INSERT INTO numbers VALUES ('large_integer', ?)", args: [9007199254740993n] });
    const backup = JSON.parse(JSON.stringify(await createDatabaseBackup(source)));
    expect(backup.tables.some((table: { name: string }) => table.name === "acftable")).toBe(true);
    const target = open(join(dir, "numeric-target.db"));
    await restoreDatabaseBackup(target, backup);
    const query = "SELECT id, value, typeof(value) AS storage_type FROM numbers ORDER BY id";
    expect((await target.execute(query)).rows).toEqual((await source.execute(query)).rows);
    await verifyDatabaseBackup(target, backup);
  });

  it("rolls back all created schema and rows if recovery fails partway through", async () => {
    const { dir, source } = fixture();
    await source.execute("CREATE TABLE records (id TEXT PRIMARY KEY)");
    await source.execute("INSERT INTO records VALUES ('first'), ('second')");
    const backup = await createDatabaseBackup(source);
    const target = open(join(dir, "failure-target.db"));
    const begin = target.transaction.bind(target);
    vi.spyOn(target, "transaction").mockImplementation(async (mode?: TransactionMode) => {
      const tx = await begin(mode);
      const execute = tx.execute.bind(tx);
      let inserts = 0;
      tx.execute = async (statement) => {
        const sql = typeof statement === "string" ? statement : statement.sql;
        if (sql.startsWith("INSERT INTO") && ++inserts === 2) throw new Error("simulated target write failure");
        return execute(statement);
      };
      return tx;
    });
    await expect(restoreDatabaseBackup(target, backup)).rejects.toThrow("simulated target write failure");
    expect((await target.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows).toHaveLength(0);
    expect((await source.execute("SELECT COUNT(*) AS count FROM records")).rows[0].count).toBe(2n);
  });
});
