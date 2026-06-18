import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { getDb, genId, now, type DB } from "./db";
import {
  moduleManifestSchema,
  packManifestSchema,
  templateManifestSchema,
  type ModuleManifest,
  type PackManifest,
  type TemplateManifest,
} from "./manifest";

const PROJECT_ROOT = resolve(process.cwd(), "..", "..");
const MODULES_DIR = resolve(PROJECT_ROOT, "modules");
const PACKS_DIR = resolve(PROJECT_ROOT, "packs");
const TEMPLATES_DIR = resolve(PROJECT_ROOT, "templates");

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
  return readFileSync(fullPath, "utf-8");
}

// ── Pack Installer ──

export interface InstallResult {
  packId: string;
  modulesInstalled: string[];
  objectsCreated: string[];
  viewsCreated: string[];
  navigationItemsCreated: number;
}

export function installPack(workspaceId: string, packId: string): InstallResult {
  const db = getDb();
  const pack = loadPackManifest(packId);

  // Check if already installed
  const existing = db.prepare(
    `SELECT id FROM installations WHERE workspace_id = ? AND module_id = ?`
  );

  const modulesInstalled: string[] = [];
  const objectsCreated: string[] = [];
  const viewsCreated: string[] = [];
  let navigationItemsCreated = 0;

  const installOneModule = db.transaction((moduleId: string) => {
    // Parse version range from pack modules array (e.g., "runory.customer: ^1.0.0")
    const moduleRef = pack.modules.find((m) => m.startsWith(moduleId));
    if (!moduleRef) throw new Error(`Module ${moduleId} not found in pack ${packId}`);

    const manifest = loadModuleManifest(moduleId);

    // Check if already installed
    const already = existing.get(workspaceId, moduleId) as { id: string } | undefined;
    if (already) return; // idempotent

    // Run migration
    const migrationSql = loadModuleMigration(moduleId, manifest.migrations.install);
    db.exec(migrationSql);

    // Register installation
    db.prepare(`INSERT INTO installations (id, workspace_id, module_id, module_version, pack_id, status, installed_at)
      VALUES (?, ?, ?, ?, ?, 'installed', ?)`).run(
      genId("inst"), workspaceId, moduleId, manifest.version, packId, now()
    );

    // Insert object definitions
    for (const obj of manifest.objects) {
      db.prepare(`INSERT INTO object_definitions (id, workspace_id, object_key, label, module_id, ownership, created_at)
        VALUES (?, ?, ?, ?, ?, 'module_owned', ?)`).run(
        genId("obj"), workspaceId, obj.key, obj.label, moduleId, now()
      );
      objectsCreated.push(obj.key);

      // Insert field definitions
      for (const field of obj.fields) {
        db.prepare(`INSERT INTO field_definitions (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          genId("fld"), workspaceId, obj.key, field.key, field.label, field.type,
          field.ownership, field.required ? 1 : 0, field.default_value ?? null,
          field.validation ? JSON.stringify(field.validation) : null, moduleId, now()
        );
      }
    }

    // Insert view definitions
    for (const view of manifest.views) {
      db.prepare(`INSERT INTO view_definitions (id, workspace_id, object_key, view_key, view_type, label, config_json, module_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        genId("view"), workspaceId, view.object, view.key, view.type, view.label,
        JSON.stringify(view.config), moduleId, now()
      );
      viewsCreated.push(view.key);
    }

    // Insert navigation items
    if (manifest.ui?.navigation) {
      for (const nav of manifest.ui.navigation) {
        db.prepare(`INSERT INTO navigation_items (id, workspace_id, label, route, icon, sort_order, module_id, enabled)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(
          genId("nav"), workspaceId, nav.label, nav.route, nav.icon, nav.sortOrder, moduleId
        );
        navigationItemsCreated++;
      }
    }

    modulesInstalled.push(moduleId);
  });

  // Install modules in dependency order (simple: install customer before contact)
  const sortedModules = [...pack.modules].map((m) => m.split(":")[0]).sort((a, b) => {
    const manifestA = loadModuleManifest(a);
    if (manifestA.dependencies?.includes(b)) return 1;
    const manifestB = loadModuleManifest(b);
    if (manifestB.dependencies?.includes(a)) return -1;
    return 0;
  });

  for (const moduleId of sortedModules) {
    installOneModule(moduleId);
  }

  return { packId, modulesInstalled, objectsCreated, viewsCreated, navigationItemsCreated };
}
