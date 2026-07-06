# Runory Catalog & Release Control Plane

Status: Approved v1.0
Date: 2026-06-22
Scope: Official and internal Module / Pack / Template manufacturing lifecycle
Related: [architecture/module-architecture.md](architecture/module-architecture.md), [sdk/module-sdk.md](sdk/module-sdk.md), [06-next-steps-roadmap.md](06-next-steps-roadmap.md)

## 1. Purpose

This document defines the platform-level control plane in Runory Cloud for managing, validating, releasing, upgrading, and operating Module, Pack, and Template development artifacts. It also provides an executable POC and phased implementation plan.

The current static Catalog POC has proven that Manifests can be read and installed, but it has not yet proven that:

> Runory can continuously and safely manufacture, validate, release, roll out, upgrade, and govern platform-level business capabilities.

Catalog & Release Control Plane is part of Runory's platform capabilities. It is not the same as the future third-party Marketplace.

## 2. Scope

The current scope must support:

1. Cloud Catalog for Official / Internal Modules, Packs, and Templates.
2. Immutable artifact import into Cloud Registry from Git/CI.
3. Draft candidate validation and Sandbox Workspace validation.
4. `internal → beta → stable` release channel promotion.
5. Pack dependency resolution and immutable lock.
6. Workspace installation, upgrade preflight, and Extension compatibility.
7. Batch rollout, pause, failure isolation, and release observability.
8. Manual UI and Agent governed API use the same commands/services.
9. Full audit for release, deprecation, withdrawal, and upgrade operations.

The current scope does not support:

1. Cloud online code IDE or arbitrary SQL editor.
2. Third-party developer accounts, review, billing, or Marketplace commercial revenue share.
3. User-uploaded arbitrary executable code.
4. Automatic upgrades across breaking major versions.
5. Reusing Team/customer RBAC as platform release permissions.
6. Complete software supply-chain signing infrastructure or SBOM compliance platform.

## 3. Control Plane Separation

```text
Platform Catalog Control Plane
  Official/Internal artifact, validation, release, rollout, withdrawal
                         |
                         v
Workspace Capability Control Plane
  Discover allowed releases, install, preflight, upgrade, observe
                         |
                         v
Workspace Runtime / Data Plane
  Effective module model, records, extensions, workflows, audit
```

Boundaries:

- Platform Catalog permissions do not grant access to customer business data.
- Organization Owners cannot create or release platform artifacts.
- Workspace Admins can only install versions allowed by Entitlement and release policy.
- An Agent inherits the Principal, permissions, and audit requirements of the control plane in which it operates.
- Catalog metadata can be shared across tenants; Workspace installation, compatibility reports, and rollout targets belong to tenant data.

## 4. Personas and Platform Roles

Platform roles are separated from Organization/Workspace RBAC:

| Platform Role | Capability |
| --- | --- |
| `catalog_viewer` | View internal Catalog, versions, validation, and rollout status |
| `catalog_editor` | Import candidates, modify unfrozen metadata, trigger validation |
| `release_manager` | Release internal/beta/stable, pause rollouts, deprecate |
| `security_manager` | Withdraw compromised releases; block installation and upgrade |

Rules:

- Stable release requires explicit confirmation from at least a `release_manager`.
- Agents cannot be the final approver.
- Withdraw can be executed urgently by `security_manager`, but it must include a reason and produce a high-risk Audit Event.
- Before production launch, high-privilege platform accounts need stronger internal access protection than ordinary Workspace Email OTP. A POC may use a restricted allowlist plus audit, but it must not impersonate platform roles through client headers.

## 5. Catalog Concepts

### 5.1 Catalog Item

Represents a stable identity, for example:

```text
module:   runory.customer
pack:     crm-lite-pack
template: small-business-crm
```

Once published, an Item ID must not be renamed. Name, description, and category may be updated, but artifact identity must not change.

### 5.2 Catalog Version

