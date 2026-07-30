# Test Case 09 — Delivery Infrastructure

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Priority | P1 |
| Primary role | Platform Operator |
| Surface | Desktop browser (admin console) |
| Applies to | v0.9 delivery toolchain (v0.9.0–v0.9.4) |
| Prerequisite | [00 — Environment Setup](./00-test-environment-setup.md) |

## 1. Purpose

Verify that Runory's delivery infrastructure toolchain can provision a new
workspace from a reference solution, validate its health, diagnose it,
compare it against a reference workspace, enforce the 90/10 coverage rule,
apply governed extension templates, execute a pack upgrade, roll it back,
enforce contract freeze, and expose upgrade policies — all through the
admin console and documented APIs without manual database repair.

This is the platform delivery acceptance run. It answers:

> Can one Platform Operator take a customer workspace from empty to
> provisioned, validated, upgraded, rolled back, and policy-checked through
> the supported delivery tooling?

## 2. Scope

### 2.1 What this run proves

- `provisionWorkspace()` orchestrates workspace creation, pack installation,
  extension application, and command contract sync as one operation.
- A declarative reference solution (`reactive-service`) can be applied and
  produces the expected objects, fields, views, and demo data.
- `getWorkspaceProvisioningSummary()` reports installed packs, extensions,
  object/field counts, and demo data state.
- Workspace health checks run all six categories and surface real status.
- The support diagnostics package aggregates configuration export, contract
  inventory, rollout status, outbox failures, migration state, and health.
- Configuration diff produces a structured delta against a reference
  workspace across objects, fields, views, navigation, extensions,
  permissions, and pack versions.
- 90/10 coverage validation classifies deltas and rejects Core-change deltas.
- Extension templates can be listed and applied into a workspace.
- The upgrade executor takes a pre-upgrade snapshot and runs migrations.
- Pack-level rollback reverses a version upgrade, inverts DDL, and restores
  prior configuration.
- Contract freeze detects multi-category violations.
- Upgrade policies (compatibility, upgrade, deprecation, known-boundary)
  are visible.

### 2.2 What this run does not prove

- FSM commercial lifecycle correctness (see test cases 01–03).
- Customer-facing or mobile surfaces (see test cases 04–06).
- Role permission boundaries (see test case 07).
- Exception handling on business records (see test case 08).
- Cross-tenant data isolation enforcement at the database layer (covered by
  automated architecture tests).

## 3. Delivery toolchain surface

```text
Admin console                       API
/admin                              (overview)
/admin/catalog/[itemId]             GET  /api/extension-templates
/admin/releases                     GET  /api/platform/upgrade-policies
/admin/rollouts                     POST /api/platform/provision
/admin/installations                GET  /api/workspaces/[id]/provisioning-summary
/admin/workspaces                   GET  /api/workspaces/[id]/health
/admin/compatibility                GET  /api/workspaces/[id]/diagnostics
                                    GET  /api/workspaces/[id]/config-diff
                                    GET  /api/coverage-validation
                                    POST /api/workspaces/[id]/extension-templates/[templateId]/apply
                                    POST /api/platform/rollouts/[rolloutId]/execute
                                    POST /api/platform/rollouts/targets/[targetId]/rollback
                                    GET/POST /api/platform/contract-freeze
```

Reference solution catalog entry:

```text
catalog/reference-solutions/reactive-service.solution.json
```

## 4. Preconditions

- [ ] Dev server running at `http://localhost:3000`
- [ ] Demo workspace created with CRM Lite, Sales Quote, and FSM Packs
  installed (this becomes the reference workspace)
- [ ] Current identity has platform admin access (can reach `/admin`)
- [ ] Catalog contains `reactive-service.solution.json` and the five
  extension templates
- [ ] At least one releasable pack version exists in the catalog for the
  upgrade stage
- [ ] No database reset or manual seed repair will occur after the run begins
- [ ] Automated baseline passes:
  ```bash
  pnpm vitest run packages/platform-core/src/architecture-tests.test.ts
  ```

## 5. Test data

