# Runory Architecture Narrative

Status: Draft v0.3
Date: 2026-06-22
Change: Cloud-first pivot — see [04-architecture-pivot-cloud-first.md](04-architecture-pivot-cloud-first.md)

## 1. Product Definition

Runory is a **Cloud-first**, Agent-native SMB business operations platform.

Ordinary users sign up through Runory Cloud, create Workspaces, select Business Packs / Templates, and use the Built-in Agent to complete configuration, operations, and analysis.

Runory's core shape is:

```text
Runory Cloud
+ Platform Core
+ Official Modules
+ Business Packs / Workspace Templates
+ Managed Workspace Extensions
+ Built-in Agent Configuration Layer
+ Optional Private / Local Deployment
```

Runory is not vertical-industry software. It is a **composable business operations platform** — close to WordPress for the SMB era, but operated by an Agent inside a governed structure.

## 2. Overall Architecture

```text
Personal Agent OS
Codex / Claude / TRAE / Cursor (advanced channel)
        |
        | Built-in Agent / Skills / MCP
        v
Runory Cloud
  Auth / Billing / Workspace / Hosting
        |
        v
Runory Core (Platform Kernel)
  Object / Field / View / Form / Workflow / ACL
  Event / Audit / Module Lifecycle / Extension Boundary
        |
        v
Runory Module System
  Schema / UI / Forms / Actions / Skills / Migrations
        |
        v
Business Packs / Workspace Templates
  CRM / Finance / Field Service / etc.
        |
        v
Managed Workspace Extensions
  Custom Field / View / Workflow / Rule / Dashboard / Agent Skill
        |
        v
Effective Business App
  Cloud UI Shell + Schema-driven Views + User Data
        |
        v
Optional Private Cloud / Local Runtime
  Enterprise / Compliance / Offline
```

## 3. Layer Responsibilities

### Personal Agent OS (advanced channel)

Agents such as Codex and Cursor connect to Runory through MCP / SDK, for:

* developers and integrators;
* private deployment environments;
* advanced automation and batch operations.

**Codex / MCP is not the default entry point for ordinary SMB users.** Ordinary users use Runory Cloud UI + Built-in Agent.

The Agent understands intent, recommends Packs, generates configuration plans, and calls governed APIs, but does not directly modify the database or official Module source.

### Runory Cloud

Runory Cloud is the default product entry point and is responsible for:

* Multi-tenant Workspace hosting;
* Auth / Organization / User / Role;
* Billing-ready Account Model;
* Module Registry and Install Runtime;
* Workspace Configuration Store;
* Built-in Agent runtime environment;
* Cloud UI Shell;
* Usage Metering;
* data import and basic Marketplace Readiness.

### Runory Core

Runory Core is a stable, general-purpose, low-change platform kernel.

Core is **not responsible for specific industry business logic**. It is responsible for:

```text
Workspace / Organization
User / Role / Permission
Object Model / Field Model / Relation Model
View Model / Form Model
Workflow Runtime / Action Runtime
Event Bus / Audit Log
Module Lifecycle / Extension Boundary
Agent Permission Boundary
API / Webhook / MCP Interface
```

In one sentence:

> Core is not responsible for "how a certain type of company operates"; Core is responsible for "how business capabilities are defined, installed, composed, extended, upgraded, and run."

This is similar to WordPress Core: WordPress Core does not decide what website a user builds; Runory Core does not decide what business a user runs.

### SaaS Core Boundary

Runory Cloud's SaaS Core uses the following boundaries:

```text
Email OTP + Server Session
→ Organization (tenant / ownership / membership / billing)
→ Workspace (business data / module / extension / audit)
→ RequestContext + Authorized Service
→ Repository / Turso-libSQL
```

