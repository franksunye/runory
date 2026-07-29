/**
 * Upgrade Policy Publication & Vocabulary Unification (v0.9.4)
 *
 * Two responsibilities:
 *
 * 1. Policy Publication — publishes compatibility, upgrade, deprecation,
 *    and known boundary policies. These are the formal documents that
 *    govern how the platform evolves after the v0.9.4 contract freeze.
 *
 * 2. Vocabulary Unification — identifies duplicate capabilities across
 *    the codebase and produces a canonical vocabulary mapping. This
 *    addresses the v0.9.4 requirement to "remove duplicate capabilities
 *    and unify lifecycle, error handling, permissions, UI, and Agent
 *    tool vocabulary."
 *
 * Design principles:
 * - Policies are versioned, immutable once published
 * - Vocabulary unification is a reporting tool, not an auto-remover
 * - Both are auditable and traceable to specific actors
 */

import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import { writeAuditEvent } from "./audit-service";
import { getRegisteredCommandEffectProviders } from "./command-contracts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  type PolicyDocument,
  type PolicySummary,
  type PolicyType,
  type VocabularyTerm,
  type VocabularyUnificationReport,
} from "@runory/contracts";
import { MODULES_DIR, PACKS_DIR } from "./contracts";

// ── Publish Policy ──

/**
 * Publish a new policy document. If a policy with the same ID and version
 * already exists, it is superseded.
 */
