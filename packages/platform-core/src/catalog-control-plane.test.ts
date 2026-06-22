// Catalog & Release Control Plane — comprehensive integration tests (docs/09)
//
// Covers: Registry, Validation, Release Promotion, Pack Lock, Compatibility,
// Rollout, Deprecation/Withdrawal, and negative authorization/conflict cases.

process.env.PLATFORM_ADMIN_EMAILS = "admin@test.local";

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, execute } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import { type Principal, AuthorizationError, ConflictError } from "./context";
import { loadModuleManifest } from "./installer";
import {
  importFromDevCatalog,
  importCatalogCandidate,
  freezeCatalogVersion,
  rejectCatalogVersion,
  getCatalogVersion,
  getCatalogItemByName,
} from "./catalog-registry";
import { runCatalogValidation } from "./catalog-validation";
import {
  promoteCatalogRelease,
  deprecateCatalogVersion,
  withdrawCatalogVersion,
  resolvePackLock,
  getPackLock,
  getActiveRelease,
  getRelease,
} from "./catalog-release";
import { generateCompatibilityReport } from "./catalog-compatibility";
import {
  createReleaseRollout,
  getRolloutProgress,
  pauseReleaseRollout,
  resumeReleaseRollout,
  cancelReleaseRollout,
  listRolloutTargets,
} from "./catalog-rollout";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Test Principals ──

const adminPrincipal: Principal = {
  userId: "usr_test_admin",
  email: "admin@test.local",
  displayName: "Test Admin",
  authMethod: "session",
};

const nonAdminPrincipal: Principal = {
  userId: "usr_test_user",
  email: "user@test.local",
  displayName: "Test User",
  authMethod: "session",
};

// ── Schema Setup ──

beforeAll(async () => {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;

  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DROP TABLE IF EXISTS "${name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
});

// ── Per-test State Reset ──

beforeEach(async () => {
  // Delete child tables first to satisfy FK constraints
  const tables = [
    TABLES.rolloutTargets,
    TABLES.releaseRollouts,
    TABLES.packVersionLocks,
    TABLES.compatibilityReports,
    TABLES.catalogReleases,
    TABLES.catalogValidationRuns,
    TABLES.catalogVersions,
    TABLES.catalogItems,
  ];
  for (const t of tables) {
    try {
      await execute(`DELETE FROM ${t}`);
    } catch {
      // Table may not exist yet in first run
    }
  }
});

// ── Helpers ──

