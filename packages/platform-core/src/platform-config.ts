// ── Centralized Platform Configuration ──
//
// All configurable identifiers (env vars, cookie names, DB filenames, globalThis keys,
// request headers, SQL placeholders) are defined here so the platform core has no
// hardcoded dependency on any specific brand name.
//
// Backward compatibility: every env var supports a legacy alias as fallback.

export interface PlatformConfig {
  // ── Legacy Bootstrap Table Prefix ──
  /** Prefix used only by migrations 0001-0010 and legacy database detection. */
  tablePrefixEnv: string;
  /** Legacy env var (fallback) */
  tablePrefixEnvLegacy: string;
  /** Default prefix when neither env var is set */
  defaultTablePrefix: string;

  // ── Database Namespace Prefixes ──
  systemTablePrefixEnv: string;
  defaultSystemTablePrefix: string;
  saasTablePrefixEnv: string;
  defaultSaasTablePrefix: string;
  runoryRuntimeTablePrefixEnv: string;
  defaultRunoryRuntimeTablePrefix: string;
  runoryCatalogTablePrefixEnv: string;
  defaultRunoryCatalogTablePrefix: string;

  // ── Business Table Prefix ──
  businessTablePrefixEnv: string;
  businessTablePrefixEnvLegacy: string;
  defaultBusinessTablePrefix: string;

  // ── Session Cookie ──
  sessionCookieEnv: string;
  defaultSessionCookie: string;

  // ── Database ──
  dbFilenameEnv: string;
  defaultDbFilename: string;

  // ── Deployment Mode ──
  deploymentModeEnv: string;
  defaultDeploymentMode: DeploymentMode;

  // ── Trust Identity Headers ──
  trustHeadersEnv: string;
  trustHeadersEnvLegacy: string;

  // ── Mail Provider ──
  mailProviderUrlEnv: string;
  mailProviderUrlEnvLegacy: string;

  // ── Platform Admin ──
  adminEmailsEnv: string;

  // ── Identity Headers (for trusted proxy mode) ──
  userIdHeader: string;
  userEmailHeader: string;
  userNameHeader: string;

  // ── SQL Placeholder ──
  /** Primary placeholder token for platform tables in migration SQL files */
  sqlPlaceholder: string;
  /** Legacy placeholder token (still supported for backward compat) */
  sqlPlaceholderLegacy: string;
  /** Placeholder token for business tables in migration SQL files */
  businessSqlPlaceholder: string;
  systemSqlPlaceholder: string;
  saasSqlPlaceholder: string;
  runoryRuntimeSqlPlaceholder: string;
  runoryCatalogSqlPlaceholder: string;

  // ── globalThis Keys ──
  dbGlobalKey: string;
  schemaReadyGlobalKey: string;
  migrationsRunGlobalKey: string;
}

export type DeploymentMode = "cloud" | "local";

export const PLATFORM_CONFIG: PlatformConfig = {
  tablePrefixEnv: "PLATFORM_TABLE_PREFIX",
  tablePrefixEnvLegacy: "RUNORY_TABLE_PREFIX",
  defaultTablePrefix: "platform_",

  systemTablePrefixEnv: "SYSTEM_TABLE_PREFIX",
  defaultSystemTablePrefix: "sys_",
  saasTablePrefixEnv: "SAAS_TABLE_PREFIX",
  defaultSaasTablePrefix: "saas_",
  runoryRuntimeTablePrefixEnv: "RUNORY_RUNTIME_TABLE_PREFIX",
  defaultRunoryRuntimeTablePrefix: "runory_runtime_",
  runoryCatalogTablePrefixEnv: "RUNORY_CATALOG_TABLE_PREFIX",
  defaultRunoryCatalogTablePrefix: "runory_catalog_",

  businessTablePrefixEnv: "BUSINESS_TABLE_PREFIX",
  businessTablePrefixEnvLegacy: "RUNORY_BUSINESS_TABLE_PREFIX",
  defaultBusinessTablePrefix: "runory_business_",

  sessionCookieEnv: "PLATFORM_SESSION_COOKIE",
  defaultSessionCookie: "platform_session",

  dbFilenameEnv: "PLATFORM_DB_FILENAME",
  defaultDbFilename: "platform.db",

  deploymentModeEnv: "PLATFORM_DEPLOYMENT_MODE",
  defaultDeploymentMode: "local",

  trustHeadersEnv: "PLATFORM_TRUST_IDENTITY_HEADERS",
  trustHeadersEnvLegacy: "RUNORY_TRUST_IDENTITY_HEADERS",

  mailProviderUrlEnv: "PLATFORM_MAIL_PROVIDER_URL",
  mailProviderUrlEnvLegacy: "RUNORY_MAIL_PROVIDER_URL",

  adminEmailsEnv: "PLATFORM_ADMIN_EMAILS",

  userIdHeader: "x-platform-user-id",
  userEmailHeader: "x-platform-user-email",
  userNameHeader: "x-platform-user-name",

  sqlPlaceholder: "{{PLATFORM_TABLE_PREFIX}}",
  sqlPlaceholderLegacy: "{{RUNORY_TABLE_PREFIX}}",
  businessSqlPlaceholder: "{{BUSINESS_TABLE_PREFIX}}",
  systemSqlPlaceholder: "{{SYSTEM_TABLE_PREFIX}}",
  saasSqlPlaceholder: "{{SAAS_TABLE_PREFIX}}",
  runoryRuntimeSqlPlaceholder: "{{RUNORY_RUNTIME_TABLE_PREFIX}}",
  runoryCatalogSqlPlaceholder: "{{RUNORY_CATALOG_TABLE_PREFIX}}",

  dbGlobalKey: "__platformDb",
  schemaReadyGlobalKey: "__platformSchemaReady",
  migrationsRunGlobalKey: "__platformMigrationsRun",
};

