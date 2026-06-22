import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { queryOne, execute, genId, now, db } from "./db";
import { TABLES, MODULES_DIR, PACKS_DIR, TEMPLATES_DIR } from "./contracts";
import { getDeploymentMode, renderSqlWithPrefix, getBusinessTablePrefix, getTablePrefix } from "./platform-config";
import {
  moduleManifestSchema,
  packManifestSchema,
  templateManifestSchema,
  type ModuleManifest,
  type PackManifest,
  type TemplateManifest,
} from "@runory/contracts";

export function loadModuleManifest(moduleId: string): ModuleManifest {
  const manifestPath = resolve(MODULES_DIR, moduleId, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`Module manifest not found: ${manifestPath}`);
  }
  const raw = parseYaml(readFileSync(manifestPath, "utf-8"));
  return moduleManifestSchema.parse(raw);
}

export function loadPackManifest(packId: string): PackManifest {
  const manifestPath = resolve(PACKS_DIR, packId, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`Pack manifest not found: ${manifestPath}`);
  }
  const raw = parseYaml(readFileSync(manifestPath, "utf-8"));
  return packManifestSchema.parse(raw);
}

export function loadTemplateManifest(templateId: string): TemplateManifest {
  const manifestPath = resolve(TEMPLATES_DIR, templateId, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`Template manifest not found: ${manifestPath}`);
  }
  const raw = parseYaml(readFileSync(manifestPath, "utf-8"));
  return templateManifestSchema.parse(raw);
}

export function loadModuleMigration(moduleId: string, migrationPath: string): string {
  const fullPath = resolve(MODULES_DIR, moduleId, migrationPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Migration not found: ${fullPath}`);
  }
  const raw = readFileSync(fullPath, "utf-8");
  // Render business table prefix placeholders (e.g., {{BUSINESS_TABLE_PREFIX}}customer → business_customer)
  return renderSqlWithPrefix(raw, getTablePrefix(), getBusinessTablePrefix());
}

// ── Pack Installer ──

export interface InstallResult {
  packId: string;
  modulesInstalled: string[];
  objectsCreated: string[];
  viewsCreated: string[];
  navigationItemsCreated: number;
  ddlExecuted: boolean;
}

export async function installPack(workspaceId: string, packId: string): Promise<InstallResult> {
  const pack = loadPackManifest(packId);
  const deploymentMode = getDeploymentMode();

  const modulesInstalled: string[] = [];
  const objectsCreated: string[] = [];
  const viewsCreated: string[] = [];
  let navigationItemsCreated = 0;
  let ddlExecuted = false;

  const installOneModule = async (moduleId: string) => {
    // Parse version range from pack modules array (e.g., "runory.customer: ^1.0.0")
    const moduleRef = pack.modules.find((m) => m.startsWith(moduleId));
    if (!moduleRef) throw new Error(`Module ${moduleId} not found in pack ${packId}`);

    const manifest = loadModuleManifest(moduleId);

    // Check if already installed (idempotent — skip if present)
    const already = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.installations} WHERE workspace_id = ? AND module_id = ?`,
      [workspaceId, moduleId]
    );
    if (already) return;

    // Run migration (multi-statement DDL, e.g. CREATE TABLE)
    // In Cloud mode: business tables are pre-created at deploy time via platform migrations.
    //   Module install only registers metadata (object/field/view/nav definitions).
    // In Local mode: business tables are created per-workspace at install time.
    if (deploymentMode === "local") {
      const migrationSql = loadModuleMigration(moduleId, manifest.migrations.install);
      await db.executeMultiple(migrationSql);
      ddlExecuted = true;
    }

    // Register installation
    await execute(
      `INSERT INTO ${TABLES.installations} (id, workspace_id, module_id, module_version, pack_id, status, installed_at)
       VALUES (?, ?, ?, ?, ?, 'installed', ?)`,
      [genId("inst"), workspaceId, moduleId, manifest.version, packId, now()]
    );

    // Insert object definitions
    for (const obj of manifest.objects) {
      await execute(
        `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at)
         VALUES (?, ?, ?, ?, ?, 'module_owned', ?)`,
        [genId("obj"), workspaceId, obj.key, obj.label, moduleId, now()]
      );
      objectsCreated.push(obj.key);

      // Insert field definitions
      for (const field of obj.fields) {
        await execute(
          `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            genId("fld"), workspaceId, obj.key, field.key, field.label, field.type,
            field.ownership, field.required ? 1 : 0, field.default_value ?? null,
            field.validation ? JSON.stringify(field.validation) : null, moduleId, now(),
          ]
        );
      }
    }

    // Insert view definitions
    for (const view of manifest.views) {
      await execute(
        `INSERT INTO ${TABLES.viewDefinitions} (id, workspace_id, object_key, view_key, view_type, label, config_json, module_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          genId("view"), workspaceId, view.object, view.key, view.type, view.label,
          JSON.stringify(view.config), moduleId, now(),
        ]
      );
      viewsCreated.push(view.key);
    }

    // Insert navigation items
    if (manifest.ui?.navigation) {
      for (const nav of manifest.ui.navigation) {
        await execute(
          `INSERT INTO ${TABLES.navigationItems} (id, workspace_id, label, route, icon, sort_order, module_id, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [genId("nav"), workspaceId, nav.label, nav.route, nav.icon, nav.sortOrder, moduleId]
        );
        navigationItemsCreated++;
      }
    }

    modulesInstalled.push(moduleId);
  };

  // Install modules in dependency order (simple: install customer before contact)
  const sortedModules = [...pack.modules].map((m) => m.split(":")[0]).sort((a, b) => {
    const manifestA = loadModuleManifest(a);
    if (manifestA.dependencies?.includes(b)) return 1;
    const manifestB = loadModuleManifest(b);
    if (manifestB.dependencies?.includes(a)) return -1;
    return 0;
  });

  for (const moduleId of sortedModules) {
    await installOneModule(moduleId);
  }

  return { packId, modulesInstalled, objectsCreated, viewsCreated, navigationItemsCreated, ddlExecuted };
}
