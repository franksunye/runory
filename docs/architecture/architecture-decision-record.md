# Runory Architecture Decision Record

Status: Draft v0.3
Date: 2026-06-22
Change: Cloud-first pivot — see [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)

This document records architecture decisions that should not change casually. If a future implementation needs to break one, it should add a new ADR entry explaining the replacement decision and migration impact.

## ADR-001: Runory Cloud UI is the default product surface

Runory serves the primary UI through Runory Cloud. Localhost UI in Portable Runtime is for development, private deployment, and export validation—not the default SMB experience.

Supersedes: localhost Web UI as primary product surface (ADR-001 v0.1 intent).

## ADR-002: Cloud data uses Turso/libSQL; Local development uses SQLite through the same client

Runory Cloud stores structured data in Turso/libSQL. Local development and the early Portable Runtime use SQLite through the same `@libsql/client` interface with a `file:` URL. This keeps SQL semantics and the async persistence path consistent across Cloud and Local while retaining a future adapter boundary if an enterprise deployment requires another database.

Required production variables: `LIBSQL_URL` and `LIBSQL_AUTH_TOKEN`.

Supersedes: ADR-002 v0.2 (PostgreSQL as the mandatory Cloud database).

## ADR-003: Agents do not directly access the database

Agents operate Runory through Built-in Agent APIs, Agent Operation APIs, Skills, and MCP Tools. They must not directly read or write databases as a business operation path.

## ADR-004: All writes go through the Business Engine / Platform Core

MCP handlers, HTTP routes, UI actions, Agent apply endpoints, modules, and extensions must route write operations through the same deterministic Business Engine.

## ADR-005: Official modules are not directly editable

Official Business Modules are versioned, read-only business capability packages. Workspace-specific changes must be implemented as Managed Workspace Extensions.

## ADR-006: Workspace customization uses Managed Workspace Extensions

User-specific fields, views, workflows, rules, metrics, automations, actions, and skills are represented as versioned, auditable, schema-validated Workspace Extensions—not module source edits.

## ADR-007: Dynamic UI uses declarative schemas and UI Slots

Agents may generate View Schema or Extension proposals. Runory validates schemas and renders approved components within Module-declared UI Slots and Template layouts. Agents do not directly generate and execute arbitrary React production code.

## ADR-008: Core, modules, packs, extensions, and schemas are versioned separately

Runory tracks:

```text
Platform Core Version
Module Version
Pack Version
Template Version
Workspace Extension Version
Schema Version
```

Upgrades must check compatibility across these versions.

## ADR-009: Upgrade defaults protect the current working system

Default upgrade behavior:

* preserve user data;
* create rollback points before risky changes;
* block incompatible upgrades;
* report extension conflicts;
* leave the current runnable version unchanged if migration fails.

## ADR-010: Actions are governed by risk level with Diff and Rollback

Runory classifies operations into low, medium, and high risk. Medium and high risk operations require preview (Diff), confirmation, audit, and rollback support.

## ADR-011: Metadata-driven canonical objects prevent duplicate domain models

Business data runs on ObjectDefinition / FieldDefinition metadata. The same business concept should have one authoritative object. Modules extend canonical objects; Extensions add namespaced fields—not parallel undocumented tables.

## ADR-012: Module installation activates trusted capability, not arbitrary generated software

Installing a module or pack registers trusted manifests, migrations, tools, views, navigation, events, permissions, and extension points. It does not load arbitrary Agent-generated application code.

## ADR-013: Cloud-first is the default product entry; Private / Local is advanced deployment

Runory Cloud is the default entry for SMB users. Private Cloud, VPC, On-premise, and Local Runtime are advanced deployment modes—not the MVP onboarding path.

Supersedes: ADR-013 v0.1 (Local workspace promoted to Cloud as primary evolution path).

## ADR-014: Bidirectional Cloud sync is deferred; export/import is preferred