```text
Run ID: DELIV-<YYYYMMDD>-<HHMM>
Provisioned workspace name: <Run ID> Delivery Workspace
Provisioned workspace slug: <Run ID>-ws
Reference workspace slug: <seeded demo workspace slug>
Reference solution: catalog/reference-solutions/reactive-service.solution.json
Extension template to apply: customer-loyalty-tier
Upgrade target pack: <chosen pack from catalog, e.g. FSM Pack>
Upgrade target version: <next available version in catalog>
Rollback target: <the targetId created by the upgrade execution>
Contract freeze scope: command contracts + schema
```

## 6. Execution procedure

### Stage 0 — Establish the platform admin baseline

1. Open `/admin`.
2. Confirm the overview page loads and shows the catalog, releases,
   rollouts, installations, workspaces, and compatibility navigation.
3. Confirm the current identity is identifiable as Platform Operator.
4. Confirm the reference (demo) workspace appears in the workspaces list.

**Expected:**

- `/admin` renders without console errors.
- All admin navigation entries are discoverable.
- The reference workspace is listed and reachable.

**Fail when:** Admin console fails to load; identity is ambiguous; the
reference workspace is missing.

### Stage 1 — Create and provision a new workspace

1. Navigate to `/admin/workspaces` and choose the provisioning action, or
   call the provisioning API:
   ```text
   POST /api/platform/provision
   ```
   with a payload that creates a new workspace named
   `<Run ID> Delivery Workspace`, installs the required packs (CRM Lite,
   Sales Quote, FSM), and triggers command contract sync.
2. Wait for orchestration to complete.
3. Open the new workspace and retrieve its provisioning summary:
   ```text
   GET /api/workspaces/[id]/provisioning-summary
   ```
4. Record installed packs, extensions, object count, field count, and demo
   data state.

**Expected:**

- `provisionWorkspace()` creates exactly one new workspace.
- All requested packs are installed and their versions are recorded.
- Command contract sync completes without unresolved contracts.
- The provisioning summary lists installed packs, extensions, object and
  field counts, and demo data state (present/absent).
- The new workspace is reachable at `/w/<slug>/dashboard` and loads without
  console errors.

**Fail when:** Provisioning creates duplicate workspaces; packs are only
partially installed; contract sync is skipped; the provisioning summary is
empty or inconsistent with the workspace.

### Stage 2 — Apply the reactive-service reference solution

1. From the new workspace, apply the declarative reference solution:
   ```text
   applyReferenceSolution("catalog/reference-solutions/reactive-service.solution.json")
   ```
   (via the admin console action or the provisioning API with the solution
   spec).
2. Re-fetch the provisioning summary and confirm the diff in objects,
   fields, views, and demo data.
3. Open the workspace dashboard and confirm the solution's objects/views are
   navigable.

**Expected:**

- `applyReferenceSolution()` applies the solution spec atomically.
- The provisioning summary reflects the new objects, fields, and views
  introduced by `reactive-service`.
- Demo data defined by the solution is present.
- New objects/views are discoverable in the workspace shell without a server
  restart.

**Fail when:** The solution is applied partially; objects exist but views
are missing; demo data is absent without explanation; re-applying creates
duplicate artifacts.

### Stage 3 — Run the workspace health check

1. From `/admin/workspaces`, open the provisioned workspace and run the
   health check, or call:
   ```text
   GET /api/workspaces/[id]/health
   ```
2. Inspect the result for all six check categories:
   - command contracts
   - schema drift
   - view integrity
   - entitlement
   - extension consistency
   - installation status

**Expected:**

- All six categories are present in the report.
- Each category reports a clear status (e.g. `pass` / `warn` / `fail`) and,
  where applicable, a human-readable explanation.
- A healthy provisioned workspace returns `pass` (or documented `warn`) for
  every category.
- The report identifies the workspace and a timestamp.

**Fail when:** Any category is missing; statuses are ambiguous; a healthy
workspace reports `fail` without a remediable explanation; the report is
not scoped to the target workspace.

### Stage 4 — Generate the support diagnostics package

1. From the workspace admin surface, generate the diagnostics package, or
   call:
   ```text
   GET /api/workspaces/[id]/diagnostics
   ```
2. Confirm the package aggregates all six sections:
   - configuration export
   - contract inventory
   - rollout status
   - outbox failures
   - migration state
   - health report
3. Spot-check that each section contains real data for this workspace (not
   a template or empty payload).

**Expected:**