- One User can join multiple Organizations; one Organization can own multiple Workspaces.
- Organization roles are `owner/admin/member`; Workspace roles are `admin/member/viewer`.
- Current authorization uses direct Workspace Membership; Team is reserved architecturally and does not enter the current product.
- All HTTP, MCP, Agent, Webhook, and background jobs must go through the same RequestContext and authorization policy.
- The current design uses a shared database, shared tables, and enforced `workspace_id` isolation.
- Plan, Entitlement, Usage, and Billing are separated; business modules must not directly check plan names.

For the full boundary and acceptance definition, see [07-saas-core-boundaries.md](07-saas-core-boundaries.md). For the implementation order, see [08-saas-core-implementation-plan.md](08-saas-core-implementation-plan.md).

### Official Business Modules

Official Modules are complete business capability units, not simple pages or feature bundles. Each Module contains at minimum:

```text
Schema / Objects / Fields / Relations
Views / Forms / Permissions
Workflows / Actions / Rules / Events
Agent Skills / Dashboards
Migrations / Seed Data / Upgrade Policy / Documentation
```

Modules are installed, run, and upgraded through Runory Core. Module source is read-only for users.

Production Module/Pack/Template lifecycle is managed by an independent Catalog & Release Control Plane. Git/CI generates immutable artifacts; Cloud Registry handles structured validation, Sandbox, Internal/Beta/Stable release, dependency lock, Workspace upgrade, and rollout. Platform UI and Agent share governed commands, and Stable release must be approved by a platform Release Manager. See [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md).

Runory SDK is the local developer product entry for manufacturing business capabilities. It provides typed authoring, validation, testing, artifact build, and Internal candidate publish; it does not expose SaaS Core private repositories and cannot bypass Catalog release governance. See [10-runory-sdk-product.md](10-runory-sdk-product.md).

### Business Packs and Workspace Templates

Three delivery layers must be explicit:

```text
Module     = technical install unit (Expense, Approval, Budget…)
Pack       = commercial delivery unit (Finance Operations Pack, CRM Lite Pack…)
Template   = Workspace experience entry (navigation, homepage, terminology, default views, role entry)
```

Standard layering:

```text
Runory Core → Modules → Business Packs → Workspace Templates → Workspace Extensions
```

### Managed Workspace Extensions

Workspace Extension is a declarative extension layer bound to a specific Workspace. User personalization must **not** directly fork or rewrite official Modules.

Allowed governed extensions:

```text
Custom Field / Object / Relation
Custom View / Form / Workflow / Rule
Custom Dashboard / Agent Skill / UI Slot / Report / Notification
```

Ordinary users or default Agents are not allowed to directly modify:

```text
Runory Core / Official Module Source
System Migration Logic / Cross-tenant Runtime
Security Boundary / Billing Logic / Module Dependency Resolver
```

For detailed rules, see [architecture/workspace-extension-architecture.md](architecture/workspace-extension-architecture.md).

### Agent Configuration Layer

Agent is the **Runory Workspace Operator**. Its responsibilities include:

```text
Understanding business needs / recommending Modules and Packs
Workspace configuration / field extension / workflow adjustment
Permission configuration / Dashboard generation / data import assistance
Exception analysis / runtime verification / change explanation / upgrade impact analysis
```

Agent operations must go through governed APIs. Each step goes through:

```text
Permission Check → Diff Preview → Approval (if needed) → Apply → Validate → Audit Log → Rollback Point
```

## 4. Two Core Runtime Chains

### Data-change chain

```text
User provides information
→ Agent understands and extracts it
→ Agent Operation API / MCP Tool
→ Business Engine
→ Cloud Database (or Portable Runtime DB)
→ Business Event
→ SSE / Query Refresh
→ UI lists, KPIs, and charts update in real time
```

### Capability-change chain

```text
User proposes a new capability need
→ Agent recommends Pack / Module / Extension Plan
→ Module Installer or Extension Apply
→ Migration + Manifest registration
→ Register Tools, Views, Navigation, Workflows
→ UI automatically adds menus and pages
```

**"Dynamic capability" = installing a preset Module / Pack or applying a governed Extension**, not generating production code at runtime.

