# Runory SDK Product Definition and Developer Experience

Status: Approved v1.0
Date: 2026-06-22
Scope: Official/Internal Module SDK for v0.1; public ecosystem foundation for later releases
Related: [sdk/module-sdk.md](sdk/module-sdk.md), [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md)

## 1. Purpose

This document elevates the Runory SDK from a "Manifest and Module specification document" into a clearly defined developer product. It defines its positioning, package boundaries, local development loop, Cloud Catalog interface, testing tools, Agent Skill, and phased implementation scope.

Core objective:

> Developers and engineering Agents can use typed contracts locally to create, validate, and test Modules/Packs/Templates, then deliver immutable artifacts to the Runory Cloud Catalog for release governance.

## 2. Positioning

Runory SDK is a **Business Capability Platform SDK**. It is not a generic REST API client, and it is not the SaaS Core SDK.

```text
Runory SaaS Core
  Identity / Tenant / Billing / Audit / Quota

Runory Platform Runtime
  Object / View / Workflow / Extension / Module Lifecycle

Runory SDK
  Define / Validate / Test / Build / Publish platform capabilities

Runory Business Capability
  Module / Pack / Template / Workflow / Agent Skill
```

The SDK's development outputs are Module, Pack, and Template artifacts, as well as Workflow/Agent Skill declarations, validation, and test evidence.

The SDK is not responsible for:

- User login, Organization, or Billing.
- Direct access to customer databases.
- Executing business writes by bypassing the Business Engine.
- Running arbitrary developer code in a Workspace.
- Replacing Catalog Release approval.

## 3. Reference Pattern and Independent Direction

WaniWani's public SDK demonstrates an effective platform pattern: an open-source typed runtime can run independently without a Cloud key, connect to an optional Hosted Platform after configuration is provided, use a CLI to connect local projects to a Cloud Playground, and use an Agent Skill to help Coding Agents understand the development framework.

Runory adopts the following patterns:

1. The SDK itself is an installable and testable product, not just documentation.
2. Local development does not depend on Cloud; Cloud provides Registry, validation, release, and observability.
3. The CLI shortens the local → sandbox → publish loop.
4. A typed deterministic runtime manages state, validation, branching, pause, and resume.
5. Testing harness, starter/template, and Agent Skill are formal SDK components.
6. The SDK runtime is decoupled from the hosted control plane.

Runory does not copy:

1. "Compile one Flow into one MCP Tool" as the Module model.
2. MCP Funnel as the default business capability abstraction.
3. Chat Widget as Runory's default entry point.
4. Arbitrary JavaScript sandbox execute as the business operation path.
5. Implicitly changing production Module behavior through environment variables.

References:

- [WaniWani SDK](https://github.com/WaniWani-AI/sdk)
- [WaniWani CLI](https://github.com/WaniWani-AI/cli)
- [MCP Distribution Template](https://github.com/WaniWani-AI/mcp-distribution-template)

## 4. Target Personas

### v0.1

- Runory official Module engineers.
- Runory platform engineering Agents.
- Release/CI pipeline.

### Later

- Certified partners and integrators.
- Third-party Module developers.
- Private/Local Runtime customer engineering teams.

The public SDK ecosystem, third-party publishing, and Marketplace onboarding do not block v0.1; the Official/Internal toolchain must be included in v0.1.

## 5. Product Components

### 5.1 `@runory/sdk`

Public contracts and authoring API:

```text
defineModule
definePack
defineTemplate
defineObject / defineView / defineWorkflow
defineAgentSkill
manifest schemas and inferred types
artifact metadata contracts
```

### 5.2 `@runory/sdk-testing`

Deterministic testing tools:

```text
createModuleTestHarness
createFixtureWorkspace
installArtifact
upgradeArtifact
assertObjectSchema
assertPermissionBoundary
assertExtensionCompatibility
replayWorkflow
```

### 5.3 `@runory/cli`

v0.1 local and CI command adapter:

```text
runory validate
runory test
runory build
runory publish --channel internal
```

Future extensions:

```text
runory init
runory login
runory connect
runory dev
runory diff
runory release plan
```

### 5.4 Runory Module Skill

The Agent Skill teaches Coding Agents:

- Module/Pack/Template boundaries.
- Manifest and typed authoring API.
- Object/View/Workflow/Extension Point design.
- validation/test/build/publish flow.
- Security, data ownership, and migration rules.
- Catalog release and human approval boundaries.

The Skill provides knowledge and process; it does not provide unauthorized credentials or release bypasses.

### 5.5 Starter

```text
module/
├─ runory.config.ts
├─ src/module.ts
├─ migrations/
├─ fixtures/
├─ tests/
├─ docs/
└─ package.json
```

The Starter targets Official/Internal Modules; third-party publishing templates are deferred.

## 6. Authoring Model

### 6.1 Typed Definition

Target API shape:

```ts
import { defineModule } from "@runory/sdk";

export default defineModule({
  id: "runory.customer",
  version: "1.1.0",
  coreCompatibility: ">=0.1.0 <0.2.0",
  objects: [
    {
      key: "customer",
      label: "Customer",
      fields: [
        { key: "name", type: "text", required: true },
      ],
    },
  ],
  permissions: ["customer.read", "customer.write"],
  migrations: {
    install: "migrations/install.sql",
    upgrades: [
      { from: "1.0.0", to: "1.1.0", path: "migrations/1.0.0_to_1.1.0.sql" },
    ],
  },
});
```

This API is the typed authoring facade for the Manifest. The build output must generate a canonical Manifest; Runory Runtime and Catalog treat the canonical artifact as the source of truth and do not directly execute TypeScript authoring code.

### 6.2 Declarative First

Prefer data declarations: Object, Field, Relation, View, Form, Dashboard slot, Permission, Event, Action, Workflow, Agent Skill metadata, and Migration reference.

The SDK does not allow Modules to carry arbitrary React/Node code and dynamically execute it in the multi-tenant Runtime. Controlled custom component/runtime extensions can only be introduced after an independent security specification is created.

### 6.3 Canonical Output

```text
Typed source
→ compile/normalize
→ canonical manifest
→ validation
→ tests
→ immutable artifact
```

The same source, SDK version, and build inputs must produce equivalent canonical output.

## 7. Local Development Contract

The SDK's local capabilities do not depend on Runory Cloud:

- Validate schemas and references.
- Resolve local dependency fixtures.
- Create a temporary SQLite fixture Workspace.
- Run install/upgrade migrations.
- Render schema/view snapshots.
- Run compatibility and permission tests.
- Build artifact and checksums.

Cloud connectivity is only used to publish artifacts, run Remote Sandbox validation, perform Release/rollout operations, and collect operational metrics. Passing local tests does not mean a Stable release can be published; Cloud Catalog validation and Release Manager approval still apply.

## 8. Configuration

Recommended project configuration:

```ts
import { defineConfig } from "@runory/sdk";

export default defineConfig({
  itemType: "module",
  entry: "src/module.ts",
  migrations: "migrations",
  fixtures: "fixtures",
  tests: "tests",
  targetCore: ">=0.1.0 <0.2.0",
});
```

Principles:

- Project configuration can be committed to Git.
- Token, API key, and private registry URL do not go into configuration files.
- CI credentials are provided through `RUNORY_TOKEN` or future CI identity.
- SDK/CLI does not package local secrets into artifacts.

## 9. CLI Contract for v0.1

### `runory validate`

Runs authoring compile, canonical Manifest, SemVer/Core range/dependency, permission/data ownership, migration path/checksum, and Extension Point validation. Supports `--json`; CI does not parse human-readable logs.

### `runory test`

Runs empty Workspace install, previous Stable → candidate upgrade, fixture data preservation, Extension compatibility, and permission/UI schema snapshots.

### `runory build`

Generates:

```text
dist/<item-id>-<version>.tar.gz
dist/manifest.json
dist/provenance.json
dist/checksums.json
dist/validation-summary.json
```

Build does not publish, does not create a Release, and does not implicitly connect to Cloud.

### `runory publish --channel internal`

The POC only allows upload as a Catalog candidate/internal release request:

- Verify artifact checksum.
- Use an idempotency key.
- Output Catalog item/version/validation IDs.
- Do not allow the CLI to publish Stable directly.
- Stable promotion is still completed in Platform Catalog Console/governed command.

## 10. Testing Harness

Minimum API:

```ts
const harness = await createModuleTestHarness({
  coreVersion: "0.1.0",
  module: candidate,
  previous: stable,
});

await harness.install();
await harness.seed("fixtures/customer.json");
await harness.applyExtension("fixtures/customer-tier-extension.json");
const report = await harness.planUpgrade();
expect(report.status).toBe("compatible");
await harness.upgrade();
await harness.assertDataPreserved();
```

The Harness uses the Platform Runtime's real Installer/Migration/Compatibility code instead of reimplementing a separate testing-only semantic layer.

It must support deterministic fixture IDs/time, isolated temporary database, success/failure migration fixtures, structured report/snapshots, cleanup, and no network by default.

## 11. Deterministic Workflow Direction

The main inspiration Runory takes from a typed state graph is: LLMs are responsible for understanding and presentation, while the server-side state machine is responsible for sequencing, validation, permissions, branching, pause, and resume.

A future Workflow SDK may use:

```ts
defineWorkflow({
  id: "high-value-quote-approval",
  state: quoteApprovalSchema,
  steps: [...],
  transitions: [...],
  interrupts: [...],
  permissions: [...],
});
```

This applies to quote approval, customer onboarding, dispatching, and expense review. Workflow state must be persisted in Workspace scope, and every step must pass through the Business Engine and permission checks; LLMs cannot skip steps or bypass typed validation.

Complete Workflow authoring/runtime does not block v0.1; v0.1 only needs to preserve the Manifest contract and minimal testing interfaces.

## 12. Cloud Catalog Integration

```text
Developer / Agent
→ @runory/sdk authoring
→ @runory/sdk-testing
→ runory build
→ runory publish --channel internal
→ Catalog candidate
→ Cloud validation + Sandbox
→ human promotion
→ Workspace compatibility/install/upgrade
```

SDK, CLI, Catalog UI, and Catalog Agent eventually call the same domain commands. There is no SDK-only publishing bypass.

## 13. Agent Development Experience

After reading the Runory Module Skill, an Agent can scaffold Modules, modify typed definitions, generate migration proposals, run validation/test/build, explain compatibility failures, generate release notes, and submit Internal candidates.

The following operations must stop and request human handling:

- Permission expansion approval.
- Breaking schema/data migration.
- Stable promotion.
- Rollout to all eligible Workspaces.
- Security withdrawal.

Agent output must reference real validation/test IDs and must not merely claim in natural language that "tests passed."

## 14. Package and Dependency Boundaries

Recommended workspace packages:

```text
packages/contracts       canonical schemas and transport-neutral types
packages/sdk             public authoring facade and artifact compiler
packages/sdk-testing     fixture harness and assertions
packages/platform-core   private runtime/services/repositories
apps/cli                 command adapter
skills/runory-module     agent development instructions
```

Dependency direction:

```text
contracts ← sdk ← module source
contracts ← sdk-testing → public runtime test adapters
contracts ← platform-core
sdk/cli must not import private repositories or database clients
```

Avoid publishing `platform-core` directly as the SDK. Public contracts and private runtime implementation must remain separate.

## 15. Versioning and Compatibility

- SDK uses SemVer.
- Canonical Manifest has an independent `manifestSchemaVersion`.
- Artifact records SDK/compiler version.
- Module declares Core compatibility.
- SDK minor versions should not produce breaking manifest output without migration notes.
- CLI must report the compiler version it uses.
- Before 1.0, rapid evolution is allowed, but pinned versions and lockfiles must support reproducible builds.

## 16. Security

- Build/validate has no network by default.
- Artifact builder uses allowlisted source paths and rejects path traversal.
- Secret scanner prevents `.env`, tokens, and private keys from entering artifacts.
- Tests use isolated databases; Cloud migration uses a controlled runner.
- Publish credentials are not exposed to Module code, fixtures, or Agent output.
- Artifact checksum and provenance must match the Catalog validation result.
- SDK telemetry is disabled by default; if enabled in the future, it must be explicit opt-in and must not upload business fixtures/data.

## 17. v0.1 Required Scope

Blocking for Cloud `v0.1.0`:

1. `@runory/sdk` canonical typed Manifest contracts.
2. `runory validate` with structured JSON result.
3. `runory test` install/upgrade/Extension fixture harness.
4. `runory build` immutable artifact/provenance/checksum.
5. `runory publish --channel internal` or an equivalent CI adapter.
6. Official Customer 1.1 artifact is generated by this toolchain, not manually assembled.
7. SDK/CLI outputs can enter the Catalog CR0–CR2 flow.
8. Runory Module Skill can guide Agents through the same flow.

Not blocking v0.1:

- Public npm release.
- Complete `runory init/login/connect/dev` interactive experience.
- Third-party starter/onboarding.
- Hosted Playground.
- Complete Workflow builder.
- Public Marketplace publish.

## 18. Implementation Plan

### SDK0 — Contract Separation

- Clearly define canonical public schemas from `packages/contracts`.
- Add `manifestSchemaVersion`, compiler metadata, and upgrade graph.
- Create `packages/sdk`; it must not export private DB/runtime.
- Minimal `defineModule/definePack/defineTemplate/defineConfig` facade.

Exit: Existing YAML Catalog can compile into the same canonical Manifest as typed source; legacy Catalog contract tests pass.

### SDK1 — Validate and Build

- Artifact compiler, canonical serializer, checksum, and provenance.
- Secret/path safety.
- CLI `validate/build --json`.
- Deterministic/reproducible build tests.

Exit: The same input produces equivalent checksums; Customer 1.1 artifact passes local validation.

### SDK2 — Testing Harness

- Temporary Workspace fixture.
- Real Installer/Migration/Compatibility adapters.
- Install/upgrade/data preservation/Extension conflict assertions.
- CLI `test --json`.

Exit: Catalog POC positive/negative cases can be replayed in local CI.

### SDK3 — Internal Publish Adapter

- Authenticated CI upload.
- Idempotent candidate import.
- Validation result polling/output.
- CLI `publish --channel internal --json`.
- Forbid direct Stable publish.

Exit: Customer 1.1 moves from build artifact into a Cloud Catalog candidate without manual file copying.

### SDK4 — Developer Experience after v0.1

- init/login/connect/dev/diff.
- Hot-reload local fixture Workspace.
- Public docs/starter/npm packages.
- Partner/third-party onboarding.
- Richer Workflow authoring and replay tools.

## 19. Acceptance Matrix

| ID | Acceptance | v0.1 |
| --- | --- | --- |
| SDK-01 | SDK public surface does not expose Platform DB/repository | Required |
| SDK-02 | Typed source compiles into canonical Manifest | Required |
| SDK-03 | validate/test/build provide machine-readable output | Required |
| SDK-04 | Build is reproducible and artifact checksum is verifiable | Required |
| SDK-05 | Secret/path escape negative tests pass | Required |
| SDK-06 | Harness uses real runtime adapters | Required |
| SDK-07 | Customer 1.0 → 1.1 fixture verifies data and Extension | Required |
| SDK-08 | Internal publish is idempotent and cannot publish directly to Stable | Required |
| SDK-09 | Agent Skill references real commands/evidence | Required |
| SDK-10 | validate/test/build can run without Cloud | Required |
| SDK-11 | Public npm/third-party onboarding | Deferred |
| SDK-12 | Full deterministic Workflow builder | Deferred |

## 20. Definition of Complete

The Runory SDK v0.1 internal toolchain is complete only when all of the following are true:

1. The SDK is a real package/API/CLI/test harness, not just a Markdown specification.
2. Official Modules use the same typed contract and build pipeline.
3. Local validate/test/build has no Cloud dependency.
4. Cloud publish only creates candidate/internal requests and does not bypass release governance.
5. Artifacts are reproducible, checksummed, secret-free, and linked to source/build identity.
6. The testing harness covers install, upgrade, data preservation, and Extension compatibility.
7. Agents can use the toolchain through the Skill, but cannot approve Stable releases.
8. The Catalog POC Customer 1.1 artifact is produced end-to-end by the SDK toolchain.