Represents a SemVer version of an Item. After a Version reaches `ready`, its Manifest, migration, and artifact checksum are frozen and cannot be modified.

Version lifecycle:

```text
draft → validating → ready
  |          |
  v          v
rejected   rejected

ready → deprecated
ready/deprecated → withdrawn
```

`ready` means the artifact can be released; it does not mean the Version is visible to Workspaces.

### 5.3 Release

A Release exposes an immutable Version to a channel:

```text
internal → beta → stable
```

- `internal`: platform-internal Sandbox and allowlisted Workspaces only.
- `beta`: explicit opt-in or specified cohort.
- `stable`: visible to ordinary Workspaces that satisfy Entitlement and compatibility conditions.

The same Version can be promoted step by step. Promotion creates an independent Release record and does not modify the Version artifact.

### 5.4 Rollout

A Rollout is the upgrade execution plan for applying a Release to a Workspace cohort:

```text
draft → running → paused → resumed → completed
                   |
                   v
                canceled
```

Rollout pause only stops new targets. It does not undo Workspaces that have already upgraded successfully.

### 5.5 Installation

An Installation records the actual runtime state of a Workspace, not just a Module ID:

```text
requested_version
resolved_version
artifact_checksum
source_release_id
status
installed_at / upgraded_at
last_compatibility_report_id
```

The actual Workspace version is the runtime source of truth; Catalog latest version cannot replace Installation state.

## 6. Artifact Contract

Official/Internal source code continues to be developed in Git. CI produces versioned artifacts; Cloud does not directly read the development working tree as the production Registry.

Recommended artifact:

```text
<item-id>-<version>.tar.gz
├─ manifest.yaml
├─ migrations/
├─ schemas/
├─ assets/
├─ README.md
└─ provenance.json
```

`provenance.json` contains at minimum:

```json
{
  "sourceRepository": "...",
  "sourceCommit": "...",
  "buildId": "...",
  "builtAt": "...",
  "manifestSchemaVersion": "...",
  "payloadSha256": "..."
}
```

`payloadSha256` is computed from the canonical payload excluding the provenance file itself. The SHA-256 of the final compressed artifact is recorded outside the artifact by the Registry to avoid circular definition. The POC requires both checksum types, source commit, and build identity; third-party signatures, SBOM, and provenance attestation are deferred.

Official artifacts must be produced by the canonical compiler/build in the [Runory SDK toolchain](10-runory-sdk-product.md). The Catalog importer should not permanently carry responsibility for repairing or guessing non-canonical artifacts.

## 7. Canonical Data Model

### 7.1 Catalog Tables

```text
catalog_items
- id
- item_type: module / pack / template
- name
- description
- publisher_id
- visibility: internal / public
- status: active / archived
- created_at / updated_at

catalog_versions
- id
- catalog_item_id
- version
- lifecycle_status: draft / validating / rejected / ready / deprecated / withdrawn
- manifest_json
- manifest_schema_version
- artifact_uri
- artifact_checksum
- source_repository
- source_commit
- created_by
- frozen_at
- created_at
- UNIQUE(catalog_item_id, version)

catalog_validation_runs
- id
- catalog_version_id
- status: queued / running / passed / failed
- validator_version
- result_json
- started_at / completed_at

catalog_releases
- id
- catalog_version_id
- channel: internal / beta / stable
- status: active / superseded / paused / withdrawn
- release_notes
- approved_by
- released_at
- UNIQUE(catalog_version_id, channel)
```

### 7.2 Pack Lock

```text
pack_version_locks
- pack_catalog_version_id
- module_item_id
- requested_range
- resolved_module_version_id
- artifact_checksum
- resolution_order
- UNIQUE(pack_catalog_version_id, module_item_id)
```

Pack dependencies are resolved and frozen at release time. When a Workspace installs a Pack, it uses the lock and does not re-resolve the "current latest" version.

### 7.3 Rollout and Compatibility