// ── Helper Functions ──

/** Read an env var with legacy fallback */
export function envWithLegacy(primary: string, legacy: string): string | undefined {
  return process.env[primary] ?? process.env[legacy];
}

/** Get the legacy prefix used to replay migrations 0001-0010. */
export function getTablePrefix(): string {
  return envWithLegacy(PLATFORM_CONFIG.tablePrefixEnv, PLATFORM_CONFIG.tablePrefixEnvLegacy)
    ?? PLATFORM_CONFIG.defaultTablePrefix;
}

export interface TableNamespacePrefixes {
  system: string;
  saas: string;
  runoryRuntime: string;
  runoryCatalog: string;
  runoryBusiness: string;
  legacyPlatform: string;
}

export function getTableNamespacePrefixes(): TableNamespacePrefixes {
  return {
    system: process.env[PLATFORM_CONFIG.systemTablePrefixEnv] ?? PLATFORM_CONFIG.defaultSystemTablePrefix,
    saas: process.env[PLATFORM_CONFIG.saasTablePrefixEnv] ?? PLATFORM_CONFIG.defaultSaasTablePrefix,
    runoryRuntime: process.env[PLATFORM_CONFIG.runoryRuntimeTablePrefixEnv]
      ?? PLATFORM_CONFIG.defaultRunoryRuntimeTablePrefix,
    runoryCatalog: process.env[PLATFORM_CONFIG.runoryCatalogTablePrefixEnv]
      ?? PLATFORM_CONFIG.defaultRunoryCatalogTablePrefix,
    runoryBusiness: getBusinessTablePrefix(),
    legacyPlatform: getTablePrefix(),
  };
}

/** Get the business table prefix */
export function getBusinessTablePrefix(): string {
  return envWithLegacy(PLATFORM_CONFIG.businessTablePrefixEnv, PLATFORM_CONFIG.businessTablePrefixEnvLegacy)
    ?? PLATFORM_CONFIG.defaultBusinessTablePrefix;
}

/** Get the session cookie name */
export function getSessionCookieName(): string {
  return process.env[PLATFORM_CONFIG.sessionCookieEnv] ?? PLATFORM_CONFIG.defaultSessionCookie;
}

/** Get the DB filename (for local SQLite mode) */
export function getDbFilename(): string {
  return process.env[PLATFORM_CONFIG.dbFilenameEnv] ?? PLATFORM_CONFIG.defaultDbFilename;
}

/** Get the deployment mode */
export function getDeploymentMode(): DeploymentMode {
  const mode = process.env[PLATFORM_CONFIG.deploymentModeEnv] ?? PLATFORM_CONFIG.defaultDeploymentMode;
  if (mode !== "cloud" && mode !== "local") {
    return PLATFORM_CONFIG.defaultDeploymentMode;
  }
  return mode;
}

/** Check if trust identity headers is enabled */
export function isTrustHeadersEnabled(): boolean {
  return envWithLegacy(PLATFORM_CONFIG.trustHeadersEnv, PLATFORM_CONFIG.trustHeadersEnvLegacy) === "true";
}

/** Get the mail provider URL */
export function getMailProviderUrl(): string | undefined {
  return envWithLegacy(PLATFORM_CONFIG.mailProviderUrlEnv, PLATFORM_CONFIG.mailProviderUrlEnvLegacy);
}

/** Get platform admin emails from env */
export function getPlatformAdminEmails(): string[] {
  const raw = process.env[PLATFORM_CONFIG.adminEmailsEnv];
  if (!raw) return [];
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Check if an email is a platform admin */
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return getPlatformAdminEmails().includes(email.toLowerCase());
}

/** Render SQL by replacing platform and business table prefix placeholders */
export function renderSqlWithPrefix(sql: string, platformPrefix: string, businessPrefix?: string): string {
  const namespaces = getTableNamespacePrefixes();
  let result = sql
    .replaceAll(PLATFORM_CONFIG.sqlPlaceholder, platformPrefix)
    .replaceAll(PLATFORM_CONFIG.sqlPlaceholderLegacy, platformPrefix)
    .replaceAll(PLATFORM_CONFIG.systemSqlPlaceholder, namespaces.system)
    .replaceAll(PLATFORM_CONFIG.saasSqlPlaceholder, namespaces.saas)
    .replaceAll(PLATFORM_CONFIG.runoryRuntimeSqlPlaceholder, namespaces.runoryRuntime)
    .replaceAll(PLATFORM_CONFIG.runoryCatalogSqlPlaceholder, namespaces.runoryCatalog);
  if (businessPrefix !== undefined) {
    result = result.replaceAll(PLATFORM_CONFIG.businessSqlPlaceholder, businessPrefix);
  }
  return result;
}