Runory should not start with bidirectional sync. Preferred advanced path: Cloud Workspace export → Private / Local import.

Supersedes: ADR-014 v0.1 (Cloud Backup first, then one-time migration **from Local to Cloud** as preferred path). New preferred direction: Cloud → Export → Private / Local when needed.

## ADR-015: Portable Runtime architecture preserves deployment portability

Cloud development must use stable workspace IDs, entity IDs, record IDs, module/pack versions, extension versions, schema versions, migration records, file hashes, audit logs, and adapter abstractions so Cloud → Private / Local export remains possible.

Supersedes: ADR-015 v0.1 (Local architecture preserves future Cloud migration). Scope expanded to bidirectional portability with Cloud as source of truth for default users.

## ADR-016: Cloud-first product, Portable Runtime architecture

Product experience is Cloud-first. Runtime architecture must be deployable independently via adapters—supporting Cloud, Private Cloud, VPC, On-premise, and Local Dev without forking Core or Module models.

## ADR-017: Module / Pack / Template are distinct delivery layers

* **Module** = technical install unit.
* **Pack** = commercial delivery unit combining modules.
* **Template** = workspace experience entry (navigation, homepage, terminology, role entry).

Extensions apply at Workspace level atop installed modules.

## ADR-018: Built-in Agent is default; MCP is advanced channel

Ordinary SMB users interact through Runory Cloud UI and Built-in Agent. Codex / MCP / SDK serve developers, integrators, and Private deployment—with the same permission model as Built-in Agent.

## ADR-019: Agent is Workspace Operator, not code generator

Agent converts business intent into governed configuration changes (Extension plans, workflow definitions, pack recommendations)—not module source edits or direct schema mutations.

Required apply flow:

```text
Permission Check → Diff Preview → Approval（if needed）→ Apply → Validate → Audit → Rollback Point
```

## ADR-020: Marketplace readiness from day one

Even without a full Marketplace in MVP, Module Manifest must include: id, version, coreCompatibility, dependencies, objects, permissions, workflows, events, agentSkills, migrations, ui slots, upgradePolicy, uninstallPolicy, and marketplace metadata hooks.

## ADR-021: Workspace Template defines product experience, not just theme

Templates control navigation, homepage, dashboard layout, role-based entry, terminology, default views, and mobile interaction—not only colors and typography.

## ADR-022: Core must stay small

Platform Core owns workspace platform capabilities (object model, workflow runtime, audit, module lifecycle, extension boundary)—not industry-specific business logic. Business logic belongs to Modules and Packs.

## ADR-023: Early authentication uses passwordless Email OTP

Runory owns User, AuthIdentity, OTP challenge, server-side Session, and authorization models. Email delivery uses an external provider. Passwords, social OAuth, MFA, and enterprise SSO are deferred.

## ADR-024: Organization is the tenant; Workspace is the business data boundary

Organization owns membership, security, Billing, Entitlement, and one or more Workspaces. Workspace owns business records, modules, extensions, files, events, and audit scope. A Workspace belongs to exactly one Organization.

## ADR-025: Team is deferred but the authorization model remains principal-ready

Current access uses direct User-to-Workspace Membership. A future Team may group Organization users and receive Workspace grants, but it will not become a tenant, billing, or data ownership boundary.

## ADR-026: SaaS authorization uses fixed RBAC and a server-derived RequestContext

Organization roles are `owner/admin/member`; Workspace roles are `admin/member/viewer`. HTTP, MCP, Agent, Webhook, and background jobs must derive identity and tenant scope on the server and pass through the same Authorization Policy and Authorized Service layer.

## ADR-027: Shared tables use mandatory Workspace isolation

Early Cloud uses shared Turso/libSQL tables with mandatory `workspace_id` scoping. Record lookup, unique constraints, cache keys, files, events, exports, and jobs must preserve tenant scope. Per-tenant databases and field/record ACL are deferred.