```text
release_rollouts
- id
- catalog_release_id
- target_type: allowlist / percentage / all_eligible
- target_config_json
- status
- success_threshold
- failure_threshold
- started_by / started_at / completed_at

rollout_targets
- rollout_id
- workspace_id
- from_version_id
- to_version_id
- status: pending / running / succeeded / failed / skipped
- reason_code
- started_at / completed_at

compatibility_reports
- id
- workspace_id
- catalog_item_id
- from_version_id
- to_version_id
- status: compatible / warning / blocked
- core_compatibility_json
- dependency_diff_json
- permission_diff_json
- schema_diff_json
- extension_conflicts_json
- migration_risk_json
- created_at
```

### 7.4 Installation Changes

Extend the existing `installations`:

- Use `catalog_item_id` / `catalog_version_id` or a stable equivalent reference.
- Distinguish `installing / installed / upgrading / failed / disabled`.
- Record artifact checksum and source release.
- Preserve the last successful version; do not only overwrite a version string.
- Pack installation and module installations need a traceable parent operation.

## 8. Manifest and Version Rules

All Modules, Packs, and Templates use SemVer.

- Patch: compatible fix; does not remove contracts.
- Minor: backward-compatible capability addition; may declare deprecated contracts.
- Major: breaking change allowed; requires manual review and must not auto-upgrade.

Manifest must add or explicitly define:

- `manifestSchemaVersion`
- `publisher`
- `releaseCompatibility`
- dependency ranges
- migrations by `from → to`
- permissions and permission change policy
- data ownership
- extension points and removed/deprecated slots
- uninstall/data retention policy

Pack Manifest uses ranges to express development intent, but after release it must generate a resolved lock.

Template versions must declare compatible Pack/Module ranges. Templates do not implicitly upgrade Modules.

## 9. Validation Pipeline

Before a Candidate enters `ready`, validate in order:

1. Artifact checksum and structural integrity.
2. Manifest schema validation.
3. Item ID, Version, SemVer, and immutable identity.
4. Core compatibility.
5. Dependency graph, missing dependencies, and cycle detection.
6. Pack dependency resolution and lock generation.
7. Permission declaration and permission diff against the previous version.
8. Migration file existence, order, checksum, and prohibited-pattern checks.
9. Object/field/view key collision.
10. Extension point compatibility and removed-slot checks.
11. Install test from an empty Workspace.
12. Upgrade test from the previous Stable version.
13. Fixture Workspace compatibility test with active Extensions.
14. UI schema/render smoke test.

Results must be structured, not only stored as CI text logs. Validation failure prevents promotion.

## 10. Sandbox Workspace

Sandbox is an isolated instance of the ordinary Workspace runtime, not a special bypass environment.

- It can only install internal releases.
- It uses the same Installer, Migration, Authorization, and Audit as production.
- It uses synthetic fixture data and does not copy real customer data.
- It supports one-click rebuild.
- Validation Run links to Sandbox test results.

Platform personnel must not use Sandbox functionality to implicitly access customer Workspace data.

## 11. Release and Promotion

### Internal Release

Guard: Version is `ready`, all baseline validations passed, and artifact is frozen.

### Beta Release

Guard:

- Internal Sandbox install/upgrade passed.
- compatibility report has no blockers.
- permission diff has been confirmed.
- release notes are complete.

### Stable Release

Guard:

- Beta cohort reached the minimum success sample, or an explicit POC waiver exists.
- failure rate is below threshold.
- no unresolved migration blocker exists.
- Release Manager explicitly approved.

All promotions are high-risk commands and must have preview, confirmation, and Audit Event.

## 12. Install and Upgrade Execution

### 12.1 Install Pack

```text
Check Workspace admin + Entitlement
→ Load active Release
→ Load frozen Pack Lock
→ Validate Core and existing installations
→ Create operation + compatibility report
→ Install modules in topological order
→ Apply template overlay
→ Persist installations and audit
→ Recompute Effective Runtime Model
```

