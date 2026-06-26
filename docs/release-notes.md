# Release Notes

This is the public changelog for Runory Cloud. Runory is in **Cloud Early Access / v0.4 public free preview**. Each section below states honestly what is stable, what is preview, and what is not yet available.

For the v0.1 release definition and acceptance matrix, see [v0.1.0 Cloud Early Access](./releases/v0.1.0-cloud-early-access.md). For concepts and terminology used here, see [Concepts](./concepts.md).

## v0.4.x — Public Free Launch (in progress)

`v0.4` is the first publicly usable free launch of Runory Cloud. It is not about adding more business packs or deeper runtime features — it is about making Runory usable by the expected first audience: English-first users, open-source-curious developers, SMB operators trying Cloud for free, and builders using MCP/Skill/Agent workflows.

### What ships in v0.4

- **English-first product UI.** English is the default and complete language; Chinese remains available for local demos. Shared components and dynamic object pages are i18n-complete; locale fallback always returns English.
- **Public website and documentation.** Home, Product, Packs, Open Source, Pricing, Docs, and Changelog pages. The docs index links to [Getting Started](./getting-started.md), [Concepts](./concepts.md), [Workspace Guide](./workspace-guide.md), [Packs and Modules](./packs-and-modules.md), [Agent Operations](./agent-operations.md), [MCP / Skill Usage](./mcp-skill-usage.md), [SDK / Module Development](./sdk-module-development.md), [Admin / Governance](./admin-governance.md), [Troubleshooting](./troubleshooting.md), and these release notes.
- **Free plan only.** No Stripe, no billing, no payment method. Fair-use limits may apply; paid plans will be announced before enforcement.
- **MCP / Skill / Agent Operations 1.0 (preview).** The Runory MCP server (`apps/mcp`) and CLI (`apps/cli`) connect external Agents to governed workspace APIs.
- **Canonical demo journey.** A new user can create a workspace, install an official pack, load demo data, use the workbench, perform a safe customization, and inspect audit.

### Iteration milestones

- **v0.4.0 — Foundation cleanup and architecture lock.** The dynamic object route shell `/w/[workspaceId]/[objectKey]` is the only default object page path. Legacy fixed object route wrappers were removed. Navigation API is current-only (no legacy array fallback). Local dev migration state is reliable.
- **v0.4.1 — English-first product UI.** Workspace shell, dashboard, pack install, dynamic object pages, customize/extension surfaces, workflows, automations, errors, request IDs, empty states, and toasts are English-complete.
- **v0.4.2 — Website and documentation launch surface.** Public pages and this documentation set.
- **v0.4.3 — Free onboarding and canonical demo journey.** Clear onboarding path, visible free-plan boundaries, reliable install/demo data, dashboard next-step guidance.
- **v0.4.4 — MCP / Skill / Agent Operations 1.0 and release gate.** The **stable MCP interface** ships here. Operation schemas documented; the agent can inspect, plan, preview, apply, verify, audit, and roll back.

### Stable vs preview in v0.4

| Area | Status |
| --- | --- |
| Email OTP auth, sessions, RBAC | Stable |
| Organization/Workspace tenancy, tenant isolation | Stable |
| Pack install from Stable catalog, demo data | Stable |
| Dynamic object route shell, schema-driven UI | Stable |
| Managed Workspace Extensions (plan/preview/apply/rollback) | Stable |
| Audit trail, API keys, export, trash/restore | Stable |
| English-first UI | Stable |
| MCP server and external Agent operations | Preview (stable in v0.4.4) |
| SDK / module development | Private/preview |
| Paid billing, Stripe | Not available |
| Enterprise SSO (OIDC/SAML/SCIM) | Not available |
| Private/on-premise production delivery | Not available |

### Non-goals for v0.4

Stripe, paid subscription plans, invoice/payment collection, enterprise SSO, SOC 2 claims, multi-region compliance claims, official marketplace monetization, and a large-scale partner program are explicitly excluded.

## v0.3.x — Runtime and Experience

`v0.3` delivered the runtime experience and i18n foundation that v0.4 builds on.

### What shipped

- **i18n infrastructure.** `LocaleProvider` with `{param}` interpolation, 306+ message keys (`en` + `zh`). All 13 shared components migrated (SchemaForm, SchemaTable, SchemaField, NavigationShell, EarlyAccessBanner, ObjectListPage, ObjectDetailPage, ObjectCreatePage, WidgetRenderer, DashboardEditMode, ExtensionPanel, AddFieldWizard, AuditTimeline). `formatRelativeTime` unified into SchemaTable.
- **Runtime experience.** Metadata-driven object runtime, workflow runtime, event system, and audit. Module lifecycle, extension boundary, and agent permission boundary.
- **Dynamic routes.** The dynamic object route shell became the default. Explicit product pages (dashboard, modules, customize, workflows, automations, audit, export, trash, settings, members, landing-pages) coexist with the dynamic shell.
- **Pack-aware permission groups.** Added in v0.3.6 — packs declare permission groups like `sales_admin`, `sales_agent`, `sales_viewer`.
- **Cross-pack module sharing.** Packs reuse shared modules (company, contact, task) without duplication; terminology overlays relabel shared objects without forking them.