/** Import + freeze the customer module, returning the version ID. */
async function importAndFreezeCustomer(): Promise<{
  catalogItemId: string;
  catalogVersionId: string;
}> {
  const result = await importFromDevCatalog(
    adminPrincipal,
    "runory.customer",
    "module"
  );
  await freezeCatalogVersion(adminPrincipal, result.catalogVersionId);
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 1. Catalog Registry (importFromDevCatalog, freeze, reject)
// ═══════════════════════════════════════════════════════════════════

describe("Catalog Registry", () => {
  it("imports a module from dev catalog as draft", async () => {
    const { catalogItemId, catalogVersionId } = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );

    expect(catalogItemId).toBeDefined();
    expect(catalogVersionId).toBeDefined();

    const version = await getCatalogVersion(catalogVersionId);
    expect(version.lifecycleStatus).toBe("draft");
    expect(version.version).toBe("1.0.0");

    const item = await getCatalogItemByName("runory.customer", "module");
    expect(item.id).toBe(catalogItemId);
    expect(item.itemType).toBe("module");
    expect(item.status).toBe("active");
  });

  it("updates the existing draft when importing the same version again", async () => {
    const first = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );
    const second = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );

    // Same catalog item and version row (draft is overwritten, not duplicated)
    expect(second.catalogItemId).toBe(first.catalogItemId);
    expect(second.catalogVersionId).toBe(first.catalogVersionId);

    const version = await getCatalogVersion(second.catalogVersionId);
    expect(version.lifecycleStatus).toBe("draft");
  });

  it("freezes a draft version to ready", async () => {
    const { catalogVersionId } = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );

    const frozen = await freezeCatalogVersion(adminPrincipal, catalogVersionId);
    expect(frozen.lifecycleStatus).toBe("ready");
    expect(frozen.frozenAt).not.toBeNull();
  });

  it("throws ConflictError when freezing an already-ready version", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    await expect(
      freezeCatalogVersion(adminPrincipal, catalogVersionId)
    ).rejects.toThrow(ConflictError);
  });

  it("creates a new draft version when importing a new version of a frozen item", async () => {
    // Import and freeze v1.0.0
    const v1 = await importAndFreezeCustomer();

    // Build a v1.1.0 manifest based on the customer manifest
    const baseManifest = loadModuleManifest("runory.customer");
    const v11Manifest = JSON.parse(JSON.stringify(baseManifest)) as Record<
      string,
      unknown
    > & { version: string };
    v11Manifest.version = "1.1.0";

    const v11 = await importCatalogCandidate(adminPrincipal, {
      itemType: "module",
      itemId: "runory.customer",
      version: "1.1.0",
      manifest: v11Manifest,
    });

    // Same catalog item, new version row
    expect(v11.catalogItemId).toBe(v1.catalogItemId);
    expect(v11.catalogVersionId).not.toBe(v1.catalogVersionId);

    const v11Version = await getCatalogVersion(v11.catalogVersionId);
    expect(v11Version.lifecycleStatus).toBe("draft");
    expect(v11Version.version).toBe("1.1.0");

    // v1.0.0 remains ready
    const v1Version = await getCatalogVersion(v1.catalogVersionId);
    expect(v1Version.lifecycleStatus).toBe("ready");
  });

  it("rejects a draft version", async () => {
    const { catalogVersionId } = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );

    const rejected = await rejectCatalogVersion(
      adminPrincipal,
      catalogVersionId,
      "Test rejection"
    );
    expect(rejected.lifecycleStatus).toBe("rejected");
  });

  it("throws ConflictError when freezing a rejected version", async () => {
    const { catalogVersionId } = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );
    await rejectCatalogVersion(adminPrincipal, catalogVersionId, "Rejected");

    await expect(
      freezeCatalogVersion(adminPrincipal, catalogVersionId)
    ).rejects.toThrow(ConflictError);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Validation Pipeline
// ═══════════════════════════════════════════════════════════════════

describe("Validation Pipeline", () => {
  it("runs validation on a draft version and passes all checks", async () => {
    const { catalogVersionId } = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );

    const { validationRunId, result } = await runCatalogValidation(
      adminPrincipal,
      catalogVersionId
    );

    expect(validationRunId).toBeDefined();
    expect(result.status).toBe("passed");
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.checks.every((c) => c.status !== "failed")).toBe(true);

    // After successful validation, version returns to draft (freeze is separate)
    const version = await getCatalogVersion(catalogVersionId);
    expect(version.lifecycleStatus).toBe("draft");
  });

  it("throws ConflictError when validating a ready version", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    await expect(
      runCatalogValidation(adminPrincipal, catalogVersionId)
    ).rejects.toThrow(ConflictError);
  });

  it("validates a pack successfully", async () => {
    const { catalogVersionId } = await importFromDevCatalog(
      adminPrincipal,
      "crm-lite-pack",
      "pack"
    );

    const { result } = await runCatalogValidation(
      adminPrincipal,
      catalogVersionId
    );

    expect(result.status).toBe("passed");
    // Pack validation includes: artifact_checksum, manifest_schema, semver,
    // core_compatibility, pack_dependency_resolution
    const checkNames = result.checks.map((c) => c.name);
    expect(checkNames).toContain("pack_dependency_resolution");
    expect(result.checks.every((c) => c.status !== "failed")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Release Promotion (internal → beta → stable)
// ═══════════════════════════════════════════════════════════════════

describe("Release Promotion", () => {
  it("promotes a ready version to internal channel", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    const release = await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "internal",
      releaseNotes: "Initial internal release",
    });

    expect(release.channel).toBe("internal");
    expect(release.status).toBe("active");
    expect(release.releaseNotes).toBe("Initial internal release");
    expect(release.approvedBy).toBe(adminPrincipal.userId);
  });

  it("throws ConflictError when promoting to beta without an internal release", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    await expect(
      promoteCatalogRelease(adminPrincipal, {
        catalogVersionId,
        channel: "beta",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("promotes to internal then beta successfully", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "internal",
    });

    const betaRelease = await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "beta",
    });

    expect(betaRelease.channel).toBe("beta");
    expect(betaRelease.status).toBe("active");

    // Internal release should still be active
    const internalRelease = await getActiveRelease(catalogVersionId, "internal");
    expect(internalRelease).not.toBeNull();
    expect(internalRelease!.status).toBe("active");
  });

  it("throws ConflictError when promoting to stable without a beta release", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    // Promote to internal only (no beta)
    await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "internal",
    });

    await expect(
      promoteCatalogRelease(adminPrincipal, {
        catalogVersionId,
        channel: "stable",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("promotes to beta then stable successfully", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "internal",
    });
    await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "beta",
    });

    const stableRelease = await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "stable",
    });

    expect(stableRelease.channel).toBe("stable");
    expect(stableRelease.status).toBe("active");
  });

  it("throws ConflictError when promoting the same version to the same channel again", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "internal",
    });

    // Promoting the same version to internal again should conflict
    await expect(
      promoteCatalogRelease(adminPrincipal, {
        catalogVersionId,
        channel: "internal",
      })
    ).rejects.toThrow(ConflictError);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Pack Lock Resolution