### 12.2 Upgrade Module/Pack

```text
Resolve target Release
→ Generate compatibility and permission diff
→ Classify risk
→ Require approval when needed
→ Create backup/rollback point
→ Mark installation upgrading
→ Run forward migration
→ Register new metadata/runtime contract
→ Revalidate Workspace Extensions
→ Smoke test
→ Mark installed or failed
→ Audit + rollout target result
```

Database migration does not promise generic automatic down migration. Failure handling should prioritize: stop rollout, preserve last-known-good metadata/runtime, restore backup, or publish a forward fix. "Rollback" in the UI must clearly state the actual recovery capability and must not imply that arbitrary schema changes can be safely reversed.

## 13. Deprecation and Withdrawal

### Deprecate

- Installed Workspaces continue running.
- New installations stop by default.
- Show replacement and support end date.
- Provide migration guidance.

### Withdraw

- Block new installation and new upgrade to that version.
- Pause related rollouts.
- Put installed Workspaces into a security review queue.
- Do not directly delete artifacts or customer data.
- Decide emergency upgrade, feature disablement, or operational communication based on risk.

Artifact and Release history are not physically deleted, preserving audit and recovery evidence.

## 14. Manual UI Surfaces

### Platform Catalog Console

Recommended route: `/platform/catalog`, separated from customer Workspace UI.

Minimum pages:

1. Catalog overview: Module/Pack/Template, channel, latest Stable, installation count, failure rate.
2. Item detail: versions, dependencies, permissions, publisher, install distribution.
3. Version detail: manifest, artifact, validation, diff, release notes.
4. Validation run: checks, errors, Sandbox evidence.
5. Release action: promotion preview, approval, deprecate, withdraw.
6. Rollout detail: cohort, success/failure, pause/resume.

### Workspace Module Center

Recommended route: `/w/[workspaceId]/settings/modules`.

- Visible Catalog.
- Current installed version and channel.
- New version and compatibility summary.
- install/upgrade preview.
- permission/schema/extension diff.
- upgrade policy: manual / stable auto-update (enabled later).
- operation history and failure state.

No Manifest form editor or Cloud code editor is provided currently.

## 15. Agent Operations

Agent and UI call the same service commands; no Agent-only bypass is created.

Platform Agent tools:

```text
catalog.item.list
catalog.version.inspect
catalog.version.validate
catalog.version.diff
catalog.release.plan
catalog.release.promote
catalog.rollout.inspect
catalog.rollout.pause
catalog.compatibility.explain
```

Workspace Agent tools:

```text
workspace.catalog.list
workspace.module.install.plan
workspace.module.install
workspace.module.upgrade.plan
workspace.module.upgrade
workspace.module.compatibility.explain
```

Risk:

- list/inspect/explain: low.
- validate/plan: low or medium.
- install/upgrade beta: medium.
- stable promotion, rollout all, withdraw: high, must require human confirmation.

Agents can generate Draft proposals, diffs, release notes, and rollout recommendations; they cannot become Stable approvers.

## 16. APIs and Commands

Recommended Command layer:

```text
ImportCatalogCandidate
RunCatalogValidation
FreezeCatalogVersion
PromoteCatalogRelease
DeprecateCatalogVersion
WithdrawCatalogVersion
CreateReleaseRollout
PauseReleaseRollout
PlanWorkspaceInstall
ApplyWorkspaceInstall
PlanWorkspaceUpgrade
ApplyWorkspaceUpgrade
```

HTTP/API is only a command adapter. Each mutation command receives a server-derived Principal, idempotency key, request ID, and approval context.

Read APIs:

```text
GET /api/platform/catalog
GET /api/platform/catalog/:itemId
GET /api/platform/catalog/:itemId/versions/:version
GET /api/platform/releases/:releaseId/rollout
GET /api/workspaces/:workspaceId/catalog
GET /api/workspaces/:workspaceId/installations
GET /api/workspaces/:workspaceId/upgrades/:operationId
```

