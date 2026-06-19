# Runory Architecture Decision Record

Status: Draft v0.2  
Date: 2026-06-18  
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

## Deprecated / Historical

The following decisions from v0.1 are **deprecated** by this pivot:

* Local-first as default product assumption.
* Local-to-Cloud as primary user upgrade narrative.
* Codex App / local MCP as default SMB entry.
* Local SQLite workspace as primary persistence model.

Historical Local V1 prototype code remains in the repository as Portable Runtime reference per [../01-poc-execution-plan.md](../01-poc-execution-plan.md).
