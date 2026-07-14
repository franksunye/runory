# Runory Documentation

> The governed entry point for Runory product, architecture, operations, release, and historical documentation.

| Metadata | Value |
| --- | --- |
| Status | `canonical` |
| Topic | `documentation-governance` |
| Applies to | `v0.5+` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-14 |

Runory has accumulated detailed product definitions, technical specifications, implementation plans, runbooks, and release evidence. This page provides the navigation and lifecycle layer above those files. Existing files remain in place so that links and history are preserved.

## Start Here

| Need | Start with | Then read |
| --- | --- | --- |
| Understand Runory | [Product Definition](product/product-definition.md) | [Concepts](concepts.md), [Architecture Overview](architecture/overview.md) |
| Start using Runory | [Getting Started](getting-started.md) | [Workspace Guide](workspace-guide.md), [Packs and Modules](packs-and-modules.md) |
| Understand the platform | [Architecture Overview](architecture/overview.md) | [Module Architecture](architecture/module-architecture.md), [Repository Structure](architecture/repository-structure.md) |
| Build or extend Runory | [SDK / Module Development](sdk-module-development.md) | [Module SDK](sdk/module-sdk.md), [Workspace Extension Architecture](architecture/workspace-extension-architecture.md) |
| Operate Runory | [Operations Runbooks](operations/runbooks.md) | [Backup / Restore Runbook](operations/backup-restore-runbook.md), [Troubleshooting](troubleshooting.md) |
| Review releases | [Release Notes](release-notes.md) | [Release evidence](releases/) |

## Topic Index

### 1. Product

**Authority:** [Product Definition](product/product-definition.md)

Current and forward-looking product material:

- [Product Definition](product/product-definition.md) — canonical product boundary and positioning.
- [Post-v0.5 Product Milestone Roadmap](product/post-v0.5-product-milestone-roadmap.md) — active milestone sequence.
- [v1.0 GA Release Goal](product/v1.0-ga-release-goal.md) — proposed GA target.
- [Commercial FSM Customer Demand Benchmark](research/commercial-fsm-customer-demand-benchmark.md) — supporting research.

Versioned iteration plans are useful implementation history, but they do not override the Product Definition or a newer active specification.

### 2. User & Workspace

**Authority:** [Getting Started](getting-started.md) and [Workspace Guide](workspace-guide.md)

- [Getting Started](getting-started.md) — canonical onboarding journey.
- [Workspace Guide](workspace-guide.md) — active workspace operation guide.
- [Admin / Governance](admin-governance.md) — administration, audit, members, RBAC, and export.
- [Troubleshooting](troubleshooting.md) — active recovery guidance.
- [Cloud-to-Local Workspace](architecture/cloud-to-local-workspace.md) — architecture for portability and deployment choice.

### 3. FSM

**Authority:** [FSM Canonical Execution Product Architecture](product/fsm-canonical-execution-product-architecture.md)

- [FSM Canonical Execution Product Architecture](product/fsm-canonical-execution-product-architecture.md) — canonical product blueprint.
- [v0.5 Commercial FSM Technical Spec](product/v0.5-commercial-fsm-technical-spec.md) — current technical baseline.
- [v0.5.1 Commercial FSM Productization Technical Spec](product/v0.5.1-commercial-fsm-productization-technical-spec.md) — active productization specification.
- [v0.5.1 Mobile Field Work Spec](product/v0.5.1-mobile-field-work-spec.md) — mobile field-work experience.
- [FSM Owner Single-role E2E Acceptance Runbook](product/fsm-owner-single-role-e2e-acceptance-runbook.md) — active acceptance procedure.
- [FSM Owner E2E Run — 2026-07-14](releases/fsm-owner-e2e-run-2026-07-14.md) — release evidence.
- [FSM Pack Plan](product/fsm-pack-plan.md) and [v0.5 Commercial FSM Execution Plan](product/v0.5-commercial-fsm-execution-plan.md) — implementation and historical planning context.

### 4. Platform & Extensibility

**Authority:** [Architecture Overview](architecture/overview.md)

- [Architecture Overview](architecture/overview.md) — canonical platform overview.
- [Module Architecture](architecture/module-architecture.md) — module boundaries and composition.
- [Workspace Extension Architecture](architecture/workspace-extension-architecture.md) — governed workspace customization.
- [Agent Operations](agent-operations.md) — plan, preview, apply, audit, and rollback.
- [SDK / Module Development](sdk-module-development.md) — active authoring guide.
- [Module SDK](sdk/module-sdk.md) — SDK reference.
- [v0.5 Layered Architecture Review](architecture/v0.5-layered-architecture-review.md) — architecture review and supporting rationale.
- [Performance Optimization Plan](architecture/performance-optimization-plan.md) — proposed optimization work; indexed here to prevent isolation.

### 5. Command, Workflow & Forms

**Authority:** [Contract-driven Command Architecture](architecture/contract-driven-command-architecture.md)