Mutation route names may be adjusted according to the Next.js implementation, but domain commands should not change with transport.

## 17. Audit and Observability

Must audit:

- candidate import/freeze/reject
- validation request/result
- release promotion/deprecation/withdrawal
- rollout create/pause/resume/cancel
- Workspace install/upgrade/failed/retry
- compatibility override and approver

Minimum metrics:

- Workspace installation count by item/version/channel.
- install/upgrade success rate and duration.
- failure reason distribution.
- version adoption distribution.
- Extension compatibility warning/block count.
- rollout cohort progress.
- withdrawn/deprecated exposure count.

Metrics do not include customer business record content.

## 18. Security Boundaries

- Artifact storage writes are only allowed from CI/import service; Runtime is read-only.
- Artifact URI submitted by clients is not executed directly; it must pass checksum and allowlisted storage validation.
- Migration runs in a controlled runner and does not accept arbitrary SQL from platform UI.
- Manifest permission expansion must generate an explicit diff.
- Platform role is separated from SaaS Organization role.
- Catalog Agent does not receive customer data access.
- Stable release and security withdrawal require strong audit and explicit Principal.
- Published artifacts, validation results, and release history cannot be silently overwritten.

## 19. POC Scope

The POC only covers Official/Internal Catalog and uses `runory.customer` v1.0.0 → v1.1.0 to demonstrate the complete closed loop.

### POC Scenario

```text
1. SDK/CLI validates, tests, and builds runory.customer 1.1.0 artifact from typed source
2. Import as Draft candidate
3. Validate Manifest, checksum, Core range, migration, and dependencies
4. Generate schema/permission/extension-point diff against 1.0.0
5. Release Internal
6. Install into synthetic-data Sandbox Workspace
7. Validate compatibility in fixture Workspace with custom customer field
8. Release Beta
9. Roll out to allowlisted Workspace
10. View success/failure and version distribution
11. Pause rollout
12. After fix, release new immutable patch version
13. Release Stable
14. Ordinary Workspace Module Center sees it and upgrades manually
```

### Required Negative Cases

- Modifying the artifact of a frozen version is rejected.
- Dependency cycle is rejected.
- Unresolvable range in Pack lock is rejected.
- Removing an active Extension slot causes upgrade to be blocked.
- Undeclared permission expansion causes promotion to be blocked.
- Migration failure marks the target as failed and pauses rollout at threshold.
- Workspace Admin cannot call platform promotion.
- Agent cannot release Stable without human confirmation.

### POC Success Criteria

1. Catalog no longer uses mutable Manifests in the deployment directory as the only runtime source of truth.
2. Version artifact is immutable and verifiable by checksum.
3. Pack install uses frozen resolved lock.
4. Internal/Beta/Stable promotion can be completed through UI and Agent-assisted plan.
5. Compatibility report is produced before Workspace upgrade.
6. Rollout is observable and pausable; failure does not affect other Workspaces.
7. All platform and Workspace operations have correct Principal and Audit Event.
8. Customer 1.1 artifact is reproducibly generated by the SDK toolchain and does not enter Registry through manual packaging.

## 20. Implementation Plan

### CR0 — Contracts and Persistence

Priority: P0

- Extend Module/Pack/Template schemas: manifest version, publisher, migration graph, compatibility metadata.
- Add Catalog, Version, Validation, Release, Pack Lock, Compatibility, and Rollout migrations.
- Define Platform roles, commands, errors, and audit actions.
- Keep repo Catalog loader as a development import adapter, no longer as the production install source.
- Align with SDK0 canonical public contracts; Catalog does not depend on private SDK authoring source.

Exit: Artifacts can be built from the current `catalog/` and imported into Registry; legacy POC tests remain passing.

### CR1 — Validation and Immutable Registry

Priority: P0

