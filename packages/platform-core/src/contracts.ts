import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  getTablePrefix,
  getBusinessTablePrefix,
  getTableNamespacePrefixes,
  renderSqlWithPrefix,
} from "./platform-config";
import { validateIdentifier } from "./db";

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
  [key: string]: string;
};

export function tablePrefix(): string {
  return getTablePrefix();
}

export function tableName(shortName: keyof typeof tablesManifest): string {
  const suffix = tablesManifest[shortName];
  if (!suffix) throw new Error(`Unknown table: ${shortName}`);
  return `${tablePrefix()}${suffix}`;
}

// ── Resolved Table Names ──

const PREFIXES = getTableNamespacePrefixes();

export const TABLES = {
  // Generic, reusable SaaS Core.
  workspaces: `${PREFIXES.saas}workspaces`,
  organizations: `${PREFIXES.saas}organizations`,
  users: `${PREFIXES.saas}users`,
  organizationMemberships: `${PREFIXES.saas}organization_memberships`,
  workspaceTenants: `${PREFIXES.saas}workspace_tenants`,
  workspaceMemberships: `${PREFIXES.saas}workspace_memberships`,
  auditLogs: `${PREFIXES.saas}audit_logs`,
  authIdentities: `${PREFIXES.saas}auth_identities`,
  authChallenges: `${PREFIXES.saas}auth_challenges`,
  sessions: `${PREFIXES.saas}sessions`,
  rateLimitBuckets: `${PREFIXES.saas}rate_limit_buckets`,
  organizationInvitations: `${PREFIXES.saas}organization_invitations`,
  invitationWorkspaceGrants: `${PREFIXES.saas}invitation_workspace_grants`,
  apiKeys: `${PREFIXES.saas}api_keys`,
  organizationEntitlements: `${PREFIXES.saas}organization_entitlements`,
  usageEvents: `${PREFIXES.saas}usage_events`,
  usageRollups: `${PREFIXES.saas}usage_rollups`,
  exportJobs: `${PREFIXES.saas}export_jobs`,
  deletionJobs: `${PREFIXES.saas}deletion_jobs`,

  // Runory Platform Runtime.
  installations: `${PREFIXES.runoryRuntime}installations`,
  objectDefinitions: `${PREFIXES.runoryRuntime}object_definitions`,
  fieldDefinitions: `${PREFIXES.runoryRuntime}field_definitions`,
  viewDefinitions: `${PREFIXES.runoryRuntime}view_definitions`,
  navigationItems: `${PREFIXES.runoryRuntime}navigation_items`,
  extensionDefinitions: `${PREFIXES.runoryRuntime}extension_definitions`,
  extensionVersions: `${PREFIXES.runoryRuntime}extension_versions`,
  extensionFieldValues: `${PREFIXES.runoryRuntime}extension_field_values`,
  agentRuns: `${PREFIXES.runoryRuntime}agent_runs`,

  // Runory Catalog & Release Control Plane.
  catalogItems: `${PREFIXES.runoryCatalog}items`,
  catalogVersions: `${PREFIXES.runoryCatalog}versions`,
  catalogValidationRuns: `${PREFIXES.runoryCatalog}validation_runs`,
  catalogReleases: `${PREFIXES.runoryCatalog}releases`,
  packVersionLocks: `${PREFIXES.runoryCatalog}pack_version_locks`,
  releaseRollouts: `${PREFIXES.runoryCatalog}release_rollouts`,
  rolloutTargets: `${PREFIXES.runoryCatalog}rollout_targets`,
  compatibilityReports: `${PREFIXES.runoryCatalog}compatibility_reports`,
} as const;

// ── Business Table Prefix ──
// Business tables (created by module migrations) use a prefix to distinguish
// Runory business data from SaaS Core platform metadata.
// Default: "runory_business_" (e.g., "runory_business_customer", "runory_business_contact")
// Full ownership rules: docs/architecture/database-namespaces.md.
export const BUSINESS_TABLE_PREFIX = getBusinessTablePrefix();

export function businessTable(objectKey: string): string {
  return `${BUSINESS_TABLE_PREFIX}${validateIdentifier(objectKey)}`;
}

// ── Schema Rendering (retained for tooling/tests; migrations are the primary path) ──

const SCHEMA_SQL = readFileSync(
  join(resourcesDir("schema"), "runory_schema.sql"),
  "utf-8"
);

export function renderSchemaSql(prefix: string): string {
  return renderSqlWithPrefix(SCHEMA_SQL, prefix, BUSINESS_TABLE_PREFIX);
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