- The diagnostics package is produced as a single aggregated response.
- Each of the six sections is present and non-empty.
- The health report section is consistent with Stage 3.
- The package does not leak data from other workspaces.
- No sensitive secrets (tokens, keys) are included in the export.

**Fail when:** Any of the six sections is missing; sections contain data
from a different workspace; secrets are exposed; the package cannot be
generated for a healthy workspace.

### Stage 5 — Generate a configuration diff against the reference workspace

1. From `/admin/workspaces`, open the provisioned workspace and initiate a
   configuration diff against the reference (demo) workspace, or call:
   ```text
   GET /api/workspaces/[id]/config-diff
   ```
   (configured to compare against the reference workspace).
2. Inspect the structured delta across all dimensions:
   - objects
   - fields
   - views
   - navigation
   - extensions
   - permissions
   - pack versions

**Expected:**

- The diff is returned as a structured document covering all seven
  dimensions.
- Deltas are classified as additions, removals, or modifications.
- Pack version differences are explicit.
- The diff is scoped to the two workspaces being compared.

**Fail when:** Any dimension is missing; deltas are unclassified; the diff
includes data from unrelated workspaces; pack version differences are
hidden.

### Stage 6 — Run the 90/10 coverage validation

1. From the admin console, run coverage validation on the configuration
   diff produced in Stage 5, or call:
   ```text
   GET /api/coverage-validation
   ```
2. Confirm the deltas are classified into:
   - standard product
   - governed extension
   - requires Core change (must be zero for a passing result)

**Expected:**

- The validation analyzes the configuration diff automatically.
- Every delta is assigned one of the three classifications.
- `requires Core change` count is `0` for a clean provisioned workspace.
- A non-zero `requires Core change` count is surfaced as a blocking finding
  with a readable explanation per delta.

**Fail when:** Deltas are left unclassified; a `requires Core change` delta
is silently allowed; the report contradicts the diff from Stage 5.

### Stage 7 — Apply an extension template

1. List the available extension templates, or call:
   ```text
   GET /api/extension-templates
   ```
2. Confirm all five templates are present:
   - `customer-loyalty-tier`
   - `invoice-payment-terms`
   - `quote-expiry-section`
   - `service-visit-checklist`
   - `work-order-priority-filter`
3. Apply the `customer-loyalty-tier` template to the provisioned workspace:
   ```text
   POST /api/workspaces/[id]/extension-templates/customer-loyalty-tier/apply
   ```
4. Re-fetch the provisioning summary and confirm the new extension,
   objects, and fields appear.

**Expected:**

- All five templates are listed with descriptions and applicable pack
  context.
- Applying `customer-loyalty-tier` creates the expected objects/fields and
  registers the extension.
- The provisioning summary reflects the applied extension.
- The applied extension is visible in the workspace UI.
- Re-applying the same template is idempotent or reports a clear conflict.

**Fail when:** Templates are missing; applying a template partially
succeeds; the extension does not appear in the provisioning summary;
duplicate artifacts are created on re-apply.

### Stage 8 — Execute a pack upgrade via the upgrade executor

1. From `/admin/rollouts` (or `/admin/releases`), create a rollout targeting
   the provisioned workspace with the chosen pack and target version.
2. Execute the rollout, or call:
   ```text
   POST /api/platform/rollouts/[rolloutId]/execute
   ```
3. Confirm the upgrade executor takes a pre-upgrade snapshot before running
   migrations.
4. Confirm migrations run and the pack version advances.
5. Re-run the health check (Stage 3) and confirm the workspace remains
   healthy.

**Expected:**

- The upgrade executor captures a pre-upgrade snapshot (configuration and
  data) before any migration runs.
- Migrations execute in order and are recorded in migration state.
- The pack version on the workspace advances to the target version.
- Post-upgrade health check passes (or surfaces only documented warnings).
- The rollout appears in `/admin/rollouts` with a succeeded/executing
  status.

**Fail when:** No pre-upgrade snapshot is captured; migrations run out of
order or fail silently; the pack version does not advance; the workspace
becomes unhealthy after upgrade.

### Stage 9 — Perform a pack-level rollback

1. From the rollout created in Stage 8, choose to roll back the upgraded
   target, or call:
   ```text
   POST /api/platform/rollouts/targets/[targetId]/rollback
   ```