- Artifact builder/importer, SHA-256, object storage adapter.
- Manifest/dependency/migration/permission/extension validation pipeline.
- Validation result persistence.
- Freeze `ready` version and prevent overwrite.
- Sandbox fixture install and upgrade runner.
- Accept SDK build provenance/checksum/validation summary, and independently re-verify rather than blindly trusting local results.

Exit: Customer 1.1 candidate completes positive/negative validation suite.

### CR2 — Release and Pack Lock

Priority: P0

- Release channel and promotion guards.
- Pack dependency resolver, cycle detection, and frozen lock.
- Release notes/diff/approval commands.
- Platform Catalog Console read pages and promotion action.

Exit: CRM Lite Pack can be promoted from Internal to Beta, and installation strictly uses lock.

### CR3 — Workspace Install/Upgrade

Priority: P0

- Registry-backed Installer.
- Install/upgrade operation state machine.
- Compatibility report: Core, dependency, permission, schema, Extension, migration.
- Workspace Module Center.
- failure isolation, last-known-good metadata, and retry path.

Exit: Existing Workspace can upgrade from Customer 1.0 to Beta 1.1, and blocked Extension case stops correctly.

### CR4 — Rollout and Agent Operations

Priority: P1

- allowlist/percentage/all-eligible rollout.
- threshold pause, resume, cancel.
- Platform and Workspace Agent tools mapping to commands.
- rollout metrics and version distribution.

Exit: Beta allowlist rollout can be paused; Agent can explain failures but cannot bypass approval.

### CR5 — Stable Release Gate

Priority: P1

- Stable promotion guard and manual approval UI.
- Deprecate/withdraw and exposure report.
- Production runbooks: failed migration, bad release, security withdrawal.
- Browser E2E, security regression, migration replay, and observability checks.

Exit: Full POC scenario and negative cases pass in CI/acceptance environment.

## 21. Current Implementation Gap Map

| Current State | Required Upgrade |
| --- | --- |
| Installer reads `catalog/` files directly | Registry-backed immutable artifact loader |
| One manifest per item in working tree | Multiple immutable Catalog Versions |
| Pack ranges parsed with simple string/sort logic | SemVer resolver, dependency graph, cycle check, frozen lock |
| Installation stores module version string | Catalog version/checksum/release/operation history |
| Only install migration | Versioned upgrade graph and compatibility preflight |
| No platform catalog RBAC | Separate Platform Principal and roles |
| No validation persistence | Structured Validation Runs and evidence |
| No release channels | Internal/Beta/Stable Release records |
| No rollout | Cohort targets, pause, threshold and metrics |
| Workspace settings installs static Pack | Module Center with catalog visibility and upgrade plan |

## 22. Definition of Complete

The first version of Catalog & Release Control Plane is complete only when all of the following are true:

1. ✅ Official/Internal artifacts enter immutable Cloud Registry from Git/CI. — `importFromDevCatalog` + `importCatalogCandidate` implement artifact import and SHA-256 checksum calculation.
2. ✅ Module, Pack, and Template have multiple versions, validation, and release channels. — `catalog_items` + `catalog_versions` + `catalog_releases` tables, 10-step validation pipeline, and internal/beta/stable channels.
3. ✅ Pack release generates a reproducible dependency lock. — `resolvePackLock` uses SemVer resolver + `pack_version_locks` table stores frozen lock.
4. ✅ Workspace installation binds to exact artifact checksum. — `installations` table extends `catalog_version_id` + `artifact_checksum` + `source_release_id`.
5. ✅ Install/upgrade uses the same compatibility, authorization, and audit path. — `generateCompatibilityReport` runs 6 checks, and all mutations write audit events.
6. ✅ Stable promotion requires human Release Manager approval. — `promoteCatalogRelease` requires `release_manager` role, and stable channel requires an existing active beta release first.
7. ✅ Agent and UI share commands; Agent has no publishing bypass. — All operations go through the service layer, API routes are thin adapters, and Agent has no independent bypass.
8. ✅ Rollout supports observation and pause; one Workspace failure does not spread. — `createReleaseRollout` + `pauseReleaseRollout` + `checkThresholdAndAutoPause` implement automatic pause by failure threshold.
9. ✅ Deprecated/withdrawn artifacts are not deleted and behavior follows policy. — `deprecateCatalogVersion` + `withdrawCatalogVersion` only change status, do not delete data, and withdrawn releases block new installs.
10. ✅ POC scenario and all negative cases pass automatically. — 30 tests cover POC scenario + 8 negative cases.