// ═══════════════════════════════════════════════════════════════════

describe("Pack Lock Resolution", () => {
  it("resolves pack lock entries for all module dependencies", async () => {
    // Import and freeze both modules referenced by crm-lite-pack
    const customer = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );
    await freezeCatalogVersion(adminPrincipal, customer.catalogVersionId);

    const contact = await importFromDevCatalog(
      adminPrincipal,
      "runory.contact",
      "module"
    );
    await freezeCatalogVersion(adminPrincipal, contact.catalogVersionId);

    // Import and freeze the pack
    const pack = await importFromDevCatalog(
      adminPrincipal,
      "crm-lite-pack",
      "pack"
    );
    await freezeCatalogVersion(adminPrincipal, pack.catalogVersionId);

    const locks = await resolvePackLock(
      adminPrincipal,
      pack.catalogVersionId
    );

    // crm-lite-pack references 2 modules: runory.customer:^1.0.0, runory.contact:^1.0.0
    expect(locks).toHaveLength(2);

    // Verify lock entries match expected modules
    const moduleItemIds = locks.map((l) => l.moduleItemId);
    const customerItem = await getCatalogItemByName("runory.customer", "module");
    const contactItem = await getCatalogItemByName("runory.contact", "module");
    expect(moduleItemIds).toContain(customerItem.id);
    expect(moduleItemIds).toContain(contactItem.id);

    // Each lock should have a resolved version and range
    for (const lock of locks) {
      expect(lock.requestedRange).toBe("^1.0.0");
      expect(lock.resolvedModuleVersionId).toBeDefined();
      expect(lock.artifactChecksum).not.toBeNull();
      expect(lock.resolutionOrder).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns the same entries from getPackLock", async () => {
    // Setup: import + freeze modules and pack
    const customer = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );
    await freezeCatalogVersion(adminPrincipal, customer.catalogVersionId);

    const contact = await importFromDevCatalog(
      adminPrincipal,
      "runory.contact",
      "module"
    );
    await freezeCatalogVersion(adminPrincipal, contact.catalogVersionId);

    const pack = await importFromDevCatalog(
      adminPrincipal,
      "crm-lite-pack",
      "pack"
    );
    await freezeCatalogVersion(adminPrincipal, pack.catalogVersionId);

    const resolved = await resolvePackLock(
      adminPrincipal,
      pack.catalogVersionId
    );
    const fetched = await getPackLock(pack.catalogVersionId);

    expect(fetched).toHaveLength(resolved.length);
    for (let i = 0; i < resolved.length; i++) {
      expect(fetched[i].moduleItemId).toBe(resolved[i].moduleItemId);
      expect(fetched[i].requestedRange).toBe(resolved[i].requestedRange);
      expect(fetched[i].resolvedModuleVersionId).toBe(
        resolved[i].resolvedModuleVersionId
      );
      expect(fetched[i].resolutionOrder).toBe(resolved[i].resolutionOrder);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Compatibility Report
// ═══════════════════════════════════════════════════════════════════

describe("Compatibility Report", () => {
  it("generates a report for a fresh install (fromVersionId = null) with warning for added permissions", async () => {
    const { catalogItemId, catalogVersionId } = await importAndFreezeCustomer();

    const report = await generateCompatibilityReport(adminPrincipal, {
      workspaceId: "ws_test_compat",
      catalogItemId,
      fromVersionId: null,
      toVersionId: catalogVersionId,
    });

    // Fresh install: core compatibility passes, but permission diff shows all
    // permissions as "added" (no prior version), which yields overall "warning".
    expect(report.status).toBe("warning");
    expect(report.fromVersionId).toBeNull();
    expect(report.toVersionId).toBe(catalogVersionId);
    expect(report.catalogItemId).toBe(catalogItemId);
    expect(report.coreCompatibility).not.toBeNull();
    expect(report.schemaDiff).not.toBeNull();

    // Permission diff should list all customer permissions as added
    const permDiff = report.permissionDiff as {
      added: string[];
      removed: string[];
    };
    expect(permDiff.added.length).toBeGreaterThan(0);
    expect(permDiff.removed).toHaveLength(0);
  });

  it("generates a report with schema diff for an upgrade (v1.0.0 → v1.1.0)", async () => {
    // Import and freeze v1.0.0
    const v1 = await importAndFreezeCustomer();

    // Build a v1.1.0 manifest with an added field
    const baseManifest = loadModuleManifest("runory.customer");
    const v11Manifest = JSON.parse(JSON.stringify(baseManifest)) as Record<
      string,
      unknown
    > & {
      version: string;
      objects: Array<{
        key: string;
        label: string;
        fields: Array<{
          key: string;
          label: string;
          type: string;
          ownership: string;
        }>;
      }>;
    };
    v11Manifest.version = "1.1.0";
    v11Manifest.objects[0].fields.push({
      key: "website",
      label: "Website",
      type: "text",
      ownership: "module_owned",
    });

    const v11 = await importCatalogCandidate(adminPrincipal, {
      itemType: "module",
      itemId: "runory.customer",
      version: "1.1.0",
      manifest: v11Manifest,
    });
    await freezeCatalogVersion(adminPrincipal, v11.catalogVersionId);

    const report = await generateCompatibilityReport(adminPrincipal, {
      workspaceId: "ws_test_upgrade",
      catalogItemId: v1.catalogItemId,
      fromVersionId: v1.catalogVersionId,
      toVersionId: v11.catalogVersionId,
    });

    // Adding a field is compatible (not a breaking change)
    expect(report.status).toBe("compatible");
    expect(report.fromVersionId).toBe(v1.catalogVersionId);
    expect(report.toVersionId).toBe(v11.catalogVersionId);

    // Schema diff should reflect the added field
    expect(report.schemaDiff).not.toBeNull();
    const schemaDiff = report.schemaDiff as {
      addedFields: Array<{ object: string; field: string }>;
      removedFields: unknown[];
      changedFieldTypes: unknown[];
    };
    expect(schemaDiff.addedFields).toContainEqual({
      object: "customer",
      field: "website",
    });
    expect(schemaDiff.removedFields).toHaveLength(0);
    expect(schemaDiff.changedFieldTypes).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Rollout Management
// ═══════════════════════════════════════════════════════════════════

describe("Rollout Management", () => {
  it("creates a rollout with allowlist targets and shows pending progress", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();
    const release = await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "internal",
    });

    const rollout = await createReleaseRollout(adminPrincipal, {
      catalogReleaseId: release.id,
      targetType: "allowlist",
      targetConfig: {
        workspaceIds: ["ws_rollout_1", "ws_rollout_2"],
      },
    });

    expect(rollout.status).toBe("running");
    expect(rollout.targetType).toBe("allowlist");
    expect(rollout.startedBy).toBe(adminPrincipal.userId);

    // Verify pending targets were created
    const progress = await getRolloutProgress(rollout.id);
    expect(progress.total).toBe(2);
    expect(progress.pending).toBe(2);
    expect(progress.succeeded).toBe(0);
    expect(progress.failed).toBe(0);
    expect(progress.skipped).toBe(0);
  });

  it("pauses, resumes, and cancels a rollout", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();
    const release = await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "internal",
    });

    const rollout = await createReleaseRollout(adminPrincipal, {
      catalogReleaseId: release.id,
      targetType: "allowlist",
      targetConfig: {
        workspaceIds: ["ws_lifecycle_1", "ws_lifecycle_2", "ws_lifecycle_3"],
      },
    });

    expect(rollout.status).toBe("running");

    // Pause
    const paused = await pauseReleaseRollout(
      adminPrincipal,
      rollout.id,
      "Manual pause for testing"
    );
    expect(paused.status).toBe("paused");

    // Resume
    const resumed = await resumeReleaseRollout(adminPrincipal, rollout.id);
    expect(resumed.status).toBe("resumed");

    // Cancel — pending targets should become skipped
    const canceled = await cancelReleaseRollout(
      adminPrincipal,
      rollout.id,
      "No longer needed"
    );
    expect(canceled.status).toBe("canceled");
    expect(canceled.completedAt).not.toBeNull();

    // All pending targets should now be skipped
    const progress = await getRolloutProgress(rollout.id);
    expect(progress.total).toBe(3);
    expect(progress.pending).toBe(0);
    expect(progress.skipped).toBe(3);

    const targets = await listRolloutTargets(rollout.id);
    expect(targets.every((t) => t.status === "skipped")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Deprecation and Withdrawal
// ═══════════════════════════════════════════════════════════════════

describe("Deprecation and Withdrawal", () => {
  it("deprecates a ready version", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    await deprecateCatalogVersion(
      adminPrincipal,
      catalogVersionId,
      "Replaced by newer version"
    );

    const version = await getCatalogVersion(catalogVersionId);
    expect(version.lifecycleStatus).toBe("deprecated");
  });

  it("throws ConflictError when deprecating a draft version", async () => {
    const { catalogVersionId } = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );

    await expect(
      deprecateCatalogVersion(adminPrincipal, catalogVersionId, "Should fail")
    ).rejects.toThrow(ConflictError);
  });

  it("withdraws a ready version", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    await withdrawCatalogVersion(
      adminPrincipal,
      catalogVersionId,
      "Security issue"
    );

    const version = await getCatalogVersion(catalogVersionId);
    expect(version.lifecycleStatus).toBe("withdrawn");
  });

  it("withdraws active releases when version is withdrawn", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    // Create an active internal release
    const release = await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "internal",
    });
    expect(release.status).toBe("active");

    // Withdraw the version
    await withdrawCatalogVersion(
      adminPrincipal,
      catalogVersionId,
      "Critical vulnerability"
    );

    // The release should now be withdrawn
    const updatedRelease = await getRelease(release.id);
    expect(updatedRelease.status).toBe("withdrawn");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Negative Cases (per docs/09 §19)
// ═══════════════════════════════════════════════════════════════════

describe("Negative Cases", () => {
  it("throws AuthorizationError when non-admin calls promoteCatalogRelease", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    await expect(
      promoteCatalogRelease(nonAdminPrincipal, {
        catalogVersionId,
        channel: "internal",
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it("throws ConflictError when freezing a rejected version", async () => {
    const { catalogVersionId } = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );
    await rejectCatalogVersion(adminPrincipal, catalogVersionId, "Bad manifest");

    await expect(
      freezeCatalogVersion(adminPrincipal, catalogVersionId)
    ).rejects.toThrow(ConflictError);
  });

  it("throws ConflictError when promoting a draft version (not ready)", async () => {
    const { catalogVersionId } = await importFromDevCatalog(
      adminPrincipal,
      "runory.customer",
      "module"
    );
    // Version is in 'draft' status — not frozen to 'ready'

    await expect(
      promoteCatalogRelease(adminPrincipal, {
        catalogVersionId,
        channel: "internal",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("throws ConflictError when creating a rollout for a withdrawn release", async () => {
    const { catalogVersionId } = await importAndFreezeCustomer();

    // Create an active internal release
    const release = await promoteCatalogRelease(adminPrincipal, {
      catalogVersionId,
      channel: "internal",
    });

    // Withdraw the version (release becomes withdrawn)
    await withdrawCatalogVersion(
      adminPrincipal,
      catalogVersionId,
      "Pulling release"
    );

    // Attempting to create a rollout for the withdrawn release should fail
    await expect(
      createReleaseRollout(adminPrincipal, {
        catalogReleaseId: release.id,
        targetType: "allowlist",
        targetConfig: {
          workspaceIds: ["ws_should_fail"],
        },
      })
    ).rejects.toThrow(ConflictError);
  });
});