2. Confirm the rollback reverses the pack version upgrade, inverts the DDL
   migration, and restores the prior configuration from the snapshot.
3. Re-run the health check (Stage 3) and confirm the workspace is healthy.
4. Confirm the pack version is back to the pre-upgrade version.

**Expected:**

- The rollback restores the pack to its pre-upgrade version.
- DDL migrations are inverted (not just metadata flipped).
- Configuration is restored from the pre-upgrade snapshot.
- Post-rollback health check passes.
- The rollout target status reflects the rollback.

**Fail when:** Rollback only flips metadata without inverting DDL; the pack
version remains at the upgraded version; configuration drift remains after
rollback; the workspace is left unhealthy.

### Stage 10 — Verify contract freeze enforcement

1. From `/admin/compatibility` (or the contract freeze surface), query the
   current contract freeze state, or call:
   ```text
   GET /api/platform/contract-freeze
   ```
2. Introduce a contract-freeze violation in the provisioned workspace (for
   example, a governed command contract or schema change that violates the
   frozen contract), then re-run the check:
   ```text
   POST /api/platform/contract-freeze
   ```
3. Confirm multi-category violation detection.

**Expected:**

- The contract freeze check detects violations across multiple categories
  (e.g. command contracts, schema, navigation, permissions).
- Each violation lists the category, the offending artifact, and a
  remediation hint.
- A clean workspace returns no violations.
- Violations block the corresponding upgrade/release path.

**Fail when:** Violations are not detected; only one category is checked;
violations do not block downstream release actions; a clean workspace
reports false violations.

### Stage 11 — Review upgrade policies

1. Open `/admin/compatibility` and review the published upgrade policies, or
   call:
   ```text
   GET /api/platform/upgrade-policies
   ```
2. Confirm all four policy types are present:
   - compatibility
   - upgrade
   - deprecation
   - known-boundary

**Expected:**

- All four policy types are listed with applicable scope and version
  ranges.
- Each policy is human-readable and identifies affected packs/versions.
- Deprecation and known-boundary policies surface actionable guidance.

**Fail when:** Any policy type is missing; policies reference unknown packs
or versions; policy text is empty or machine-only.

## 7. DB Spot-check

Run these queries via `sqlite3 apps/cloud/data/runory.db -header -column` after
the corresponding stage completes. Compare the DB values against what the UI
shows. Any mismatch is a P1 finding.

### After Stage 1 — Provision workspace (workspace + installed packs)

```sql
SELECT w.id, w.name, w.slug, w.created_at,
       (SELECT COUNT(*) FROM runory_runtime_pack_installations
        WHERE workspace_id = w.id) AS installed_pack_count
FROM platform_workspaces w
WHERE slug = '<run-id>-ws';
```

**Verify:** exactly one row is returned for the new workspace;
`installed_pack_count >= 3` (CRM Lite, Sales Quote, and FSM packs are recorded
in `runory_runtime_pack_installations`). No row means provisioning did not
persist the workspace; a count below 3 means packs were only partially
installed.

### After Stage 8 — Pack upgrade (version advanced, rollout recorded)

```sql
SELECT i.module_id, i.module_version, i.catalog_version_id, i.upgraded_at,
       (SELECT to_version_id FROM runory_catalog_rollout_targets
        WHERE workspace_id = i.workspace_id
        ORDER BY created_at DESC LIMIT 1) AS rollout_to_version,
       (SELECT status FROM runory_catalog_rollout_targets
        WHERE workspace_id = i.workspace_id
        ORDER BY created_at DESC LIMIT 1) AS rollout_status
FROM runory_runtime_installations i
WHERE workspace_id = '<provisioned-workspace-id>' AND status = 'installed'
ORDER BY upgraded_at DESC;
```

**Verify:** the upgraded module's `catalog_version_id` matches
`rollout_to_version` (the pack version advanced to the target); `rollout_status
= succeeded` (or `running`); `upgraded_at` is set. The `installations` row is
the migration-state record proving the new version was applied, not just
reported by the API.

### After Stage 9 — Pack rollback (version reverted, rollback audited)

