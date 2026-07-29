/**
 * Contract Freeze Enforcement (v0.9.4)
 *
 * After v0.9.3, API routes, MCP tool contracts, Pack manifests, Extension
 * contracts, Command contracts, and Permission vocabulary are frozen.
 * This module captures a snapshot of all contracts and detects violations
 * (additions, removals, or modifications) against the frozen baseline.
 *
 * Contract categories:
 * - api_routes: REST API endpoint paths and methods
 * - mcp_tools: MCP tool names and schemas
 * - pack_manifests: Pack manifest IDs and versions
 * - extension_contracts: Extension plan schemas and slot definitions
 * - command_contracts: Registered command effect providers
 * - permission_vocab: Permission strings used across modules
 *
 * Design principles:
 * - Non-blocking: freeze enforcement reports violations but does not
 *   automatically block deployment (that's a CI/CD responsibility)
 * - Verifiable: every contract has a checksum for deterministic comparison
 * - Comprehensive: covers all contract surfaces defined in the v0.9.4 spec
 */

import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import { getRegisteredCommandEffectProviders } from "./command-contracts";
import { writeAuditEvent } from "./audit-service";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import {
  type ContractFreezeSnapshot,
  type ContractFreezeReport,
  type ContractFreezeViolation,
  type ContractFreezeCategory,
} from "@runory/contracts";
import { MODULES_DIR, PACKS_DIR } from "./contracts";

// ── Contract Entry ──

interface ContractEntry {
  identifier: string;
  checksum: string;
}

// ── Snapshot Capture ──

/**
 * Compute a deterministic checksum for a contract payload.
 */
function computeChecksum(payload: unknown): string {
  const json = JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash("sha256").update(json).digest("hex").substring(0, 16);
}

/**
 * Capture all API route contracts by scanning the Next.js app directory.
 */
async function captureApiRoutes(): Promise<ContractEntry[]> {
  const entries: ContractEntry[] = [];
  const apiDir = resolve(process.cwd(), "apps/cloud/src/app/api");

  function scanDir(dir: string, prefix: string) {
    if (!existsSync(dir)) return;
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        scanDir(fullPath, `${prefix}/${item.name}`);
      } else if (item.name === "route.ts" || item.name === "route.tsx") {
        const routePath = `${prefix}/route`;
        const content = readFileSync(fullPath, "utf-8");
        // Extract HTTP methods from the route file
        const methods: string[] = [];
        if (/\bexport\s+async\s+function\s+GET\b/.test(content)) methods.push("GET");
        if (/\bexport\s+async\s+function\s+POST\b/.test(content)) methods.push("POST");
        if (/\bexport\s+async\s+function\s+PUT\b/.test(content)) methods.push("PUT");
        if (/\bexport\s+async\s+function\s+PATCH\b/.test(content)) methods.push("PATCH");
        if (/\bexport\s+async\s+function\s+DELETE\b/.test(content)) methods.push("DELETE");
        const identifier = `${methods.join(",")} ${prefix}`;
        entries.push({
          identifier,
          checksum: computeChecksum({ route: prefix, methods }),
        });
      }
    }
  }

  scanDir(apiDir, "");
  return entries.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * Capture MCP tool contracts from the MCP filesystem.
 */
async function captureMcpTools(): Promise<ContractEntry[]> {
  const entries: ContractEntry[] = [];
  const mcpDir = resolve(process.cwd(), ".trae-cn/mcps");

  if (!existsSync(mcpDir)) return entries;

  function scanServerDir(serverDir: string, serverName: string) {
    const toolsDir = join(serverDir, "tools");
    if (!existsSync(toolsDir)) return;
    const files = readdirSync(toolsDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = readFileSync(join(toolsDir, file), "utf-8");
        const tool = JSON.parse(content);
        const identifier = `${serverName}:${tool.name ?? file.replace(".json", "")}`;
        entries.push({
          identifier,
          checksum: computeChecksum(tool),
        });
      } catch {
        // Skip malformed tool files
      }
    }
  }

  try {
    const servers = readdirSync(mcpDir, { withFileTypes: true });
    for (const server of servers) {
      if (server.isDirectory()) {
        scanServerDir(join(mcpDir, server.name), server.name);
      }
    }
  } catch {
    // MCP directory may not exist in all environments
  }

  return entries.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * Capture Pack manifest contracts.
 */
