# Concepts

Runory is a Cloud-first, Agent-native SMB business platform. It is built from composable layers: a stable Platform Core, official Modules, business Packs, Workspace Templates, and Managed Workspace Extensions — all operated through governed Agent APIs.

This page defines the core concepts and how they relate. For the end-to-end architecture, see [Architecture Overview](./architecture/overview.md). For a hands-on walkthrough, start with [Getting Started](./getting-started.md).

## SaaS Core

The **SaaS Core** is the multi-tenant cloud substrate. It owns identity, tenancy, authorization, audit, and lifecycle:

```text
Email OTP → User/AuthIdentity → Organization → Workspace
→ RequestContext/Authorization → Business Data
```

- **Organization** is the tenant, ownership, membership, and (future) billing boundary.
- **Workspace** is the business data and configuration boundary.
- A unified **RequestContext** enforces tenant isolation across HTTP, MCP, Agent, and Job entry points.

The SaaS Core does not own industry-specific business logic — that lives in Modules and Packs.

## Module

A **Module** is the technical install unit. It is a complete business capability bundle: schema, objects, fields, views, forms, permissions, workflows, agent skills, migrations, and UI slot declarations.

- Official modules are **read-only from the workspace perspective**. You do not fork or edit module source to customize.
- Modules declare compatible Platform Core ranges and extension points.
- Module upgrades must preserve compatible Workspace Extensions.

Example module identifiers: `runory.company`, `runory.contact`, `runory.work-order`, `runory.quote`.

## Pack

A **Pack** is the commercial delivery unit. It combines one or more modules into a business outcome you can install into a workspace.

- Packs can share modules without duplicating them. For example, `crm-lite-pack` and `fsm-pack` both reuse `runory.company` and `runory.task`.
- A pack can apply a **terminology overlay** — relabeling a shared object (e.g. calling `company` "Customer") without forking the object definition.
- Packs declare a default template, dashboard layout, onboarding checklist, and (optionally) permission groups.

See [Packs and Modules](./packs-and-modules.md) for the full pack list.

## Template

A **Template** defines the workspace experience: navigation, homepage, terminology, and role entry. When you install a pack, its `defaultTemplate` shapes how the workspace looks and reads.

A template is the entry surface, not a code fork. It composes module UI slots and pack overlays into a coherent experience.

## Workspace Extension

A **Managed Workspace Extension** is a first-class, auditable configuration layer bound to a workspace. Extensions add custom fields, views, workflows, rules, dashboards, and agent skills **without modifying official module source**.

Rules:

- Extensions must not modify official module source code.
- Extensions must not bypass the Business Engine.
- Extensions are versioned, auditable, schema-validated definitions.
- Core composes Module manifests and Extension manifests at runtime.
- Module upgrades must preserve compatible Extensions.
- Agent apply always supports Diff, Audit, and Rollback.

Extensions are how every customization — whether from the in-product UI or an external Agent — reaches the runtime. See [Agent Operations](./agent-operations.md).

## Agent Operation

An **Agent Operation** is a governed change proposed by the Built-in Agent or an external Agent (via MCP/SDK) and applied through the same governed APIs the Cloud UI uses.

The operation contract is:

```text
discover → plan → validate → preview → apply → verify → audit → rollback where possible
```

The Agent never directly operates the database and never modifies official module source. Every apply records who, through which entry, which API, what changed, before/after, confirmation status, and a rollback point.

Operations are risk-classified:

- **Low-risk**: query, non-required custom field, display settings.
- **Medium-risk**: required field, workflow, module install, automation.
- **High-risk**: delete, permission change, batch migration, field type change, payment.

See [Agent Operations](./agent-operations.md) and [MCP / Skill Usage](./mcp-skill-usage.md).

## Catalog

The **Catalog** is the immutable release control plane. Production capabilities are distributed through immutable Cloud Catalog Versions, not mutable working-tree files.

The catalog tracks:

- Module, Pack, and Template versions with checksums and provenance.
- Structured validation runs and sandbox evidence.
- Internal / Beta / Stable release channels.
- Frozen pack dependency locks.
- Workspace install/upgrade compatibility reports.
- Allowlisted rollout with pause and failure isolation.

Stable promotion requires a human Release Manager approval. The CLI can only publish to the `internal` channel — it cannot bypass to Stable. See [SDK / Module Development](./sdk-module-development.md).

## Workflow / Automation

- **Workflow** — a metadata-defined process bound to objects (states, transitions, guards). The workflow runtime executes inside the Platform Core.
- **Automation** — a triggered action or scheduled rule that calls governed APIs. Automations are inspected and run through the workspace automation surface.

Both are governed: changes go through plan/preview/apply, produce audit events, and respect the Agent permission boundary.

## How the layers relate

```text
Effective App =
  Platform Core
  + Official Modules
  + Business Packs / Workspace Templates
  + Managed Workspace Extensions
  + User Data
```

```text
Module     = technical install unit
Pack       = commercial delivery unit
Template   = workspace experience entry
Extension  = workspace-specific customization (managed, auditable)
```

The runtime composes these at request time. Agents propose changes to the Extension layer (and pack/template selection); they do not rewrite Core or Module source.

## What Runory is not

To set expectations honestly:

- Not an AI coding tool — the Agent does not generate a custom app from scratch.
- Not a traditional low-code drag-and-drop builder — the UI is schema-driven and constrained.
- Not a general ERP — Runory starts from composable SMB workflows.
- Not a Local-first system where users edit module source.
- Not a product that requires Git, MCP setup, or local installation for ordinary SMB users (those are advanced paths).

See [Release Notes](./release-notes.md) for what is stable versus preview today.