## 5. UI Architecture

UI uses **Schema-driven UI + Composable Layout + UI Slots + Workspace Template**.

Module declares:

```text
Object Detail Layout / List View / Form Sections
Dashboard Widgets / Action Panels / Navigation Items / UI Slots
```

Workspace Template determines the overall experience:

```text
Navigation / Homepage / Dashboard
Role-based entry / Terminology / Default views / Mobile layout
```

Runory Theme is upgraded into **Workspace Experience Template**, not just color and visual skin.

## 6. Data Architecture

Runory uses a **metadata-driven business object model**.

Core abstractions:

```text
ObjectDefinition / FieldDefinition / RelationDefinition
ViewDefinition / FormDefinition / WorkflowDefinition / PermissionDefinition
```

Field ownership must be explicit:

```text
Core-owned Field      → e.g. created_at
Module-owned Field    → e.g. Customer.name
Workspace Extension   → e.g. Customer.vip_level
Agent-generated       → e.g. Customer.ai_score (Computed)
```

Cloud Runtime defaults to:

```text
Turso/libSQL + Object Storage + Queue / Async Jobs
```

Portable Runtime (Local / Private) can use SQLite + Local Files, abstracting cloud-service dependencies through Adapters.

All writes must go through Runory Business Engine.

All business reads must also go through Authorized Service while constraining both Workspace scope and resource ID. Cache, files, events, and async tasks are also within tenant-isolation scope; protecting SQL alone is not enough.

## 7. MCP and Codex Positioning

```text
Ordinary users: Runory Cloud UI + Built-in Agent
Advanced users / developers: Codex / MCP / SDK
Enterprise users / private deployment: Private Runtime + MCP + Controlled Agent
```

MCP is one of Runory's open operation protocols, with the same permission model as the internal Cloud Agent. MCP may expose APIs for Workspace Management, Module Registry, Object Schema, Workflow, Audit, and similar surfaces, but **must not** expose database Root permission, Core source modification permission, or cross-tenant access capability.

## 8. Local / Private Deployment

Local is no longer the default MVP experience. It is **Enterprise / Advanced Deployment Mode**.

Applicable scenarios: data compliance, private network, industry regulation, offline use, customers with existing IT teams, or need for local databases or private models.

Architecture requirement: **Cloud-first Product, Portable Runtime Architecture**:

```text
Core runtime can run independently
Module manifest / Migration are standardized
Workspace config / Extension can be exported
Audit can be exported / Agent skill can be declared
Auth / Storage / Queue / LLM / Email / Payment / Search Adapter
```

See [architecture/cloud-to-local-workspace.md](architecture/cloud-to-local-workspace.md).

## 9. Core Design Principles

1. **Cloud-first, Portable-runtime** — Cloud is the default entry point; Runtime must be portable.
2. **Core must stay small** — business capabilities belong to Modules; composition belongs to Packs; differences belong to Extensions.
3. **No direct module customization** — official Modules remain upgradable; Extensions handle personalization.
4. **Agent through governed APIs** — Agent does not directly modify code or databases.
5. **Metadata-driven objects** — business data runs on Object / Field definitions.
6. **Schema-driven UI** — Modules declare UI Slots; Templates determine experience.
7. **Marketplace-ready** — Manifest, version, dependency, permission, and migration are reserved from day one.
8. **Event-driven UI** — data changes drive UI through events; API data is the source of truth.
9. **Upgrade-safe** — Core, Module, and Extension are versioned separately; compatibility checks and backups run before upgrades.

## 10. Final Formula

```text
Runory
=
Runory Cloud (default)
+ Platform Core
+ Official Modules
+ Business Packs / Workspace Templates
+ Managed Workspace Extensions
+ User Data
+ Optional Private / Local Deployment
```

Runory is essentially:

> A Cloud-first SMB business operations platform, configured by Agents through governed APIs, executed by a deterministic Platform Core, extended through Modules / Packs, and safely customizable by users.