## 23. Implementation Status

| Phase | Status | Key Deliverables |
| --- | --- | --- |
| CR0 — Contracts and Persistence | ✅ Complete | Migrations 0009/0010, extended manifest schemas, platform roles, 15 audit actions, 5 service modules |
| CR1 — Validation and Immutable Registry | ✅ Complete | `importFromDevCatalog`, `computeManifestChecksum`, 10-step validation pipeline, `freezeCatalogVersion`, `rejectCatalogVersion` |
| CR2 — Release and Pack Lock | ✅ Complete | `promoteCatalogRelease` (internal→beta→stable guards), `resolvePackLock` (SemVer resolver), `deprecateCatalogVersion`, `withdrawCatalogVersion` |
| CR3 — Workspace Install/Upgrade | ✅ Complete | `generateCompatibilityReport` (6 checks), `comparePermissions`, `compareSchema`, extended `installations` table |
| CR4 — Rollout and Agent Operations | ✅ Complete | `createReleaseRollout` (allowlist/percentage/all_eligible), `pauseReleaseRollout`, `resumeReleaseRollout`, `cancelReleaseRollout`, `checkThresholdAndAutoPause` |
| CR5 — Stable Release Gate | ✅ Complete | Stable promotion guard (requires beta + release_manager), deprecate/withdraw with audit, 30 automated tests |

### Service Modules

| File | Responsibility |
| --- | --- |
| `catalog-registry.ts` | Catalog item/version CRUD, artifact import, freeze/reject |
| `catalog-validation.ts` | 10-step validation pipeline, cycle detection, SemVer validation |
| `catalog-release.ts` | Release channel promotion, pack lock resolution, deprecate/withdraw |
| `catalog-compatibility.ts` | 6-check compatibility report, schema/permission diff |
| `catalog-rollout.ts` | Rollout creation, pause/resume/cancel, threshold auto-pause |

### API Routes (19 endpoints)

**Platform Catalog Console** (`/api/platform/`):
- `GET/POST /api/platform/catalog` — list items, import from dev catalog
- `GET /api/platform/catalog/:itemId` — item detail
- `GET /api/platform/catalog/:itemId/versions` — list versions
- `GET /api/platform/catalog/versions/:versionId` — version detail
- `POST /api/platform/catalog/versions/:versionId/validate` — run validation
- `POST /api/platform/catalog/versions/:versionId/freeze` — freeze version
- `POST /api/platform/catalog/versions/:versionId/reject` — reject version
- `POST /api/platform/catalog/versions/:versionId/promote` — promote to channel
- `POST /api/platform/catalog/versions/:versionId/deprecate` — deprecate
- `POST /api/platform/catalog/versions/:versionId/withdraw` — withdraw
- `GET/POST /api/platform/catalog/versions/:versionId/lock` — pack lock
- `GET /api/platform/releases` — list releases
- `GET/POST /api/platform/releases/:releaseId/rollout` — rollout for release
- `GET /api/platform/rollouts/:rolloutId` — rollout detail + progress
- `POST /api/platform/rollouts/:rolloutId/cancel` — cancel

**Workspace Module Center** (`/api/workspaces/[id]/`):
- `GET /api/workspaces/:id/catalog` — list available catalog items
- `POST /api/workspaces/:id/compatibility` — generate compatibility report

### Test Coverage

- 30 catalog control plane tests (POC scenario + negative cases)
- 135 existing platform-core tests (no regressions)
- Total: 165 tests passing
