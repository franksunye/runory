import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runMigrations,
  installPack,
  applyExtension,
  getRecords,
  createRecord,
  getFields,
  getObjects,
  loadModuleMigration,
  db,
} from "@runory/platform-core";
import {
  type ModuleManifest,
  type PackManifest,
  type ExtensionPlan,
} from "@runory/contracts";

export interface HarnessOptions {
  coreVersion?: string;
  module?: ModuleManifest;
  previous?: ModuleManifest;
  pack?: PackManifest;
  workspaceId?: string;
}

export interface HarnessResult {
  status: "compatible" | "incompatible" | "warning";
  issues: string[];
}

export class ModuleTestHarness {
  private tempDir: string;
  private workspaceId: string;
  private installed: boolean = false;
  private originalLibsqlUrl: string | undefined;

  constructor(private options: HarnessOptions) {
    this.tempDir = mkdtempSync(join(tmpdir(), "runory-test-"));
    this.workspaceId = options.workspaceId ?? `ws_test_${Date.now()}`;
  }

  async setup(): Promise<void> {
    // Capture original LIBSQL_URL so it can be restored in cleanup()
    this.originalLibsqlUrl = process.env.LIBSQL_URL;

    // Set LIBSQL_URL to temp database
    process.env.LIBSQL_URL = `file:${join(this.tempDir, "test.db")}`;

    // Run platform migrations
    await runMigrations();
  }

  async install(): Promise<void> {
    if (!this.options.pack) {
      throw new Error("Pack manifest is required for install");
    }

    await installPack(this.workspaceId, this.options.pack.id);
    this.installed = true;
  }

  async seed(fixturePath: string): Promise<void> {
    if (!this.installed) {
      throw new Error("Must call install() before seed()");
    }

    const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
    const objectKey = fixture.objectKey as string;
    const records = fixture.records as Record<string, unknown>[];

    for (const record of records) {
      await createRecord(this.workspaceId, objectKey, record);
    }
  }

  async applyExtension(fixturePath: string): Promise<void> {
    const plan = JSON.parse(readFileSync(fixturePath, "utf-8")) as ExtensionPlan;
    await applyExtension(this.workspaceId, plan, "test-harness");
  }

  async planUpgrade(): Promise<HarnessResult> {
    // Compatibility check: compare fields across ALL objects between current and previous
    if (!this.options.module || !this.options.previous) {
      return { status: "compatible", issues: [] };
    }

    const issues: string[] = [];
    const allObjects = this.options.module.objects ?? [];
    const previousObjects = this.options.previous.objects ?? [];

    for (const obj of allObjects) {
      const prevObj = previousObjects.find(o => o.key === obj.key);
      const currentFields = obj.fields ?? [];
      const previousFields = prevObj?.fields ?? [];

      // Check for removed fields (breaking change)
      const currentFieldKeys = new Set(currentFields.map(f => f.key));
      for (const prevField of previousFields) {
        if (!currentFieldKeys.has(prevField.key)) {
          issues.push(`Object "${obj.key}": field "${prevField.key}" was removed (breaking change)`);
        }
      }

      // Check for type changes (breaking change)
      const prevFieldMap = new Map(previousFields.map(f => [f.key, f]));
      for (const currField of currentFields) {
        const prevField = prevFieldMap.get(currField.key);
        if (prevField && prevField.type !== currField.type) {
          issues.push(`Object "${obj.key}": field "${currField.key}" type changed from "${prevField.type}" to "${currField.type}" (breaking change)`);
        }
      }
    }

    return {
      status: issues.length > 0 ? "incompatible" : "compatible",
      issues,
    };
  }

  async upgrade(): Promise<void> {
    if (!this.options.module?.migrations?.upgrade) {
      return;
    }

    const upgrades = this.options.module.migrations.upgrade;
    const moduleId = this.options.module.id;
    const moduleVersion = this.options.module.version;

    for (const step of upgrades) {
      let sql: string;
      try {
        sql = loadModuleMigration(moduleId, step.script);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("Migration not found")) throw err;
        // Versioned modules live under v{major}.{minor}/ subdirectory
        const [major, minor] = moduleVersion.split(".");
        sql = loadModuleMigration(moduleId, `v${major}.${minor}/${step.script}`);
      }

      try {
        await db.executeMultiple(sql);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("duplicate column name")) {
          return;
        }
        throw err;
      }
    }
  }

  async assertDataPreserved(objectKey: string, expectedCount?: number): Promise<boolean> {
    const records = await getRecords(this.workspaceId, objectKey);
    if (expectedCount !== undefined && records.length !== expectedCount) {
      return false;
    }
    return records.length > 0;
  }

  async assertObjectSchema(): Promise<boolean> {
    if (!this.options.module) return false;

    const objects = await getObjects(this.workspaceId);
    const expectedKey = this.options.module.objects?.[0]?.key;
    return objects.some(o => o.objectKey === expectedKey);
  }

  async assertPermissionBoundary(): Promise<boolean> {
    // Check that fields have correct ownership
    if (!this.options.module) return false;

    const objectKey = this.options.module.objects?.[0]?.key;
    if (!objectKey) return false;

    const fields = await getFields(this.workspaceId, objectKey);
    return fields.every(f => f.ownership === "module_owned" || f.ownership === "workspace_extension");
  }

  async cleanup(): Promise<void> {
    // Close the DB client and reset global caches
    const g = globalThis as Record<string, unknown>;
    const platformDb = g.__platformDb as { close(): Promise<void> } | undefined;
    if (platformDb) {
      try {
        await platformDb.close();
      } catch {
        // ignore close errors
      }
      g.__platformDb = undefined;
    }
    g.__platformSchemaReady = undefined;
    g.__platformMigrationsRun = undefined;

    // Restore original LIBSQL_URL
    if (this.originalLibsqlUrl !== undefined) {
      process.env.LIBSQL_URL = this.originalLibsqlUrl;
    } else {
      delete process.env.LIBSQL_URL;
    }

    // Remove temp directory
    rmSync(this.tempDir, { recursive: true, force: true });
  }
}

export async function createModuleTestHarness(options: HarnessOptions): Promise<ModuleTestHarness> {
  const harness = new ModuleTestHarness(options);
  await harness.setup();
  return harness;
}

export async function createFixtureWorkspace(): Promise<string> {
  const workspaceId = `ws_fixture_${Date.now()}`;
  return workspaceId;
}