### Deferred to v0.4

Workspace page-level i18n migration (hardcoded strings in composite pages), mobile/responsive pass, accessibility pass, and public-page performance pass. These are mandatory inputs to v0.4 launch readiness.

## v0.2.x — Pack Foundation and Workbench

`v0.2` established the pack/module system and the operational workbench.

### What shipped

- **Pack foundation.** The pack as commercial delivery unit combining modules. Pack manifests with `modules`, `defaultTemplate`, `dashboard.defaultLayout`, and `onboardingChecklist`.
- **Shared module composition.** Multiple packs depend on the same shared business modules without duplicate install or navigation chaos (validated by `shared-business-consumer-pack`).
- **Terminology overlays.** Packs relabel shared objects (e.g. `company` → "Customer") without forking the object definition (v0.2.3).
- **Operational workbench.** Dashboard widgets across metrics, trends, lists, and activity zones; pack-specific workbench layouts for CRM, FSM, Sales Quote, Marketing, Customer Service, and After-sales.
- **Official pack portfolio.** CRM Lite, FSM, Sales Quote, Marketing Capture, Customer Service, After-sales, and the exploratory AI Visibility / GEO Seed Pack.

## v0.1.0 — Cloud Early Access

`v0.1.0` moved Runory from proof of concept into controlled Cloud Early Access. The full release definition, acceptance matrix, and required end-to-end scenarios are in [v0.1.0 Cloud Early Access](./releases/v0.1.0-cloud-early-access.md).

### Release thesis

> Runory has the first complete Cloud baseline to safely host Organizations/Workspaces, manufacture and release Modules/Packs/Templates, extend business capability through governed Agents, and continuously upgrade without breaking user data or Workspace Extensions.

It was not feature-complete 1.0 and not large-scale GA.

### Target users

Internal platform engineering/operations, invited early SMB trial customers, and design partners validating CRM Lite. Invite-only Early Access with the `early_access` entitlement. No production-grade SLA. No third-party module publishing.

### Canonical v0.1 journey

```text
Email OTP → Organization + default Workspace → Cloud UI
→ install CRM Lite Pack from Stable Catalog
→ create/view Customer and Contact data
→ Agent proposes a Customer custom field
→ user reviews Diff and approves Apply
→ UI shows the new field; Audit records the operation
→ SDK toolchain builds and submits a new runory.customer version
→ platform validates and publishes the immutable artifact
→ workspace generates an Extension Compatibility Report
→ workspace admin approves the upgrade
→ data and Extensions remain usable
```

### What shipped

- **SaaS Core.** Passwordless Email OTP and server-side sessions; User/AuthIdentity, Organization, Workspace; membership and fixed RBAC; invitations and Owner invariant; unified RequestContext and tenant isolation; append-only audit; workspace API keys; versioned Platform Migration; `early_access` entitlement and anti-abuse quotas; workspace export/archive/restore/purge; managed database backup and recovery runbook.
- **Platform Runtime.** Metadata-driven Object/Field/View/Form; schema-driven UI; Module/Pack install runtime; Managed Workspace Extension plan/preview/apply/audit/rollback; module and Extension ownership boundary; governed API shared by UI and Agent.
- **Catalog & Release Control Plane.** Official/Internal immutable artifact registry; module/pack/template versions; structured validation runs and sandbox evidence; Internal/Beta/Stable channels; pack dependency resolver and frozen lock; workspace install/upgrade compatibility report; allowlisted rollout with pause and failure isolation; Platform Catalog Console and Workspace Module Center; human Release Manager approval for Stable.
- **Internal SDK Toolchain.** `@runory/sdk` typed manifest authoring; `runory validate/test/build --json`; install/upgrade/Extension fixture harness; reproducible artifact, provenance, checksum, and secret/path safety; `publish --channel internal` candidate adapter with no Stable bypass; Runory Module Skill.
- **Reference Business Capability.** `runory.customer`, `runory.contact`, `crm-lite-pack`, `small-business-crm` template; Customer/Contact CRUD; dashboard, navigation, empty/loading/error states; the Customer custom field Extension scenario.

### Explicit non-goals for v0.1

Team, custom roles, field/record ACL, OIDC/SAML/SCIM, third-party marketplace and publisher onboarding, Cloud code editor / arbitrary SQL editor, service accounts, advanced workflow runtime, seat/usage/add-on billing, public self-service paid signup, private/VPC/on-premise production delivery, data residency, per-tenant database, customer-managed encryption keys, SOC 2 / ISO 27001, formal SLA, and multi-region disaster recovery.

### Compatibility promise

- No silent loss of user business data.
- Published Catalog Versions are immutable.
- Platform Migrations remain traceable and replayable.
- Workspace Extension compatibility is visible before upgrade.
- Breaking Module upgrades never auto-execute.
- API and Manifest may evolve, but breaking changes carry a version and migration note.

## Feedback

Runory is free during the v0.4 public preview. If you hit a problem, capture the request ID and check [Troubleshooting](./troubleshooting.md). Release notes, the changelog, known limitations, and a feedback path are part of the v0.4 release assets.