- [Contract-driven Command Architecture](architecture/contract-driven-command-architecture.md) — canonical command and mutation architecture.
- [Workspace Extension Architecture](architecture/workspace-extension-architecture.md) — governed customization boundary.
- [v0.5 Commercial FSM Technical Spec](product/v0.5-commercial-fsm-technical-spec.md) — lifecycle implementation example.
- [v0.5.1 Mobile Field Work Spec](product/v0.5.1-mobile-field-work-spec.md) — form and workflow behavior in field use.
- [Post-v0.5 Product Milestone Roadmap](product/post-v0.5-product-milestone-roadmap.md) — current stabilization and next-step context.

New command, workflow, form, or customization documents must link back to this topic and explicitly state whether they supersede an existing specification.

### 6. Identity & Access

**Authority:** [Admin / Governance](admin-governance.md)

- [Admin / Governance](admin-governance.md) — active identity, membership, RBAC, audit, and export guide.
- [Architecture Overview](architecture/overview.md) — platform context.
- [Workspace Guide](workspace-guide.md) — user-facing workspace behavior.

### 7. Packs, Catalog & SDK

**Authority:** [Packs and Modules](packs-and-modules.md)

- [Packs and Modules](packs-and-modules.md) — canonical user-facing model.
- [Concepts](concepts.md) — definitions for SaaS Core, Module, Pack, Template, Extension, Agent Operation, and Catalog.
- [SDK / Module Development](sdk-module-development.md) — active authoring guide.
- [Module SDK](sdk/module-sdk.md) — SDK specification.
- [FSM Pack Plan](product/fsm-pack-plan.md) — domain Pack example.

SDK POC and customer validation reports belong under **evidence**, not as normative SDK specifications.

### 8. Operations

**Authority:** [Operations Runbooks](operations/runbooks.md)

- [Operations Runbooks](operations/runbooks.md) — canonical operations entry.
- [Backup / Restore Runbook](operations/backup-restore-runbook.md) — active resilience procedure.
- [Troubleshooting](troubleshooting.md) — active diagnosis and recovery guide.

Drill reports are release or operational evidence. They should link to the runbook they validate and remain separate from the normative procedure.

### 9. Releases & Evidence

**Authority:** [Release Notes](release-notes.md)

- [Release Notes](release-notes.md) — canonical release history.
- [Release evidence directory](releases/) — test reports, E2E runs, drill results, and release validation artifacts.
- [FSM Owner E2E Run — 2026-07-14](releases/fsm-owner-e2e-run-2026-07-14.md) — indexed evidence example.

Evidence documents record what happened at a point in time. They must not silently become current product or architecture specifications.

### 10. Historical Plans

The numbered documents in the `docs/` root and versioned v0.1–v0.4 plans preserve product and architecture evolution. They are valuable context but are not current authority unless a canonical or active document explicitly references them.

Representative historical material:

- [Vision](02-vision.md)
- [Architecture](03-architecture.md)
- [Cloud-first Architecture Pivot](04-architecture-pivot-cloud-first.md)
- [Cloud-first POC Progress](05-cloud-first-poc-progress.md)
- [Next Steps Roadmap](06-next-steps-roadmap.md)
- [SaaS Core Implementation Plan](08-saas-core-implementation-plan.md)
- [v0.2 Productization Plan](product/v0.2-productization-plan.md)
- [v0.3 Iteration Spec](product/v0.3-iteration-spec.md)
- [v0.4 Public Free Launch Plan](product/v0.4-public-free-launch-plan.md)

## Documentation Lifecycle

Every new normative or operational document should include the following metadata immediately below its title:

```text
Status: canonical | active | proposed | historical | evidence
Topic: product | workspace | fsm | architecture | customization | identity | catalog | operations | releases
Applies to: v0.5+
Owner: Product | Engineering | Operations
Last reviewed: YYYY-MM-DD
Supersedes:
Superseded by:
```

### Status definitions

| Status | Meaning |
| --- | --- |
| `canonical` | Current authoritative source for a topic. Prefer one canonical document per bounded topic. |
| `active` | Current guide, runbook, or implementation specification used in practice. |
| `proposed` | Design or plan not yet adopted as the current baseline. |
| `historical` | Retained for context; no longer directs current implementation or operations. |
| `evidence` | Point-in-time test, drill, acceptance, migration, or release record. |

## Governance Rules

1. Start from this index and identify the topic authority before adding a new document.
2. Do not create a second canonical source for the same bounded topic. Update or explicitly supersede the existing source.
3. Versioned plans and TODOs default to `proposed`; completed release and test reports default to `evidence`.
4. When implementation adopts a proposal, update its status and the relevant topic index in the same pull request.
5. Historical documents remain available, but should not appear in primary onboarding paths without a historical label.
6. Every important document must be linked from this page, a topic authority, or a directly related document.
7. Moving or renaming existing documents requires a separate migration PR with link validation; navigation improvements should not be coupled to mass file moves.

## Maintenance Checklist

For documentation pull requests:

- [ ] Select a `Topic` and `Status`.
- [ ] Link the document from the appropriate topic above.
- [ ] Identify the canonical source it supports or supersedes.
- [ ] Add `Supersedes` / `Superseded by` when authority changes.
- [ ] Keep evidence separate from normative specifications.
- [ ] Verify relative Markdown links.
- [ ] Update `Last reviewed` when materially reviewing a canonical or active document.
