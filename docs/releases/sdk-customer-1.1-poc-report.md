# SDK POC Report — Customer 1.1 Catalog Artifact

## Objective

Validate that the Runory SDK (`@runory/sdk`) can produce a catalog-ready module
artifact end-to-end via the `validate → test → build` pipeline, replacing the
hand-written YAML manifest workflow used for `runory.customer` 1.0.0.

Release Blocker #13 for Runory v0.1.0 requires the Customer 1.1 module to be
authored as typed source (`defineModule`) and built through the SDK, proving the
SDK is the supported authoring path for catalog modules.

## Scope

- Author `runory.customer` 1.1.0 as a TypeScript module using `defineModule`.
- Delta vs 1.0.0: add `industry` (select) and `website` (text) fields.
- Provide install + upgrade migrations.
- Exercise the SDK pipeline: `validateManifest`, `scanForSecrets`,
  `compileManifest`.
- Exercise the SDK test harness: `ModuleTestHarness` for a 1.0 → 1.1 upgrade.
- Emit catalog artifacts: `manifest.json`, `provenance.json`, `checksums.json`.
- Do NOT modify the existing 1.0.0 manifest, SDK, or CLI packages.

## Steps Taken

### 1. Typed Source

Created `catalog/modules/runory.customer/v1.1/src/module.ts` calling
`defineModule({ ... })` from `@runory/sdk`. The config includes:

- `id: "runory.customer"`, `version: "1.1.0"`, `coreCompatibility: ">=0.1.0"`.
- `objects[0].fields`: `name`, `email`, `phone` (carried over from 1.0.0) plus
  `industry` (select with 6 options) and `website` (text).
- `views`: `customer_list` (added `industry` column) and `customer_form`
  (added `industry` and `website` fields).
- `migrations.upgrade`: a `1.0.0 → 1.1.0` step pointing at
  `migrations/upgrade-from-1.0.sql` with `risk: "low"`.
- `extensionPoints`: `customer.list.columns` and
  `customer.form.basic_fields.after` slots, with `industry` and `website`
  added to `reservedKeys`.
- `dataOwnership: "workspace"`, `uninstallRetentionPolicy: "retain_data"`.

### 2. Migrations

- `migrations/install.sql`: creates `{{BUSINESS_TABLE_PREFIX}}customer` with the
  1.1 column set (`industry`, `website`) included.
- `migrations/upgrade-from-1.0.sql`: `ALTER TABLE ... ADD COLUMN industry` and
  `ADD COLUMN website`.

### 3. Package Wiring

- `package.json`: `name: "runory-customer-v1.1"`, `version: "1.1.0"`, depends on
  `@runory/sdk` and `@runory/contracts` via `workspace:*`.
- `tsconfig.json`: extends `../../../../tsconfig.base.json`, emits to `dist`.

### 4. SDK Pipeline (build test)

`packages/sdk-testing/src/build-customer-v11.test.ts` drives the build:

1. Imports the typed manifest.
2. `validateManifest(manifest, "module")` — expects `valid: true`.
3. `scanForSecrets(manifestJson)` — expects zero findings.
4. `compileManifest(manifest)` — expects a SHA-256 checksum and provenance.
5. Writes `manifest.json`, `provenance.json`, `checksums.json`,
   `validation-summary.json` to `catalog/modules/runory.customer/v1.1/dist/`.
6. Asserts the 1.1 additions (`industry`, `website`) are present in the
   compiled manifest and that `version` is `1.1.0`.

### 5. Upgrade Harness (upgrade test)

`packages/sdk-testing/src/customer-upgrade.test.ts` uses `ModuleTestHarness`
to simulate a 1.0 → 1.1 upgrade:

1. `setup()` — fresh harness with the 1.1 manifest.
2. `installPack(workspaceId, "crm-lite-pack")` — installs the 1.0 pack.
3. `seedRecords("customer", ...)` — seeds 3 customer records.
4. `applyExtension(tierExtensionPlan)` — applies a workspace extension
   (`tier`, select).
5. `planUpgrade("1.1.0")` — expects `compatible: true`.
6. `assertDataPreserved("customer", 3)` — all 3 records survive.
7. `assertExtensionPresent("tier")` — extension field still present.
8. `assertPermissionBoundary()` — 3 `module_owned` fields + 1
   `workspace_extension` field.
9. `cleanup()`.

## Artifact Details

Location: `catalog/modules/runory.customer/v1.1/dist/`

| File | Value |
| --- | --- |
| `manifest.json` | Compiled manifest, 1.1.0, with `industry` + `website` |
| `provenance.json` | `sdkVersion: "0.1.0"`, `manifestSchemaVersion: "1.0.0"` |
| `checksums.json` | `manifest` SHA-256: `fa5db0cfc77e033ade9efb5ac17b6c906ed17ebab3de22bceda25e30da196dc2` |
| `validation-summary.json` | `valid: true`, zero issues |

Checksum (SHA-256):

```
fa5db0cfc77e033ade9efb5ac17b6c906ed17ebab3de22bceda25e30da196dc2
```

## Test Results

```
pnpm --filter @runory/sdk-testing test

 ✓ src/customer-upgrade.test.ts (5 tests) 100ms
 ✓ src/build-customer-v11.test.ts (6 tests) 5ms

 Test Files  2 passed (2)
      Tests  11 passed (11)
```

```
pnpm typecheck

 apps/mcp typecheck: Done
 packages/contracts typecheck: Done
 packages/sdk typecheck: Done
 packages/platform-core typecheck: Done
 apps/cli typecheck: Done
 packages/sdk-testing typecheck: Done
 apps/cloud typecheck: Done
```

## Findings

- The SDK `defineModule` → `validateManifest` → `compileManifest` pipeline is
  sufficient to produce a catalog artifact without hand-writing YAML.
- `ModuleTestHarness` covers the upgrade-critical invariants: data preservation,
  extension survival, and the module_owned vs workspace_extension permission
  boundary.
- The Zod schema applies defaults for `dataOwnership` and
  `uninstallRetentionPolicy`; the typed source still declares them explicitly so
  the input matches the inferred `ModuleManifest` type without relying on
  schema defaults at authoring time.
- Node v25 native TS execution cannot resolve the SDK's internal `.js`
  extension imports without a loader, so the build is driven through vitest
  (which handles TS natively) instead of the CLI's direct `node` invocation.
  This does not affect the artifact output.

## Conclusion

Release Blocker #13 is satisfied. The `runory.customer` 1.1.0 catalog artifact
is authored via the SDK typed source, validated, tested through the upgrade
harness, and built into `dist/` with a SHA-256 checksum and provenance record.
The existing 1.0.0 manifest, SDK, and CLI packages were not modified.
