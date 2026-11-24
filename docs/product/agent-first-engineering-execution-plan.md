# Agent-first Engineering Execution Plan — FSM

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product` |
| Applies to | Current R&D batch, 2026-11-24 onward; bounded Reactive Repair / Callout |
| Owner | Product / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Authority: [Product Definition](product-definition.md) and [Agent-first Product Strategy and Delivery Contract](agent-first-product-strategy.md). Implements AF-01 through AF-07; supports [Product Roadmap](product-roadmap.md), [Self-hosted and Cloud Deployment Contract](../architecture/cloud-to-local-workspace.md), and [v0.9 Execution Plan](v0.9-repeatable-delivery-execution-plan.md). This is a work plan, not implementation or release evidence. Do not create a new version family or relax existing gates merely to execute this plan.

## 1. One objective and one reference scenario

**Runory — Field Service Operating System for the Agent Era.**

The immediate R&D result is that an external Agent, given a field-service need, can find Runory, evaluate its fit, obtain a supported release, independently install it or provision Cloud, assemble and adapt a solution, run real business actions, verify the result, and maintain it. All work either improves this chain, accumulates reusable FSM business assets that serve it, or satisfies a binding correctness/safety gate. WordPress is the reference for simple distribution, autonomous ownership and customization, not domain expansion.

Start with one maintained Reactive Repair / Callout reference solution using the existing FSM and Sales Quote Packs. The initial benchmark is:

```text
fresh authorized environment
→ install and initialize without developer bypass
→ compose FSM and Sales Quote capabilities
→ configure roles, service/price book, forms and one supported customer variation
→ create customer/site and repair request context
→ draft, calculate, approve and accept Quote
→ convert to Work Order, assign and schedule Visit
→ technician opens assigned work, submits field evidence
→ supervisor reviews/returns or accepts, completes work
→ issue Invoice, inspect settlement status and customer-facing document
→ verify records, audit and permission boundaries
→ restart, backup, restore, compatible upgrade
```

Use synthetic records and approved local/non-production environments. The first independent candidate must not require a real telephone number, real card payment, Stripe onboarding, real messaging, or an external model account. Test merchant/provider flows separately under their existing acceptance requirements; do not misrepresent a fixture or unpaid Invoice as live payment success. Quote review and execution-handoff consistency remains the selected commercial-validation slice ([RQH plan](repair-quote-review-and-handoff-plan.md)); it is a business-depth increment and should consume the shared Agent execution interfaces, not block the first usable existing FSM demonstration.

## 2. Source baseline and implementation gaps

Current execution evidence: [B0 source baseline and first candidate boundary — 2026-11-24](../releases/agent-first-b0-baseline-2026-11-24.md). B1 engineering candidate entry: [Self-hosted packaging](../../deploy/self-host/README.md). These are not completed batch or release claims.

Source inspection: [main at 4575360ed7382821d1945908093565ce44635bd4](https://github.com/franksunye/runory/tree/4575360ed7382821d1945908093565ce44635bd4), 2026-11-24. Repository is public; GitHub Releases listing returned no releases at review time. This is not a full runtime audit, a live site verification, or an assertion that no distribution exists anywhere else.

| Capability | Existing source evidence | Gap / immediate action |
| --- | --- | --- |
| Public discovery | [README](../../README.md), website metadata, [llms.txt route](../../apps/cloud/src/app/llms.txt/route.ts), [existing Skill](../../skills/runory-smb-poc/SKILL.md) | Repository description and Skill still carry broad/older product wording; llms.txt includes installation-service examples outside the initial scope. Align to FSM positioning and actual supported release, prerequisites and use cases; verify published URLs rather than hard-code a guessed canonical domain. |
| Distribution | [Cloud package scripts](../../apps/cloud/package.json), [Next configuration](../../apps/cloud/next.config.ts), [CLI](../../apps/cli/src/index.ts) | Root listing has no Docker/Compose package; CLI primarily implements manifest validate/build/publish and a test helper, not installation/operations. No verified independent product artifact established. |
| Runtime and identity | [Platform config](../../packages/platform-core/src/platform-config.ts) distinguishes cloud/local; [auth](../../apps/cloud/src/lib/auth.ts), existing email OTP and API key flows | Local development is not production install. Prove secure initialization and ongoing owner/member login, scoped Agent credentials, local entitlements, persistent data and files without dev bootstrap or mandatory Runory Cloud. |
| Scheduling and health | [Cron coordinator](../../packages/platform-core/src/cron-coordinator.ts), [Cloud cron config](../../apps/cloud/vercel.json), [health route](../../apps/cloud/src/app/api/health/route.ts) | Reuse leased timer implementation; provide a real independent scheduler and verify outbox/recovery. Current HTTP health route reports a basic service/build identity, not complete independent readiness. |
| Provisioning / customization | [Platform provisioning route](../../apps/cloud/src/app/api/platform/provision/route.ts), existing Extensions and Pack install, compatibility/diff/diagnostics | Existing platform provisioning requires platform administrator authority. Do not expose platform-admin power to a customer Agent. Verify least-privilege owner setup, installed capability closure and supported configuration/extension workflow. |
| Agent business execution | [MCP server](../../apps/mcp/src/server.ts) registers 21 tools for workspace/Pack, schema, extension, workflow/automation inspection, audit and generic records; existing workspace HTTP named-command route covers Quote, Work Order, Visit, assignment, schedule, forms, approval/work items and Invoice | Expose authorized, discoverable typed business commands using existing server paths and contracts. An API handler is not automatically a fully verified Agent action. Inspect per-command permission, request schema, expected version, idempotency, outcomes and supported actor restrictions; fix gaps rather than inventing a second business API. |
| Business assets and applications | [FSM Pack](../../catalog/packs/fsm-pack/manifest.yaml) and [Sales Quote Pack](../../catalog/packs/sales-quote-pack/manifest.yaml) share Company/Contact and Payment modules; existing role groups and mobile navigation; G1/G2 fixtures and Command tests | Reuse official modules and shared object ownership, test one composed reference solution and role-separated business tasks. Do not revive retired quote_approval module or build a new survey/dispatch runtime. |
| Maintenance and release | [Release hardening](../operations/release-hardening-2026-11-24.md), [backup/restore runbook](../operations/backup-restore-runbook.md), [Release Gate](../../.github/workflows/release-gate.yml) | Current source includes database recovery, persistent attachments and upgrade snapshot safeguards. Separate independent installation/recovery tests from Cloud provider/live deployment checks; a database-only backup is not a full recoverable instance. |

Existing release-hardening and Cloud acceptance have priority for defects affecting correctness/security. The 2026-11-24 operations record identifies unresolved external acceptance, including Cloud scheduler plan compatibility, real email, attachment storage and provider checks. Recheck current evidence before publishing; do not couple the independent distribution schedule to Cloud account, payment/provider or customer-cohort waiting.

## 3. Implementation batches

Run AF-01 first; AF-02/03/04 may proceed in parallel once the corresponding baseline and interface boundaries are known. AF-05 runs against the same reference journey throughout. Integrate in small tested increments on the maintained main lineage; the batch boundary is an acceptance outcome, not an elapsed-time promise. Product owns scope and benchmark; Engineering owns contracts, implementation, tests; Operations owns artifact/release verification and documented deployment support.

| Batch | Work IDs | Deliverable / exit |
| --- | --- | --- |
| B0 — Truth and benchmark | AF-01 | Pinned capability/dependency inventory; first supported profile; role/action matrix and initial neutral Agent discovery evidence. Identify blockers with code/test references and classify implemented, verified, unsupported or untested. |
| B1 — Installable product | AF-03, initial AF-02 | One downloadable, reproducible candidate; clean setup, normal owner login, FSM composition and first usable role task on a fresh host. Public documentation accurately reports candidate status. |
| B2 — Agent operates FSM | AF-04, AF-05 | Agent completes the reference workflow via named actions and supported configuration; corresponding human role applications show the same authoritative result; denial, retry and version cases pass. |
| B3 — Repeatable delivery | AF-06, AF-05 | Two scope-matched configurations, full recovery and compatible upgrade, zero customer-specific forks; independent Agent install/operation acceptance. Continue the RQH slice and business depth where it benefits the reference solution. |
| B4 — Discover and adopt | AF-02, AF-07 | Publish verified release and distribution guidance through approved channels; repeat unseeded selection and seeded Self-hosted and Cloud tests, verify one authorized Cloud reference journey and document any supported migration direction. |

B1 is an engineering candidate, not production-ready simply because it boots. B3 recovery/upgrade and all applicable safety gates must pass before supported production publication. Initial B0 discovery baseline and B1 candidate publication of truthful documentation need not await the final B4 benchmark. Commercial validation continues in parallel and does not stop bounded R&D.

### AF-01 — inventory and acceptance matrix (P0, first work)

- Inspect configuration and dependency paths: database, file store, mail/identity, entitlement, catalog, workflow timer/outbox, build-time release backup, environment and external providers. Confirm exact first profile; candidate is single-instance Linux amd64 Docker Compose, existing Node/Next build and local SQLite via libSQL, local persistent storage, one scheduler. Validate on a real compatible isolated host; no other OS/architecture/database promise.
- Build a source-to-business-task matrix: installed Module/Pack, authoritative object, named command/API, permissions/actor and required input, desktop/mobile/customer surface, current test and maturity. Identify existing fixtures and mandatory missing steps. Reuse the [GA normalized-job definition](v1.0-ga-release-goal.md), not raw feature counts.
- Run initial seeded technical smoke and unseeded discovery benchmark with available independent Agent tooling. If tooling cannot perform a real independent session, record blocked/untested, not a fabricated result. Capture source SHA, environment, actual failures and exact scope.
- Confirm the first executable batch list; do not spend a full cycle creating architecture diagrams or an inventory application. Maintain this plan and dated evidence records using existing documents.

### AF-03 — minimal independent distribution (P0)

1. Package a pinned production application and bundled migrations/Catalog/Pack artifacts from the same main SHA. Choose the simplest verified image/Compose plus release bundle; no source checkout, package-manager build, or development server required by the installer. Use existing runtime and resource sync paths. Separate Cloud release-backup requirements from independent startup without bypassing required backups before upgrade.
2. Implement preflight and safe one-time owner enrollment; validate secure ongoing login for owner and ordinary members, workspace membership and role assignment, Agent credential issuance/revocation with explicit scopes. Reuse normal authentication and identity contracts, not DEV OTP, trusted-header bypass or demo persona. Select the smallest supported identity/mail setup in AF-01; do not invent a second general identity platform. Do not expose credentials in logs or installer output beyond explicitly secure initial provisioning.
3. Set explicit persistent DB/attachment paths, owner-controlled secrets and isolated internal scheduler. Reuse leased workflow-timer and existing outbox mechanisms; exercise timer firing, retries and restart recovery. Absent optional providers must be visibly disabled/unconfigured. Core tasks cannot require a Runory Cloud login, SaaS subscription or live Catalog lookup for bundled assets.
4. Provide start/stop, status, preflight, diagnostics, initialization and supported install instructions with machine-readable results and exit codes. Use the existing CLI or simple supported deployment commands; do not build another CLI framework. Health must report meaningful readiness (migrations, packaged catalog, storage, scheduler, installed version) and distinguish it from mere HTTP availability. Safe loopback/local default; external access/TLS requires explicit documented configuration.
5. Produce immutable release metadata (version, SHA, artifact digest/checksum, dependencies and applicable license, supported profile, installation instructions and known limits), release-gate evidence and candidate notes. GitHub Releases plus an immutable OCI image is a candidate distribution path, not a claim it already exists. No automatic production deployment or provider resource creation.

### AF-04 — complete the external-Agent interface (P0)

Use the existing Command architecture, HTTP API, authorization and installed Command Contracts. Choose the lowest-complexity design: capability discovery returning supported installed actions and typed input/outputs, plus bounded named-action invocation through the existing authorized execution path. Do not hand an Agent unrestricted SQL, generic HTTP proxy or arbitrary platform-admin scope. Expose only reviewed operations and their schemas/conditions; generated declarations must match actual command availability, provider dependencies and actor restrictions. Where an existing API action remains legacy, audit its invariants and upgrade the contract where necessary rather than claiming all actions are already hardened.

| Role task | First coverage increment |
| --- | --- |
| Admin / implementation | Inspect actual version, workspace and installed capabilities; compose Pack/reference solution under authorized owner or explicit provisioning; configure form/field and supported rule/approval variation; preview/apply and read-back; handle missing capabilities. |
| Sales / manager | Customer/site context, price-book lookup, Quote draft/lines/recalculate, submit/approve/return, accept and convert via existing commands. Different actors for material approval where policy requires. |
| Dispatcher | Work Order triage, Visit/assignment/schedule and reschedule through applicable existing commands; explicit conflict handling. |
| Technician | Inspect own work, travel/arrive, fill/submit required forms and evidence, submit/complete within actual assignment and actor policy. A human-only work-item policy stays human-only; use the technician UI for required human actions, do not widen Agent access to manufacture a PASS. |
| Supervisor / finance / customer | Review/return/accept evidence, complete Work Order, issue Invoice, inspect invoice/payment state and authorized customer documents. Provider-specific actions only in separately configured sandbox/live scopes. |

For every exposed write: validated input, current actor/Workspace, required permission and where appropriate assignment, expected version and idempotency, meaningful errors, audit and independent read-back. Confirmed action cannot become generic record update. Expose appropriate required human action instead of acting as another person. Use existing `server.test.ts`, `stdio.integration.test.ts`, G1 API and G2 browser coverage; add real MCP-to-HTTP-to-Runtime scenarios against isolated production-shaped environments. Verify revocation, cross-tenant denial, stale version, duplicate requests, forbidden status mutation, and failure recovery.

### AF-05 — durable FSM assets and usable roles (P0, continuous)

Continue the already scoped business-object, processing-logic and role-application backlog, prioritized by which reference tasks become incomplete, unreliable, or unnecessarily bespoke. The expected unit of investment is a complete role task + reusable Module/Command/UI component or configuration + regression cases. Keep the business model/permission semantics identical across Self-hosted, Cloud, human UI and Agent.

- Maintain customer/contact/site/asset, service/price book, Quote, Work Order, Visit/Assignment/Schedule, form submission/evidence, service report, Invoice and Payment relationships/lifecycles. Preserve single authoritative ownership.
- Close the referenced sales/dispatch/field/supervisor/finance and scoped customer journey; use the existing mobile PWA and shared role surfaces. Do not count an object definition or CRUD screen as a finished user task.
- Progress RQH-01 through RQH-07 under the separate [RQH plan](repair-quote-review-and-handoff-plan.md): evidence → review → human-approved scope → version-consistent execution handoff. Prioritize reuse, scoped role work and evaluation; no broad autonomous diagnosis or learned dispatch project.
- Each implementation leaves versioned assets in the owning Module/Pack/Template/Extension, supported interface and relevant acceptance tests. Use the second configuration to decide which differences become official capabilities, managed extensions or explicit unsupported scope.

### AF-06 — repeatability, recovery and upgrade (P1, release safety is binding)

Verify two same-scope repair configurations with different fields/forms, role settings and supported approval/handoff variation. Use existing Pack composition, configuration Diff, compatibility and upgrade tools; no Core or official-Module fork. Keep measured customization effort separate from provider/customer waiting. Do not use synthetic references to assert paid delivery economics.

Make a complete recoverable backup of the supported instance: database, attachments, installed artifacts/configuration and necessary secret-handling instructions, with version and integrity manifest. Restore to a separate fresh target, check records/relations/approvals/files/audit and application authorization; prove rollback or explicit database restore for failed migration and compatible upgrade. Simulate interruption, bad artifact and incompatible extension; report actual recovery limits. Reuse existing database snapshot and recovery work, not a second backup platform. Production data must not be used as a test fixture.

### AF-02 — distribution and discovery (P0, continuous)

Make the public source of truth accurate and useful **before** installation. Update repository description/README, official website documentation, existing llms.txt, Skills and supported release index. Verify actual production canonical URLs and indexing/access where publication is approved. Provide human-readable quick start plus versioned structured capability/release/compatibility information using existing manifests wherever possible. Show an example FSM solution, requirements, install/verification, MCP connection, customization, known limits and license. Do not promise unshipped artifact or unsupported trade. Keep old compatibility instructions explicitly dated; update them when the release changes.

Record unseeded discovery and selection before/after publication; query prompts must describe real field-service needs without naming Runory, and allow credible alternatives. Do not treat a preloaded Runory Skill, referral link or seeded test as discovery evidence. A public Agent ecosystem listing/Skill distribution is an optional next lever, not a prerequisite to independent installation or a reason to implement every Agent vendor's plugin.

### AF-07 — same solution on Cloud and controlled portability (P1)

Use existing Cloud workspace/provisioning path with normal owner authorization; verify equivalent FSM role outcomes and supported Agent actions on a non-production/authorized environment. No platform-admin keys handed to tenant Agents. Verify independent artifacts versus Cloud business behavior and maintain a supported deployment matrix. Migration directions require separate export/import and reconciliation of records, extensions, attachments and audit lineage; no live multi-master sync or implied full data portability. Do not wait for this entire work item to complete before accepting a bounded independent candidate.

## 4. Candidate acceptance and strategic benchmark

The initial thresholds below are engineering targets for the first supported reference, not measured facts or a promise to customers. Define exact fixture, host profile, target version, actors and stop conditions before running tests.

| Acceptance | Proposed target / evidence |
| --- | --- |
| Fresh install | Two clean, independent supported-host runs of the same verified artifact; both initialize and pass readiness and the first role task. Aim for ≤10 minutes from prepared host and locally available verified artifact to healthy Workspace; record image download time, host preparation and time to first usable FSM task separately. |
| Independent runtime | After obtaining artifacts, core reference tasks and local timers can run without Runory Cloud or external provider access; report any network prerequisites and optional degraded features. Real provider behavior is a separate gate. |
| Seeded Agent execution | At least two clean sessions on the supported profile with only official release/docs entry, no hidden project context. Both complete all agreed supported role/business tasks, including authorized configuration and required human handoffs; no undocumented manual technical intervention or source/DB mutation. |
| Correctness | All agreed mandatory task assertions pass via named Commands and corresponding UI/read-back. Cross-tenant, revoked key, wrong actor and stale/duplicate action negatives pass; audit/version/amount/state remain correct. |
| Customization | Two scope-matched reference configurations pass agreed tasks with zero customer-specific Core/official-Module source forks; record reused cases, configuration/Extension effort and remaining gaps. |
| Maintenance | Restart, complete backup + restore into a new environment, compatible upgrade and injected failure/explicit recovery pass; data, files, identity/permissions and custom behavior preserved. |
| Unseeded discovery | At least three independent neutral prompts (e.g. small plumbing repair, HVAC repair, waterproof repair) with search-capable Agent and supported criteria; record all choices, official-source retrieval, accuracy and reasons. Initial directional success is at least one justified Runory selection followed by a verified end-to-end delivery without seeding; a competing selection is evidence, not a reason to alter the prompt after the fact. Retain baseline and repeat with the same prompts after changes; do not claim statistical market share from this small sample. |
| Cloud | Separate authorized seeded run on the same scoped FSM journey; record real provider/device/customer requirements independently. |

For every run retain Agent/model version (if known), exact prompt, source links, artifact/SHA, profile, command/API and UI results, elapsed time, human approvals vs unplanned manual steps, actual cost when measurable, failures and redacted traces. Never store secrets, live personal data or customer production snapshots as test artifacts. Mark `PASS`, `FAIL`, `BLOCKED` or `NOT_RUN` per criterion. A green deterministic G1/G2 suite, seeded technical PASS, unseeded discovery, custom-project economics, and Cloud commercial/GA validation are distinct evidence.

The existing [G0–G5 mapping](../releases/v0.9-e2e-gate-remapping-2026-07-31.md), [Release Gate](../../.github/workflows/release-gate.yml), [Cloud GA contract](v1.0-ga-release-goal.md) and security/provider approval requirements remain in force. No release claim based on a docs commit or passing installer test alone. No production data writes or actual provider activation for these development benchmarks without separately authorized scope.

## 5. Start order and scope control

Start B0 and fix any security/release regression first. Then deliver B1 and B2 in the smallest useful increments, retaining the same source lineage. A batch is not complete unless its outcomes are independently evidenced and the next batch can consume the released or pinned assets. Report what the Agent can now do that it could not before, what reusable FSM asset was added, exact SHA/test status, unresolved issues, and the next highest-priority blocker. Use dated release/evidence records instead of retroactively marking historical work as complete.

Defer proprietary Agent development, general app builders, new business domains outside FSM, advanced dispatch optimization without data, every provider/integration, broad public marketplace, desktop-native wrapper, Kubernetes/universal installer, and full two-way data sync. Continue existing release/safety work and scoped FSM product assets while real-customer feedback is pending. Prioritize by the contribution to the Agent-led FSM delivery chain; avoid a second runtime, duplicated business objects, speculative generic engines or customer forks.

