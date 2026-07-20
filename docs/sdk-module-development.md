# SDK / Module Development

The Runory SDK lets you author typed module/pack/template manifests, validate them, build reproducible immutable artifacts, and publish candidates to the catalog. This page covers the SDK, the module development workflow, the manifest format, validation, building, publishing, and the dev catalog seed workflow.

For a deeper SDK reference, see [docs/sdk/module-sdk.md](./sdk/module-sdk.md). For the pack/module model, see [Packs and Modules](./packs-and-modules.md). For connecting Agents to operate a workspace, see [MCP / Skill Usage](./mcp-skill-usage.md).

For lifecycle or invariant-changing mutations, follow
[Add a Governed Command](./sdk/governed-command-development.md), which includes
the tested Manifest template, generated Contract checks, and the
aggregate-versus-Provider decision rule.

## Where the SDK lives

| Package | Path | Purpose |
| --- | --- | --- |
| `@runory/sdk` | `packages/sdk` | Typed manifest authoring, validation, compilation, secret scanning |
| `@runory/contracts` | `packages/contracts` | Shared Zod schemas (extension plans, manifests, API contracts) |
| `@runory/sdk-testing` | `packages/sdk-testing` | Fixture-based install/upgrade harness using real runtime adapters |
| `@runory/platform-core` | `packages/platform-core` | Runtime (catalog, installer, extensions, audit) — not part of the public SDK surface |

The SDK exposes a small public surface:

```ts
// packages/sdk/src/index.ts
export { defineModule, definePack, defineTemplate, defineConfig, type SdkConfig } from "./define.js";
export { compileManifest, type CompiledArtifact } from "./compiler.js";
export { validateManifest, type ManifestValidationResult, type ValidationIssue } from "./validate.js";
export { scanForSecrets, type ScanResult } from "./secret-scanner.js";
```

The public SDK surface does **not** expose the Platform DB or repository internals.

## The module development workflow

```text
author typed source (defineModule)
  → runory validate
  → runory test (fixture-based, @runory/sdk-testing)
  → runory build (immutable artifact + checksum + provenance)
  → runory publish --channel internal
  → Platform Catalog Console promotes Internal → Beta → Stable
```

Authoring uses the typed `defineModule` / `definePack` / `defineTemplate` helpers. The CLI (`apps/cli`) provides `validate`, `test`, `build`, and `publish` commands. `validate`, `test`, and `build` run without a Cloud connection — useful for CI.

## The manifest format

A module manifest declares objects, fields, views, forms, permissions, workflows, agent skills, migrations, and UI slots. A pack manifest references modules with version ranges and adds a template, dashboard layout, onboarding checklist, and optional permission groups.

Modules that own governed lifecycle changes also declare `domain.aggregates`
and `domain.commands`. A Command Contract names the legal transition,
permission, required atomic capability effects, emitted events, and
postconditions. It must reference semantic capabilities such as
`scheduling.complete_reservation`, never another Module's SQL or physical
tables. The validator rejects an incomplete provider closure before install or
release. See
[Contract-Driven Command Architecture](./architecture/contract-driven-command-architecture.md).

A pack manifest (see `catalog/packs/crm-lite-pack/manifest.yaml` for the real example) looks like:

```yaml
id: crm-lite-pack
name: CRM Lite Pack
version: 2.0.0
coreCompatibility: ">=0.1.0"
description: "Lightweight CRM — companies, contacts, deals, and tasks"
recommended: true

modules:
  - "runory.company:^1.0.0"
  - "runory.contact:^2.0.0"
  - "runory.deal:^1.0.0"
  - "runory.task:^2.0.0"

defaultTemplate: small-business-crm

terminology:
  - object: company
    label: Customer
    navigationLabel: Customers
    route: /companies

dashboard:
  defaultLayout:
    - zone: metrics
      widgets:
        - { module: runory.company, widget: company_total_metric, instance: default }

onboardingChecklist:
  - id: create-company
    label: "Create your first company"
    route: "/companies/new"

permissionGroups:
  - key: sales_admin
    label: "Sales Admin"
    permissions:
      - company.read
      - company.create
      - company.update
      - company.delete

marketplace:
  category: crm
  license: runory_official
  publisher: runory
```