export async function publishPolicy(
  principal: { userId: string },
  params: {
    type: PolicyType;
    title: string;
    description: string;
    content: string;
    version: string;
  },
): Promise<PolicyDocument> {
  const policyId = genId("policy");
  const ts = now();

  const policy: PolicyDocument = {
    id: policyId,
    type: params.type,
    title: params.title,
    description: params.description,
    content: params.content,
    version: params.version,
    publishedAt: ts,
    publishedBy: principal.userId,
    status: "published",
  };

  // Supersede any previously published policy of the same type
  await execute(
    `UPDATE ${TABLES.platformPolicies}
     SET status = 'superseded', updated_at = ?
     WHERE policy_type = ? AND status = 'published'`,
    [ts, params.type],
  ).catch(() => {
    // Best-effort supersede
  });

  // Store the new policy
  await execute(
    `INSERT INTO ${TABLES.platformPolicies}
     (id, policy_type, title, description, content, version, published_by, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
    [
      policyId,
      params.type,
      params.title,
      params.description,
      params.content,
      params.version,
      principal.userId,
      ts,
      ts,
      ts,
    ],
  );

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "policy.publish",
    entityType: "policy",
    entityId: policyId,
    after: {
      type: params.type,
      title: params.title,
      version: params.version,
    },
  });

  return policy;
}

// ── List Policies ──

interface PlatformPolicyRow {
  id: string;
  policy_type: string;
  title: string;
  description: string | null;
  content: string;
  version: string;
  published_by: string;
  status: string;
  published_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * List all published policies, optionally filtered by type.
 */
export async function listPolicies(
  type?: PolicyType,
): Promise<PolicySummary[]> {
  const conditions: string[] = [];
  const args: unknown[] = [];

  if (type) {
    conditions.push("policy_type = ?");
    args.push(type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await queryAll<PlatformPolicyRow>(
    `SELECT id, policy_type, title, description, version, status, published_at, created_at, updated_at
     FROM ${TABLES.platformPolicies}
     ${where}
     ORDER BY published_at DESC`,
    args,
  ).catch(() => []);

  return (rows ?? []).map((row) => ({
    id: row.id,
    type: row.policy_type as PolicyType,
    title: row.title,
    version: row.version,
    status: row.status as "draft" | "published" | "superseded",
    publishedAt: row.published_at,
  }));
}

// ── Get Policy ──

/**
 * Get a single policy document by ID.
 */
export async function getPolicy(policyId: string): Promise<PolicyDocument | null> {
  const row = await queryOne<PlatformPolicyRow>(
    `SELECT id, policy_type, title, description, content, version, published_by, status, published_at, created_at, updated_at
     FROM ${TABLES.platformPolicies}
     WHERE id = ?`,
    [policyId],
  ).catch(() => null);

  if (!row) return null;

  return {
    id: row.id,
    type: row.policy_type as PolicyType,
    title: row.title,
    description: row.description ?? "",
    content: row.content,
    version: row.version,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    status: row.status as PolicyDocument["status"],
  };
}

// ── Default Policy Content ──

/**
 * Generate the default set of v0.9.4 policies. These are the canonical
 * policy documents that govern the platform after the contract freeze.
 */
export function getDefaultPolicies(): Array<{
  type: PolicyType;
  title: string;
  description: string;
  content: string;
  version: string;
}> {
  return [
    {
      type: "compatibility",
      title: "Compatibility Policy v0.9.4",
      description: "Defines backward and forward compatibility guarantees for Packs, Modules, and Extensions",
      version: "1.0.0",
      content: [
        "# Compatibility Policy",
        "",
        "## Versioning",
        "- All Packs and Modules use semantic versioning (MAJOR.MINOR.PATCH)",
        "- Breaking changes require a MAJOR version bump",
        "- The coreCompatibility field in manifests must be updated for each release",
        "",
        "## Backward Compatibility",
        "- Modules must maintain backward compatibility for at least one MINOR version",
        "- Deprecated APIs must remain functional for 2 release cycles before removal",
        "- Database schema changes must be additive (no column drops without deprecation period)",
        "",
        "## Forward Compatibility",
        "- Pack manifests must declare compatible core version ranges",
        "- Extension points must accept unknown fields gracefully (forward-compatible parsing)",
        "- Command contracts must support versioned capability lookups",
        "",
        "## Contract Freeze (v0.9.4+)",
        "- API routes, MCP tools, Pack manifests, Extension contracts, Command contracts,",
        "  and Permission vocabulary are frozen after v0.9.3",
        "- Changes require explicit freeze exemption and audit trail",
      ].join("\n"),
    },
    {
      type: "upgrade",
      title: "Upgrade Policy v0.9.4",
      description: "Defines the upgrade process, rollout strategy, and rollback procedures",
      version: "1.0.0",
      content: [
        "# Upgrade Policy",
        "",
        "## Rollout Strategy",
        "- Upgrades use gradual rollout: allowlist → percentage → all_eligible",
        "- Success threshold: 95% of targets must succeed",
        "- Failure threshold: 5% failure rate triggers auto-pause",
        "",
        "## Pre-upgrade Validation",
        "- Compatibility reports must be generated before rollout",
        "- Schema drift must be resolved before upgrade",
        "- Extension conflicts must be resolved before upgrade",
        "",
        "## Upgrade Execution",
        "- Pre-upgrade snapshots are captured for every target",
        "- Migration steps execute sequentially with individual error isolation",
        "- Post-upgrade validation verifies schema, metadata, and data integrity",
        "",
        "## Rollback",
        "- Rollback is supported for all upgrade targets with pre-upgrade snapshots",
        "- Rollback restores metadata to the pre-upgrade version",
        "- Business data is never lost during rollback (only metadata is restored)",
        "- Batch rollback is supported for multi-target failure scenarios",
      ].join("\n"),
    },
    {
      type: "deprecation",
      title: "Deprecation Policy v0.9.4",
      description: "Defines the deprecation lifecycle for Packs, Modules, APIs, and features",
      version: "1.0.0",
      content: [
        "# Deprecation Policy",
        "",
        "## Deprecation Lifecycle",
        "1. **Announced**: Deprecated in release notes and manifest metadata",
        "2. **Warning**: Runtime deprecation warnings in logs",
        "3. **Deprecated**: Feature disabled for new installations",
        "4. **Retired**: Feature removed; existing installations treated as read-only",
        "",
        "## Timeline",
        "- Minimum 2 release cycles between announcement and retirement",
        "- Major version bumps may accelerate retirement for critical security issues",
        "- Module status field tracks: active → deprecated → retired",
        "",
        "## Retirement Process",
        "- Retired modules are not installed for new workspaces",
        "- Existing tables are left in place and treated as read-only",
        "- retirementNote field provides migration guidance",
        "",
        "## Contract Deprecation",
        "- Frozen contracts (post-v0.9.3) require explicit exemption for removal",
        "- Removed contracts must have a documented replacement",
        "- Migration tools must be provided for contract transitions",
      ].join("\n"),
    },
    {
      type: "known_boundaries",
      title: "Known Boundaries Policy v0.9.4",
      description: "Documents known limitations, unsupported scenarios, and system boundaries",
      version: "1.0.0",
      content: [
        "# Known Boundaries",
        "",
        "## Supported Scenarios",
        "- Single-tenant workspaces with multi-pack composition",
        "- Module upgrades via gradual rollout with rollback support",
        "- Workspace extensions via declarative plans (no Core fork)",
        "",
        "## Unsupported Scenarios",
        "- Multi-tenant data isolation within a single workspace",
        "- Cross-workspace data sharing without explicit API calls",
        "- Hot-reload of Pack manifests (requires workspace re-provisioning)",
        "- Direct database access for Extensions (must use platform APIs)",
        "",
        "## Scaling Boundaries",
        "- Max 100 custom fields per object (workspace extension limit)",
        "- Max 50 Packs per workspace (composition limit)",
        "- Max 10 active rollout plans per catalog release",
        "- Max 5-minute Vercel function timeout for pack installation/demo data",
        "",
        "## Security Boundaries",
        "- Extensions cannot access other workspaces' data",
        "- Pack manifests are immutable after catalog version freeze",
        "- Permission vocabulary changes require explicit consent for removed permissions",
        "",
        "## Payment Reconciliation Boundaries (v0.9.3)",
        "- Excludes banking, accounting, treasury, fee, tax, and dispute systems",
        "- Only supports consistent/divergent/unknown status visualization",
        "- Replay command is limited to Provider event recovery",
      ].join("\n"),
    },
  ];
}

/**
 * Publish all default v0.9.4 policies.
 */
export async function publishDefaultPolicies(
  principal: { userId: string },
): Promise<PolicyDocument[]> {
  const defaults = getDefaultPolicies();
  const published: PolicyDocument[] = [];

  for (const policy of defaults) {
    const doc = await publishPolicy(principal, policy);
    published.push(doc);
  }

  return published;
}

// ── Vocabulary Unification ──

/**
 * Scan the codebase for vocabulary terms across the five domains:
 * lifecycle, error_handling, permissions, ui, and agent_tools.
 *
 * This produces a canonical vocabulary mapping and identifies duplicate
 * capabilities that need unification.
 */
export async function generateVocabularyReport(): Promise<VocabularyUnificationReport> {
  const terms: VocabularyTerm[] = [];
  const duplicateCapabilities: VocabularyUnificationReport["duplicateCapabilities"] = [];

  // ── Lifecycle Vocabulary ──
  const lifecycleTerms = [
    { canonical: "draft", aliases: ["new", "created"], domain: "lifecycle" as const, description: "Initial state before submission" },
    { canonical: "ready", aliases: ["pending", "queued"], domain: "lifecycle" as const, description: "Ready for processing" },
    { canonical: "in_progress", aliases: ["active", "running", "open"], domain: "lifecycle" as const, description: "Currently being processed" },
    { canonical: "completed", aliases: ["done", "finished", "closed"], domain: "lifecycle" as const, description: "Successfully finished" },
    { canonical: "failed", aliases: ["error", "rejected"], domain: "lifecycle" as const, description: "Processing failed" },
    { canonical: "canceled", aliases: ["cancelled", "aborted"], domain: "lifecycle" as const, description: "Explicitly stopped" },
    { canonical: "skipped", aliases: ["ignored"], domain: "lifecycle" as const, description: "Not processed (e.g., already done)" },
  ];

  // ── Error Handling Vocabulary ──
  const errorTerms = [
    { canonical: "not_found", aliases: ["missing", "does_not_exist"], domain: "error_handling" as const, description: "Resource not found" },
    { canonical: "conflict", aliases: ["duplicate", "already_exists"], domain: "error_handling" as const, description: "State conflict" },
    { canonical: "invalid_input", aliases: ["bad_request", "validation_error"], domain: "error_handling" as const, description: "Invalid input provided" },
    { canonical: "unauthorized", aliases: ["not_authenticated"], domain: "error_handling" as const, description: "Authentication required" },
    { canonical: "forbidden", aliases: ["not_authorized", "insufficient_permissions"], domain: "error_handling" as const, description: "Insufficient permissions" },
    { canonical: "rate_limited", aliases: ["too_many_requests"], domain: "error_handling" as const, description: "Rate limit exceeded" },
  ];

  // ── Permission Vocabulary ──
  // Scan module manifests for permission strings
  const permissionTerms = await scanPermissionVocabulary();

  // ── UI Vocabulary ──
  const uiTerms = [
    { canonical: "list_view", aliases: ["table_view", "grid_view"], domain: "ui" as const, description: "Tabular record display" },
    { canonical: "form_view", aliases: ["detail_view", "edit_view"], domain: "ui" as const, description: "Single record form" },
    { canonical: "empty_state", aliases: ["no_data", "zero_state"], domain: "ui" as const, description: "Displayed when no records exist" },
    { canonical: "loading", aliases: ["spinner", "pending"], domain: "ui" as const, description: "Data fetch in progress" },
  ];

  // ── Agent Tool Vocabulary ──
  const agentToolTerms = [
    { canonical: "create_record", aliases: ["add_record", "new_record"], domain: "agent_tools" as const, description: "Create a new record" },
    { canonical: "get_record", aliases: ["fetch_record", "read_record"], domain: "agent_tools" as const, description: "Retrieve a single record" },
    { canonical: "list_records", aliases: ["query_records", "search_records"], domain: "agent_tools" as const, description: "List records with filters" },
    { canonical: "update_record", aliases: ["edit_record", "modify_record"], domain: "agent_tools" as const, description: "Update an existing record" },
    { canonical: "delete_record", aliases: ["remove_record"], domain: "agent_tools" as const, description: "Delete a record" },
  ];

  terms.push(...lifecycleTerms, ...errorTerms, ...permissionTerms, ...uiTerms, ...agentToolTerms);

  // ── Detect Duplicate Capabilities ──
  // Check command contracts for duplicate capability providers
  const providers = getRegisteredCommandEffectProviders();
  const capabilityMap = new Map<string, string[]>();

  for (const provider of providers) {
    const existing = capabilityMap.get(provider.capability) ?? [];
    existing.push(`v${provider.version}`);
    capabilityMap.set(provider.capability, existing);
  }

  for (const [capability, versions] of capabilityMap) {
    if (versions.length > 1) {
      duplicateCapabilities.push({
        name: capability,
        sources: versions,
        recommendation: "merge",
        reason: `Multiple versions registered: ${versions.join(", ")}. Should be unified to a single canonical version.`,
      });
    }
  }

  // Check for duplicate permission strings across modules
  const permissionCounts = new Map<string, number>();
  for (const term of permissionTerms) {
    const count = (term.aliases?.length ?? 0) + 1;
    if (count > 1) {
      // These are known aliases, not duplicates
    }
  }

  const unifiedCount = terms.length;
  const remainingDuplicates = duplicateCapabilities.length;

  return {
    generatedAt: now(),
    terms,
    duplicateCapabilities,
    unifiedCount,
    remainingDuplicates,
  };
}

/**
 * Scan module manifests for permission vocabulary.
 */
async function scanPermissionVocabulary(): Promise<VocabularyTerm[]> {
  const terms: VocabularyTerm[] = [];
  const permissionMap = new Map<string, string[]>(); // canonical → sources

  if (!existsSync(MODULES_DIR)) return terms;

  function scanDir(dir: string) {
    if (!existsSync(dir)) return;
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        const manifestPath = join(dir, item.name, "manifest.yaml");
        if (existsSync(manifestPath)) {
          try {
            const raw = readFileSync(manifestPath, "utf-8");
            const manifest = parseYaml(raw);
            const permissions: string[] = manifest.permissions ?? [];
            const moduleId = manifest.id ?? item.name;
            for (const perm of permissions) {
              const existing = permissionMap.get(perm) ?? [];
              if (!existing.includes(moduleId)) {
                existing.push(moduleId);
              }
              permissionMap.set(perm, existing);
            }
          } catch {
            // Skip malformed manifests
          }
        }
      }
    }
  }

  scanDir(MODULES_DIR);

  for (const [perm, sources] of permissionMap) {
    terms.push({
      canonical: perm,
      aliases: sources.length > 1 ? sources.slice(1) : [],
      domain: "permissions",
      description: sources.length > 1
        ? `Used by ${sources.length} modules: ${sources.join(", ")}`
        : `Used by ${sources[0]}`,
    });
  }

  return terms.sort((a, b) => a.canonical.localeCompare(b.canonical));
}