```sql
SELECT i.module_id, i.module_version, i.catalog_version_id,
       (SELECT from_version_id FROM runory_catalog_rollout_targets
        WHERE workspace_id = i.workspace_id
        ORDER BY created_at DESC LIMIT 1) AS pre_upgrade_version,
       (SELECT to_version_id FROM runory_catalog_rollout_targets
        WHERE workspace_id = i.workspace_id
        ORDER BY created_at DESC LIMIT 1) AS upgraded_version,
       (SELECT COUNT(*) FROM runory_runtime_audit_logs
        WHERE entity_type = 'rollout_target'
          AND action = 'upgrade.target_rolled_back') AS rollback_audit
FROM runory_runtime_installations i
WHERE workspace_id = '<provisioned-workspace-id>' AND status = 'installed'
ORDER BY upgraded_at DESC;
```

**Verify:** the rolled-back module's `catalog_version_id` reverted to
`pre_upgrade_version` (it matches `from_version_id` and no longer equals
`upgraded_version`); `rollback_audit >= 1` (the `rollback_executor` recorded an
`upgrade.target_rolled_back` audit event on the rollout target). This confirms
the DDL/metadata was restored from the snapshot, not just a status flip.

### After Stage 10 — Contract freeze (frozen baseline present, violations detectable)

```sql
SELECT id, status, captured_at, captured_by, created_at,
       length(snapshot_json) AS snapshot_size
FROM runory_catalog_contract_freeze_snapshots
WHERE status = 'active'
ORDER BY created_at DESC LIMIT 1;
```

**Verify:** exactly one `active` snapshot row exists (the frozen contract
baseline that violations are checked against) and `snapshot_size > 0`. When the
`POST /api/platform/contract-freeze` check reports violations, this baseline
must be present — violations are derived by comparing the current contract
state against `snapshot_json`, and the freeze enactment is also recorded in
`runory_runtime_audit_logs` under `action = contract.freeze`. A clean workspace
returns the baseline with zero detected violations; a missing baseline while
violations are reported is a P1 finding.

## 8. Cross-surface consistency matrix

Record observed values at the end of Stages 2, 8, and 9.

| Field | Admin workspaces | Provisioning summary | Health check | Diagnostics | Config diff | Coverage validation |
| --- | --- | --- | --- | --- | --- | --- |
| Workspace id | | | | | | |
| Installed packs | | | | | N/A | N/A |
| Pack versions | | | | | | N/A |
| Object count | | | | | | N/A |
| Field count | | | | | | N/A |
| Extension count | | | | | | N/A |
| Demo data state | | | N/A | | N/A | N/A |
| Health status | N/A | N/A | | | N/A | N/A |
| Rollout status | | N/A | N/A | | N/A | N/A |

Any unexplained disagreement is a failed run even when every individual
stage returns a passing status.

## 9. Run record template

```markdown
### Delivery Infrastructure — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- Reference workspace slug/id:
- Provisioned workspace slug/id:
- Browser:
- Identity shown:
- Rollout id:
- Rollout target id:
- Extension template applied:
- Upgrade target pack/version:

| Stage | Result | Evidence / observed behavior | Finding |
| --- | --- | --- | --- |
| 0. Admin baseline | PASS / FAIL | | |
| 1. Provision workspace | PASS / FAIL | | |
| 2. Apply reactive-service | PASS / FAIL | | |
| 3. Health check (6 categories) | PASS / FAIL | | |
| 4. Diagnostics package | PASS / FAIL | | |
| 5. Configuration diff | PASS / FAIL | | |
| 6. 90/10 coverage validation | PASS / FAIL | | |
| 7. Apply extension template | PASS / FAIL | | |
| 8. Upgrade execution | PASS / FAIL | | |
| 9. Pack-level rollback | PASS / FAIL | | |
| 10. Contract freeze | PASS / FAIL | | |
| 11. Upgrade policies | PASS / FAIL | | |
| Cross-surface consistency | PASS / FAIL | | |

Final decision: PASS / FAIL

Findings:

1. [P0/P1/P2/P3] <title>
   - Expected:
   - Actual:
   - Reproduction:
   - Affected record(s):
   - Owner / milestone:

Run integrity:
- No direct API/SQL mutation: YES / NO
- No identity switching: YES / NO
- No reset during run: YES / NO
- Pre-upgrade snapshot captured before migration: YES / NO
- Rollback inverted DDL (not just metadata): YES / NO
```