## ADR-028: Product access is entitlement-driven, not plan-name-driven

Plan, Entitlement, Quota, and Usage are separate concepts. Business modules ask the Entitlement Service for features and limits and do not branch on commercial plan names. Initial users receive an internal `early_access` entitlement.

## ADR-029: Stripe is the subscription source; Runory is the entitlement source

Stripe Billing, Checkout, Webhooks, and Customer Portal handle payment and subscription lifecycle. Runory maps the subscription to Organization Entitlements. Verified, idempotent Webhooks—not client redirects—change paid access.

## ADR-030: Schema migrations are immutable and versioned

Platform, Module, and Workspace Extension migrations are tracked separately. Published migration files are immutable and checksummed. Production schema changes run through deployment jobs and use expand-migrate-contract for destructive evolution.

## ADR-031: Production capabilities come from an immutable Cloud Catalog

Official/Internal Module, Pack, and Template source remains in Git, but production Workspace install and upgrade use immutable, checksummed Catalog Versions. Versions pass structured validation and Sandbox testing before Internal/Beta/Stable promotion. Pack releases freeze a resolved dependency lock. UI and Agent use the same governed release/install commands; Stable promotion requires an authorized human Release Manager.

Detailed specification: [../09-catalog-release-control-plane.md](../09-catalog-release-control-plane.md).

## ADR-032: Runory SDK is a developer product separated from private Platform Core

Runory SDK provides typed Module/Pack/Template authoring, validation, testing, artifact building, and Internal candidate publishing. Local validate/test/build works without Cloud; Cloud remains responsible for Registry validation, release approval, and rollout. Public SDK packages must not expose private repositories or database clients. Stable release has no SDK/CLI bypass.

Detailed specification: [../10-runory-sdk-product.md](../10-runory-sdk-product.md).

## ADR-033: Database namespaces express subsystem ownership

Tables use `sys_*` for database infrastructure, `saas_*` for reusable SaaS Core, `runory_runtime_*` for the Runory capability runtime, `runory_catalog_*` for the Catalog and release control plane, and `runory_business_*` for Module-owned business records. The former `platform_*` namespace is deprecated because it mixed portable SaaS primitives with Runory-specific subsystems.

Detailed specification: [database-namespaces.md](database-namespaces.md).

## ADR-034: English is the source and default product locale

Runory is internationalized from the first Cloud release. English (`en`) is the required source and default locale; Simplified Chinese (`zh`) is the first additional locale. Stable IDs, schema keys, APIs, and database values remain locale-neutral, while user-facing copy and Catalog presentation metadata use typed locale resources with field-level English fallback.

Detailed specification: [internationalization.md](internationalization.md).

## ADR-035: Governed business change is Contract-driven and Command-owned

Named Commands are the only entry point for governed business change. A
machine-readable Command Contract declares the aggregate transition, required
atomic capability effects, events, permissions, idempotency/version policy, and
postconditions. Command Runtime validates the Contract, resolves installed
providers, and commits all authoritative local effects in one transaction.

Workflow and Automation orchestrate Commands and may not bypass them with generic
field updates. External effects use Outbox; rebuildable read models use durable
projections. Module/Pack publication, installation, upgrade, and uninstall must
validate the complete Command/provider capability closure.

Detailed specification:
[contract-driven-command-architecture.md](contract-driven-command-architecture.md).

The complete SaaS rationale, deferred scope, and acceptance definition are maintained in [../07-saas-core-boundaries.md](../07-saas-core-boundaries.md).

## Deprecated / Historical

The following decisions from v0.1 are **deprecated** by this pivot:

* Local-first as default product assumption.
* Local-to-Cloud as primary user upgrade narrative.
* Codex App / local MCP as default SMB entry.
* Local SQLite workspace as primary persistence model.

Historical Local V1 prototype code remains in the repository as Portable Runtime reference per [../01-poc-execution-plan.md](../01-poc-execution-plan.md).