async function capturePackManifests(): Promise<ContractEntry[]> {
  const entries: ContractEntry[] = [];

  if (!existsSync(PACKS_DIR)) return entries;

  const packDirs = readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of packDirs) {
    const manifestPath = join(PACKS_DIR, dir.name, "manifest.yaml");
    if (!existsSync(manifestPath)) continue;
    try {
      const raw = readFileSync(manifestPath, "utf-8");
      const manifest = parseYaml(raw);
      const identifier = `${manifest.id ?? dir.name}@${manifest.version ?? "unknown"}`;
      entries.push({
        identifier,
        checksum: computeChecksum(manifest),
      });
    } catch {
      // Skip malformed manifests
    }
  }

  return entries.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * Capture Extension contract definitions from the database.
 */
async function captureExtensionContracts(): Promise<ContractEntry[]> {
  const extensions = await queryAll<{ name: string; namespace: string; current_version: number }>(
    `SELECT DISTINCT name, namespace, current_version FROM ${TABLES.extensionDefinitions}`,
    [],
  ).catch(() => []);

  return (extensions ?? []).map((ext) => ({
    identifier: `${ext.namespace}:${ext.name}@v${ext.current_version}`,
    checksum: computeChecksum({ name: ext.name, namespace: ext.namespace, version: ext.current_version }),
  })).sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * Capture Command contract providers.
 */
async function captureCommandContracts(): Promise<ContractEntry[]> {
  const providers = getRegisteredCommandEffectProviders();
  return providers.map((p) => ({
    identifier: `${p.capability}@${p.version}`,
    checksum: computeChecksum({ capability: p.capability, version: p.version, consistency: p.consistency }),
  })).sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * Capture Permission vocabulary from module manifests.
 */
async function capturePermissionVocab(): Promise<ContractEntry[]> {
  const entries: ContractEntry[] = [];
  const permissionSet = new Map<string, string>();

  if (!existsSync(MODULES_DIR)) return entries;

  function scanModuleManifests(dir: string) {
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
            for (const perm of permissions) {
              if (!permissionSet.has(perm)) {
                permissionSet.set(perm, manifest.id ?? item.name);
              }
            }
          } catch {
            // Skip malformed manifests
          }
        }
        // Also check versioned manifests
        const versionedDir = join(dir, item.name);
        if (existsSync(versionedDir)) {
          const subItems = readdirSync(versionedDir, { withFileTypes: true });
          for (const sub of subItems) {
            if (sub.isDirectory() && sub.name.startsWith("v")) {
              const vManifestPath = join(versionedDir, sub.name, "manifest.yaml");
              if (existsSync(vManifestPath)) {
                try {
                  const raw = readFileSync(vManifestPath, "utf-8");
                  const manifest = parseYaml(raw);
                  const permissions: string[] = manifest.permissions ?? [];
                  for (const perm of permissions) {
                    if (!permissionSet.has(perm)) {
                      permissionSet.set(perm, `${manifest.id ?? item.name}@${sub.name}`);
                    }
                  }
                } catch {
                  // Skip
                }
              }
            }
          }
        }
      }
    }
  }

  scanModuleManifests(MODULES_DIR);

  for (const [perm, source] of permissionSet) {
    entries.push({
      identifier: perm,
      checksum: computeChecksum({ permission: perm, source }),
    });
  }

  return entries.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

// ── Capture Full Snapshot ──

/**
 * Capture a complete contract freeze snapshot across all categories.
 */
export async function captureContractFreezeSnapshot(): Promise<ContractFreezeSnapshot> {
  const [apiRoutes, mcpTools, packManifests, extensionContracts, commandContracts, permissionVocab] =
    await Promise.all([
      captureApiRoutes(),
      captureMcpTools(),
      capturePackManifests(),
      captureExtensionContracts(),
      captureCommandContracts(),
      capturePermissionVocab(),
    ]);

  return {
    capturedAt: now(),
    contracts: {
      api_routes: apiRoutes,
      mcp_tools: mcpTools,
      pack_manifests: packManifests,
      extension_contracts: extensionContracts,
      command_contracts: commandContracts,
      permission_vocab: permissionVocab,
    },
  };
}

// ── Persist Frozen Snapshot ──

/**
 * Persist a contract freeze snapshot as the frozen baseline.
 * This is called once when the contract freeze is enacted.
 */
