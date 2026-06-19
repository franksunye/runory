import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

// ── Resource Directory Resolution ──
// Local dev reads schema/ and catalog/ from the repository root.
// Vercel reads the prebuild snapshot from apps/cloud/.resources/.

function resourcesDir(name: string): string {
  const candidates = [
    resolve(process.cwd(), ".resources", name),
    resolve(process.cwd(), name),
    resolve(process.cwd(), "..", "..", name),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(
    `Resource directory "${name}" not found (tried: ${candidates.join(", ")})`
  );
}

// ── Table Prefix ──

const tablesManifest = JSON.parse(
  readFileSync(join(resourcesDir("schema"), "tables.json"), "utf-8")
) as {
  prefixEnv: string;
  defaultPrefix: string;
  [key: string]: string;
};

export function tablePrefix(): string {
  return process.env[tablesManifest.prefixEnv] ?? tablesManifest.defaultPrefix;
}

export function tableName(shortName: keyof typeof tablesManifest): string {
  const suffix = tablesManifest[shortName];
  if (!suffix) throw new Error(`Unknown table: ${shortName}`);
  return `${tablePrefix()}${suffix}`;
}

// ── Resolved Table Names ──

const PREFIX = tablePrefix();

export const TABLES = {
  workspaces: `${PREFIX}workspaces`,
  installations: `${PREFIX}installations`,
  objectDefinitions: `${PREFIX}object_definitions`,
  fieldDefinitions: `${PREFIX}field_definitions`,
  viewDefinitions: `${PREFIX}view_definitions`,
  navigationItems: `${PREFIX}navigation_items`,
  extensionDefinitions: `${PREFIX}extension_definitions`,
  extensionVersions: `${PREFIX}extension_versions`,
  auditLogs: `${PREFIX}audit_logs`,
  agentRuns: `${PREFIX}agent_runs`,
  extensionFieldValues: `${PREFIX}extension_field_values`,
} as const;

// ── Business Table Prefix ──
// Business tables (created by module migrations) can optionally use a prefix.
// Default: no prefix (e.g., "customer", "contact")
export const BUSINESS_TABLE_PREFIX = process.env.RUNORY_BUSINESS_TABLE_PREFIX ?? "";

export function businessTable(objectKey: string): string {
  return `${BUSINESS_TABLE_PREFIX}${objectKey}`;
}

// ── Schema Rendering ──

const SCHEMA_SQL = readFileSync(
  join(resourcesDir("schema"), "runory_schema.sql"),
  "utf-8"
);

export function renderSchemaSql(prefix: string): string {
  return SCHEMA_SQL.replaceAll("{{RUNORY_TABLE_PREFIX}}", prefix);
}

export function schemaStatements(prefix: string): string[] {
  return renderSchemaSql(prefix)
    .split(";")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => line.trim() && !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((s) => s.length > 0)
    .map((s) => s + ";");
}

// ── Resource Paths (for installer.ts) ──

export const MODULES_DIR = resourcesDir("catalog/modules");
export const PACKS_DIR = resourcesDir("catalog/packs");
export const TEMPLATES_DIR = resourcesDir("catalog/templates");