Key fields:

- `id`, `name`, `version` — identity.
- `coreCompatibility` — semver range for the Platform Core.
- `modules` — module references with version ranges.
- `defaultTemplate` — the workspace experience entry.
- `terminology` — overlay that relabels shared objects without forking them.
- `dashboard.defaultLayout` — widget zones (metrics, trends, lists, activity).
- `onboardingChecklist` — guided next steps shown after install.
- `permissionGroups` — pack-aware permission groups (added in v0.3.6).
- `marketplace` — category, license, publisher.

## Validation

Validate a manifest against its type before building:

```bash
runory validate --entry src/module.ts --type module --json
runory validate --entry src/pack.ts --type pack --json
runory validate --entry src/template.ts --type template --json
```

`--json` produces machine-readable output for CI. Validation returns a `ManifestValidationResult` with `valid`, `summary` (errors/warnings counts), and per-issue `severity`/`path`/`message`. The CLI exits non-zero on validation failure.

## Building

Build compiles the manifest into an immutable artifact:

```bash
runory build --entry src/module.ts --type module --out dist --json
```

Build first validates, then scans for secrets, then compiles. The output directory contains:

- `manifest.json` — the compiled canonical manifest.
- `provenance.json` — build provenance.
- `checksums.json` — `sha256` manifest checksum.
- `validation-summary.json` — the validation result.

Builds are reproducible. If validation fails or the secret scan finds anything, build aborts with a non-zero exit.

## Publishing candidates

Publish submits a built artifact to the Cloud Catalog:

```bash
RUNORY_TOKEN=$TOKEN runory publish --channel internal --json
```

Important constraints:

- The CLI **only supports `--channel internal`**. It cannot bypass to Beta or Stable.
- `RUNORY_TOKEN` is required (a bearer token for the catalog API).
- `RUNORY_API_BASE` defaults to `http://localhost:3000`.
- Promotion from Internal → Beta → Stable happens in the Platform Catalog Console (`/admin`) and requires a human Release Manager approval for Stable.
- Publish is idempotent on `${manifest.id}@${manifest.version}`.

## Testing

The `runory test` command delegates to `@runory/sdk-testing`, a fixture-based harness that uses real runtime install/upgrade adapters (not mocks). Create a `tests/` directory with fixture-based tests for install, upgrade, and Extension compatibility.

```bash
runory test --pattern customer-upgrade
```

The harness verifies that migrations replay, data is preserved across upgrades, and Extensions remain compatible. This is the same evidence the catalog stores as a structured validation run.

## The dev catalog seed workflow

For local development, Runory seeds the catalog from the manifests in `catalog/packs/`. The seed endpoint registers the official packs, modules, and templates into the local catalog so a fresh workspace can install them.

```bash
# 1. Start the dev server (creates the DB and applies migrations lazily)
pnpm dev

# 2. Seed the catalog from catalog/packs/
#    (the platform seed route ingests manifests + demo-data.json)
curl -X POST http://localhost:3000/api/platform/catalog/seed
```

The seed is reproducible: it reads each pack's `manifest.yaml` and `demo-data.json`, registers the catalog items, and freezes the dependency locks. If a manifest changes, re-seed to refresh the local catalog. See [Troubleshooting](./troubleshooting.md) if the catalog appears empty after a fresh database.

## Current limitations (honest)

- The SDK is **private** (`@runory/sdk` is `private: true` in its package.json) during `v0.4`. Third-party module publishing is not yet open.
- `runory test` currently reports harness availability and delegates to `@runory/sdk-testing`; the full test-runner experience is still maturing.
- The SDK does not expose Platform DB/repository internals; all runtime interaction goes through the catalog and governed APIs.
- Stable promotion is a manual, human-approved step — there is no CLI path to Stable.

See [Release Notes](./release-notes.md) for the SDK maturity status per version.