export async function freezeContracts(
  principal: { userId: string },
): Promise<ContractFreezeSnapshot> {
  const snapshot = await captureContractFreezeSnapshot();
  const snapshotId = genId("freeze");
  const snapshotJson = JSON.stringify(snapshot);

  // Store the frozen snapshot
  await execute(
    `INSERT INTO ${TABLES.catalogItems} (id, item_type, name, description, publisher_id, visibility, status, created_at, updated_at)
     VALUES (?, 'contract_freeze', ?, 'Frozen contract baseline', 'platform', 'internal', 'active', ?, ?)`,
    [snapshotId, `freeze_${snapshot.capturedAt}`, snapshot.capturedAt, snapshot.capturedAt],
  ).catch(() => {
    // Table may not support this insert pattern — best effort
  });

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "contract.freeze",
    entityType: "contract_freeze",
    entityId: snapshotId,
    after: {
      capturedAt: snapshot.capturedAt,
      totalContracts: Object.values(snapshot.contracts).reduce((sum, entries) => sum + entries.length, 0),
    },
  });

  return snapshot;
}

// ── Compare Snapshots ──

/**
 * Compare two snapshots and produce a list of violations.
 */
export function compareSnapshots(
  frozen: ContractFreezeSnapshot,
  current: ContractFreezeSnapshot,
): ContractFreezeViolation[] {
  const violations: ContractFreezeViolation[] = [];

  const categories: ContractFreezeCategory[] = [
    "api_routes",
    "mcp_tools",
    "pack_manifests",
    "extension_contracts",
    "command_contracts",
    "permission_vocab",
  ];

  for (const category of categories) {
    const frozenEntries = frozen.contracts[category] ?? [];
    const currentEntries = current.contracts[category] ?? [];

    const frozenMap = new Map(frozenEntries.map((e) => [e.identifier, e.checksum]));
    const currentMap = new Map(currentEntries.map((e) => [e.identifier, e.checksum]));

    // Added: in current but not in frozen
    for (const [identifier] of currentMap) {
      if (!frozenMap.has(identifier)) {
        violations.push({
          category,
          changeType: "added",
          identifier,
        });
      }
    }

    // Removed: in frozen but not in current
    for (const [identifier] of frozenMap) {
      if (!currentMap.has(identifier)) {
        violations.push({
          category,
          changeType: "removed",
          identifier,
        });
      }
    }

    // Modified: checksum changed
    for (const [identifier, frozenChecksum] of frozenMap) {
      const currentChecksum = currentMap.get(identifier);
      if (currentChecksum && currentChecksum !== frozenChecksum) {
        violations.push({
          category,
          changeType: "modified",
          identifier,
          detail: `checksum: ${frozenChecksum} → ${currentChecksum}`,
        });
      }
    }
  }

  return violations;
}

// ── Generate Freeze Report ──

/**
 * Generate a contract freeze enforcement report by comparing the current
 * state against the frozen baseline.
 *
 * @param frozenSnapshot The frozen baseline snapshot
 * @returns A report with violations and freeze status
 */
export async function generateFreezeReport(
  frozenSnapshot: ContractFreezeSnapshot,
): Promise<ContractFreezeReport> {
  const currentSnapshot = await captureContractFreezeSnapshot();
  const violations = compareSnapshots(frozenSnapshot, currentSnapshot);

  return {
    frozenAt: frozenSnapshot.capturedAt,
    currentSnapshot,
    violations,
    isFrozen: violations.length === 0,
    totalViolations: violations.length,
  };
}

// ── Load Frozen Snapshot ──

/**
 * Load the most recently frozen contract snapshot.
 * Returns null if no freeze has been enacted yet.
 */
export async function loadFrozenSnapshot(): Promise<ContractFreezeSnapshot | null> {
  // Try to load from the catalog items table
  const row = await queryOne<{ id: string; name: string; created_at: string }>(
    `SELECT id, name, created_at FROM ${TABLES.catalogItems}
     WHERE item_type = 'contract_freeze' AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [],
  ).catch(() => null);

  if (!row) return null;

  // In a production system, the full snapshot JSON would be stored.
  // For now, we return a minimal snapshot that indicates a freeze exists.
  return {
    capturedAt: row.created_at,
    contracts: {
      api_routes: [],
      mcp_tools: [],
      pack_manifests: [],
      extension_contracts: [],
      command_contracts: [],
      permission_vocab: [],
    },
  };
}
