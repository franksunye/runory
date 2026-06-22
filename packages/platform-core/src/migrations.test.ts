import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  loadMigrationFiles,
  type MigrationFile,
} from "./migrations";
import { createHash } from "node:crypto";

describe("migration file loading", () => {
  it("loads migration files in version order", () => {
    const files = loadMigrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(2);

    // Versions should be in ascending order
    for (let i = 1; i < files.length; i++) {
      expect(files[i].version > files[i - 1].version).toBe(true);
    }
  });

  it("includes 0001_baseline and 0002_saas_core", () => {
    const files = loadMigrationFiles();
    const versions = files.map((f) => f.version);
    expect(versions).toContain("0001");
    expect(versions).toContain("0002");
  });

  it("computes stable SHA-256 checksums", () => {
    const files = loadMigrationFiles();
    for (const file of files) {
      // Checksum should be a 64-char hex string
      expect(file.checksum).toMatch(/^[a-f0-9]{64}$/);

      // Recompute and verify
      const expected = createHash("sha256").update(file.sql, "utf-8").digest("hex");
      expect(file.checksum).toBe(expected);
    }
  });

  it("checksums are deterministic across loads", () => {
    const first = loadMigrationFiles();
    const second = loadMigrationFiles();
    expect(first.length).toBe(second.length);
    for (let i = 0; i < first.length; i++) {
      expect(first[i].checksum).toBe(second[i].checksum);
    }
  });

  it("migration files contain prefix placeholder", () => {
    const files = loadMigrationFiles();
    for (const file of files) {
      expect(file.sql).toContain("{{RUNORY_TABLE_PREFIX}}");
    }
  });

  it("0002_saas_core migrates workspace owner to admin", () => {
    const files = loadMigrationFiles();
    const saasCore = files.find((f) => f.version === "0002");
    expect(saasCore).toBeDefined();
    expect(saasCore!.sql).toContain("UPDATE {{RUNORY_TABLE_PREFIX}}workspace_memberships SET role = 'admin' WHERE role = 'owner'");
  });

  it("0002_saas_core enforces workspace role constraint without owner", () => {
    const files = loadMigrationFiles();
    const saasCore = files.find((f) => f.version === "0002");
    expect(saasCore).toBeDefined();
    expect(saasCore!.sql).toContain("CHECK (role IN ('admin', 'member', 'viewer'))");
    expect(saasCore!.sql).not.toMatch(/workspace_memberships_new.*CHECK.*owner/);
  });

  it("0002_saas_core enforces organization role constraint", () => {
    const files = loadMigrationFiles();
    const saasCore = files.find((f) => f.version === "0002");
    expect(saasCore).toBeDefined();
    expect(saasCore!.sql).toContain("CHECK (role IN ('owner', 'admin', 'member'))");
  });

  it("0002_saas_core adds request_id to audit_logs", () => {
    const files = loadMigrationFiles();
    const saasCore = files.find((f) => f.version === "0002");
    expect(saasCore).toBeDefined();
    expect(saasCore!.sql).toContain("request_id");
  });
});
